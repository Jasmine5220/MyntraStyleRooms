const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
// Harden runtime: prevent crashes on unhandled errors (log and continue in dev)
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  allowEIO3: true,
  compression: true,
  maxHttpBufferSize: 1e6
});

// Attach Socket.io to app for use in routes
app.set('io', io);

// In-memory room browse state: roomId -> Map(socketId -> { userId, userName, productId, productTitle, productImage })
const roomBrowseState = new Map();
// In-memory active session state: roomId -> { active: boolean, host: string }
const activeSessions = new Map();
// In-memory follow state: roomId -> Map(followerUserId -> targetUserId)
const roomFollowState = new Map();
// In-memory session participants: roomId -> Set(userId)
const roomSessionParticipants = new Map();

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;
    const userName = socket.handshake.auth.userName;
    
    // For development, allow mock authentication
    if (token === 'mock-token') {
      socket.userId = userId;
      socket.userName = userName || 'You';
      socket.avatar = socket.handshake.auth.userAvatar;
      console.log(`🔌 Socket authenticated with mock user: ${socket.userName} (${userId})`);
      return next();
    }
    
    if (!token) {
      // For development, allow connection without token
      console.log('⚠️ No token provided, allowing connection in development mode');
      const userId = socket.handshake.auth.userId || 'dev-user-' + Math.random().toString(36).substr(2, 9);
      const userName = socket.handshake.auth.userName || 'Dev User';
      socket.userId = userId;
      socket.userName = userName;
      socket.avatar = socket.handshake.auth.userAvatar || 'https://ui-avatars.com/api/?name=' + userName.charAt(0) + '&background=4A90E2&color=FFFFFF&size=150';
      console.log(`🔌 Socket connected: ${userName} (${userId})`);
      return next();
    }
    
    // Verify JWT token
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Convert both IDs to strings for comparison
    const tokenUserId = decoded.id.toString();
    const socketUserId = userId.toString();
    
    if (tokenUserId !== socketUserId) {
      console.error('❌ Token user mismatch:', {
        tokenUserId,
        socketUserId,
        decoded: decoded
      });
      return next(new Error('Token user mismatch'));
    }
    
    // Attach user info to socket
    socket.userId = userId;
    socket.userName = userName;
    socket.avatar = socket.handshake.auth.userAvatar;
    
    console.log(`🔌 Socket authenticated for user: ${socket.userName} (${userId})`);
    next();
  } catch (error) {
    console.error('❌ Socket authentication error:', error.message);
    // For development, allow connection even with auth errors
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Development mode: Allowing connection despite auth error');
      socket.userId = socket.handshake.auth.userId || 'dev-user';
      socket.userName = socket.handshake.auth.userName || 'Dev User';
      next();
    } else {
      next(new Error('Authentication failed'));
    }
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.userName} (${socket.userId})`);
  
  // Store typing timeouts for cleanup
  const typingTimeouts = new Map();
  // Track session participants per roomId
  const getRoomParticipants = async (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    console.log(`🔍 Getting participants for room ${roomId}:`);
    console.log(`  - Room exists: ${!!room}`);
    console.log(`  - Room size: ${room ? room.size : 0}`);
    
    if (!room) return [];
    const participants = [];
    const seenUserIds = new Set(); // Track unique user IDs instead of socket IDs
    const sessionSet = roomSessionParticipants.get(roomId);
    
    console.log(`  - Room client IDs:`, Array.from(room));
    
    if (sessionSet && sessionSet.size > 0) {
      // Build participants primarily from session membership (userIds) present in room
      for (const userId of sessionSet) {
        // Find any socket for this user that is still in room
        let matchedSocket = null;
        for (const clientId of room) {
          const s = io.sockets.sockets.get(clientId);
          if (s && s.userId === userId) {
            matchedSocket = s;
            break;
          }
        }
        if (matchedSocket && !seenUserIds.has(userId)) {
          seenUserIds.add(userId);
          const browseMap = roomBrowseState.get(roomId);
          const current = browseMap ? browseMap.get(userId) : undefined;
          participants.push({
            userId: matchedSocket.userId,
            userName: matchedSocket.userName,
            avatar: matchedSocket.avatar,
            currentProduct: current ? {
              productId: current.productId,
              productTitle: current.productTitle,
              productImage: current.productImage
            } : null
          });
          console.log(`    ✅ Added session participant: ${matchedSocket.userName} (${matchedSocket.userId})`);
        }
      }
      // Include any additional users currently in the room who somehow were not in sessionSet
      for (const clientId of room) {
        const s = io.sockets.sockets.get(clientId);
        if (s && !seenUserIds.has(s.userId)) {
          seenUserIds.add(s.userId);
          const browseMap = roomBrowseState.get(roomId);
          const current = browseMap ? browseMap.get(s.userId) : undefined;
          participants.push({
            userId: s.userId,
            userName: s.userName,
            avatar: s.avatar,
            currentProduct: current ? {
              productId: current.productId,
              productTitle: current.productTitle,
              productImage: current.productImage
            } : null
          });
          console.log(`    ➕ Added in-room user not in sessionSet: ${s.userName} (${s.userId})`);
        }
      }
    } else {
      // Fallback: build from room sockets (legacy behavior)
      for (const clientId of room) {
        const s = io.sockets.sockets.get(clientId);
        console.log(`  - Client ${clientId}:`, s ? `${s.userName} (${s.userId})` : 'null');
        if (s && !seenUserIds.has(s.userId)) {
          seenUserIds.add(s.userId);
          const browseMap = roomBrowseState.get(roomId);
          const current = browseMap ? browseMap.get(s.userId) : undefined;
          participants.push({ 
            userId: s.userId, 
            userName: s.userName,
            avatar: s.avatar, 
            currentProduct: current ? {
              productId: current.productId,
              productTitle: current.productTitle,
              productImage: current.productImage
            } : null 
          });
          console.log(`    ✅ Added participant: ${s.userName} (${s.userId})`);
        } else if (s && seenUserIds.has(s.userId)) {
          console.log(`    ⚠️ Skipped duplicate user: ${s.userName}`);
        } else {
          console.log(`    ❌ Invalid socket for client ${clientId}`);
        }
      }
    }
    
    console.log(`👥 Final participants for room ${roomId}:`, participants.map(p => `${p.userName} (${p.userId})`));
    return participants;
  };

  // Centralized session cleanup function
  const cleanupSessionIfEmpty = async (roomId) => {
    try {
      // Check room size directly from socket.io adapter
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      
      console.log(`🔍 Checking session cleanup for room ${roomId}:`);
      console.log(`  - Room exists: ${!!room}`);
      console.log(`  - Room size: ${roomSize}`);
      console.log(`  - Active sessions has room: ${activeSessions.has(roomId)}`);
      
      if (roomSize === 0) {
        console.log(`🧹 Auto-ending session in room ${roomId} - no participants (room size: ${roomSize})`);
        
        // Clear session state
        activeSessions.delete(roomId);
        roomBrowseState.delete(roomId);
        roomFollowState.delete(roomId);
        
        // Update database
        try {
          const Room = require('./models/Room');
          await Room.findByIdAndUpdate(roomId, { 
            isLive: false, 
            sessionHost: null, 
            activeSessionId: null 
          });
          console.log(`✅ Database updated: room ${roomId} marked as not live`);
        } catch (dbError) {
          console.error(`❌ Database update failed for room ${roomId}:`, dbError);
        }
        
        // Notify all clients
        io.to(roomId).emit('session-ended', { roomId });
        io.to(roomId).emit('session-state', { active: false, roomId });
        
        return true; // Session was cleaned up
      }
      return false; // Session still has participants
    } catch (error) {
      console.error(`❌ Error during session cleanup for room ${roomId}:`, error);
      return false;
    }
  };
  
  // Handle joining rooms
  socket.on('join-room', async (roomId) => {
    console.log(`🚪 User ${socket.userName} (${socket.userId}) joining room: ${roomId}`);
    socket.join(roomId);
    socket.emit('room-joined', roomId);
    
    // Check for stale sessions and clean up if needed
    const wasCleanedUp = await cleanupSessionIfEmpty(roomId);
    
    // Only send session-related data if there's an active session in this room
    const state = activeSessions.get(roomId);
    console.log(`📊 Room ${roomId} session state:`, state);
    console.log(`📊 Was cleaned up:`, wasCleanedUp);
    
    if (state && state.active && !wasCleanedUp) {
      console.log(`📡 Room ${roomId} has active session, sending session data to ${socket.userName}`);
      
      // Send current participants list to the joining user
      const participants = await getRoomParticipants(roomId);
      console.log(`📤 Sending participants to ${socket.userName}:`, participants.map(p => p.name));
      socket.emit('session-participants', participants);
      
      // Send browse snapshot if exists
      const browseMap = roomBrowseState.get(roomId);
      if (browseMap) {
        const uniqueByUser = new Map();
        for (const [, v] of browseMap.entries()) {
          uniqueByUser.set(v.userId, v);
        }
        const snapshot = Array.from(uniqueByUser.values()).map((v) => ({
          userId: v.userId,
          userName: v.userName,
          productId: v.productId,
          productTitle: v.productTitle,
          productImage: v.productImage,
          roomId
        }));
        socket.emit('browse-snapshot', snapshot);
      }
      
      // Send session state
      socket.emit('session-state', { active: true, host: state.host, roomId });
      
      // Notify other users in the room that someone joined
      socket.to(roomId).emit('user-joined-room', {
        userId: socket.userId,
        userName: socket.userName,
        avatar: socket.avatar,
        roomId: roomId,
        timestamp: new Date()
      });
      
      // Broadcast updated participants list to everyone for consistency
      console.log(`📤 Broadcasting participants to all in room ${roomId}:`, participants.map(p => p.name));
      io.to(roomId).emit('session-participants', participants);
    } else {
      console.log(`📡 Room ${roomId} has no active session, not sending session data to ${socket.userName}`);
      
      // Send inactive session state
      socket.emit('session-state', { active: false, roomId });
      
      // Notify other users in the room that someone joined (but no session data)
      socket.to(roomId).emit('user-joined-room', {
        userId: socket.userId,
        userName: socket.userName,
        avatar: socket.avatar,
        roomId: roomId,
        timestamp: new Date()
      });
    }
  });
  
  // Handle leaving rooms
  socket.on('leave-room', async (roomId) => {
    console.log(`🚪 User ${socket.userName} leaving room: ${roomId}`);
    socket.leave(roomId);
    socket.emit('room-left', roomId);
    
    // Notify other users in the room that someone left
    socket.to(roomId).emit('user-left-room', {
      userId: socket.userId,
      userName: socket.userName,
      roomId: roomId,
      timestamp: new Date()
    });
    
    // Check if session should be cleaned up BEFORE getting participants
    const wasCleanedUp = await cleanupSessionIfEmpty(roomId);
    
    // Only get and broadcast participants if session wasn't cleaned up
    if (!wasCleanedUp) {
      const participants = await getRoomParticipants(roomId);
      io.to(roomId).emit('session-participants', participants);
    }
  });

  // Handle real-time messaging
  socket.on('send-message', (data) => {
    console.log(`💬 Message from ${socket.userName} in room ${data.roomId}: ${data.text}`);
    
    // Determine sender type - if it's AI, keep it as 'ai', otherwise 'friend'
    const senderType = data.sender === 'ai' ? 'ai' : 'friend';
    
    // Broadcast message to all users in the room except sender
    socket.to(data.roomId).emit('new-message', {
      id: data.id || Date.now().toString(),
      text: data.text,
      sender: senderType,
      senderName: data.senderName || socket.userName,
      senderId: socket.userId,
      senderAvatar: data.senderAvatar,
      timestamp: data.timestamp || new Date().toISOString(),
      roomId: data.roomId,
      messageType: data.messageType || 'text',
      productData: data.productData,
      reactions: data.reactions || { thumbsUp: 0, thumbsDown: 0 }
    });
  });

  // Handle typing indicators with automatic timeout
  socket.on('typing-start', (data) => {
    // Clear existing timeout for this room
    if (typingTimeouts.has(data.roomId)) {
      clearTimeout(typingTimeouts.get(data.roomId));
    }
    
    // Emit typing start
    socket.to(data.roomId).emit('typing-start', {
      userId: socket.userId,
      userName: socket.userName,
      roomId: data.roomId
    });
    
    // Set timeout to automatically stop typing after 3 seconds
    const timeout = setTimeout(() => {
      socket.to(data.roomId).emit('typing-stop', {
        userId: socket.userId,
        userName: socket.userName,
        roomId: data.roomId
      });
      typingTimeouts.delete(data.roomId);
    }, 3000);
    
    typingTimeouts.set(data.roomId, timeout);
  });

  socket.on('typing-stop', (data) => {
    // Clear timeout and emit stop
    if (typingTimeouts.has(data.roomId)) {
      clearTimeout(typingTimeouts.get(data.roomId));
      typingTimeouts.delete(data.roomId);
    }
    
    socket.to(data.roomId).emit('typing-stop', {
      userId: socket.userId,
      userName: socket.userName,
      roomId: data.roomId
    });
  });

  // Handle message reactions
  socket.on('message-reaction', (data) => {
    console.log(`👍 Reaction from ${socket.userName} on message ${data.messageId}: ${data.reactionType}`);
    
    socket.to(data.roomId).emit('message-reaction-updated', {
      messageId: data.messageId,
      userId: socket.userId,
      userName: socket.userName,
      reactionType: data.reactionType,
      roomId: data.roomId,
      timestamp: new Date()
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', async (reason) => {
    console.log(`🔌 User disconnected: ${socket.userName} (${socket.userId}) - ${reason}`);
    
    // Clear all typing timeouts
    typingTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    typingTimeouts.clear();

    // Clear browse state for this socket
    try {
      const joined = Array.from(socket.rooms || []);
      for (const rid of joined) {
        if (typeof rid !== 'string') continue;
        if (rid.startsWith('user-') || rid.startsWith('call-')) continue;
        const roomId = rid;
        
        // Clear browse state for this user (using userId as key)
        const browseMap = roomBrowseState.get(roomId);
        if (browseMap) {
          browseMap.delete(socket.userId);
          console.log(`🧹 Cleared browse state for user ${socket.userId} in room ${roomId}`);
        }
        
        await cleanupSessionIfEmpty(roomId);
      }
    } catch (e) {
      console.error('❌ Error during disconnect cleanup:', e);
    }
  });

  // Live browse sync: user is viewing a product
  socket.on('browse-view', (data) => {
    // data: { roomId, userId, name, productId, productTitle, productImage }
    if (!data?.roomId) return;
    // Persist last viewed product per user in room using userId as key
    let map = roomBrowseState.get(data.roomId);
    if (!map) {
      map = new Map();
      roomBrowseState.set(data.roomId, map);
    }
    const userId = data.userId || socket.userId;
    map.set(userId, {
      userId: userId,
      userName: data.name || socket.userName,
      productId: data.productId,
      productTitle: data.productTitle,
      productImage: data.productImage,
    });
    console.log(`🧭 Browse view stored for user ${userId}: ${data.productTitle}`);
    // Broadcast update to everyone in room (including sender) to ensure local state stays in sync
    io.to(data.roomId).emit('browse-update', {
      userId: userId,
      name: data.name || socket.userName,
      productId: data.productId,
      productTitle: data.productTitle,
      productImage: data.productImage,
      roomId: data.roomId,
      timestamp: new Date().toISOString()
    });

    // If anyone is following this user in this room, notify them to navigate
    const followMap = roomFollowState.get(data.roomId);
    if (followMap) {
      for (const [followerId, targetId] of followMap.entries()) {
        if (targetId === (data.userId || socket.userId)) {
          // Send targeted event to follower's personal room
          io.to(`user-${followerId}`).emit('follow-navigate', {
            roomId: data.roomId,
            leaderUserId: targetId,
            productId: data.productId,
            productTitle: data.productTitle,
            productImage: data.productImage,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  });

  // Clear last view when user stops viewing a product
  socket.on('browse-clear', (data) => {
    if (!data?.roomId) return;
    const userId = data.userId || socket.userId;
    console.log(`🧹 Browse clear from ${socket.userName} (${userId})`);
    const map = roomBrowseState.get(data.roomId);
    if (map) {
      map.delete(userId);
    }
    socket.to(data.roomId).emit('browse-update', {
      userId: userId,
      name: data.name || socket.userName,
      productId: null,
      productTitle: null,
      productImage: null,
      roomId: data.roomId,
      timestamp: new Date().toISOString()
    });
  });

  // Join user-specific room for follow notifications
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 User ${socket.userId} joined user room ${userId}`);
  });

  // Follow/Unfollow functionality
  socket.on('follow-user', (data) => {
    if (!data?.roomId || !data?.targetUserId) return;
    console.log(`👥 User ${socket.userId} following ${data.targetUserId} in room ${data.roomId}`);
    
    let followMap = roomFollowState.get(data.roomId);
    if (!followMap) {
      followMap = new Map();
      roomFollowState.set(data.roomId, followMap);
    }
    followMap.set(socket.userId, data.targetUserId);
    
    // Notify the target user that someone is following them
    socket.to(`user-${data.targetUserId}`).emit('follow-updated', {
      roomId: data.roomId,
      followerId: socket.userId,
      followerName: socket.userName,
      targetUserId: data.targetUserId
    });

    // Immediately navigate follower to leader's current product if available
    const browseMap = roomBrowseState.get(data.roomId);
    if (browseMap) {
      const leaderState = browseMap.get(data.targetUserId);
      if (leaderState && leaderState.productId) {
        // Send to follower's personal room (if joined)
        io.to(`user-${socket.userId}`).emit('follow-navigate', {
          roomId: data.roomId,
          leaderUserId: data.targetUserId,
          productId: leaderState.productId,
          productTitle: leaderState.productTitle,
          productImage: leaderState.productImage,
          timestamp: new Date().toISOString()
        });
        // Also send directly to this follower's socket for immediate effect
        socket.emit('follow-navigate', {
          roomId: data.roomId,
          leaderUserId: data.targetUserId,
          productId: leaderState.productId,
          productTitle: leaderState.productTitle,
          productImage: leaderState.productImage,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  socket.on('unfollow-user', (data) => {
    if (!data?.roomId) return;
    console.log(`👥 User ${socket.userId} unfollowing in room ${data.roomId}`);
    
    const followMap = roomFollowState.get(data.roomId);
    if (followMap) {
      const targetUserId = followMap.get(socket.userId);
      followMap.delete(socket.userId);
      
      if (targetUserId) {
        // Notify the target user that someone stopped following them
        socket.to(`user-${targetUserId}`).emit('follow-updated', {
          roomId: data.roomId,
          followerId: socket.userId,
          followerName: socket.userName,
          targetUserId: targetUserId,
          unfollowed: true
        });
      }
      
      // If followMap is empty, remove it
      if (followMap.size === 0) {
        roomFollowState.delete(data.roomId);
      }
    }
  });

  // Session user join/leave
  socket.on('join-session', async (data) => {
    if (!data?.roomId || !data?.user) return;
    console.log(`👥 User ${data.user.userId} joining session in room ${data.roomId}`);
    // Track in session participants set
    let set = roomSessionParticipants.get(data.roomId);
    if (!set) {
      set = new Set();
      roomSessionParticipants.set(data.roomId, set);
    }
    set.add(data.user.userId);
    
    // Get updated participants list
    const participants = await getRoomParticipants(data.roomId);
    console.log(`👥 Broadcasting updated participants after join:`, participants.map(p => p.name));
    
    // Broadcast updated participants to all users in the room
    io.to(data.roomId).emit('session-participants', participants);
    
    // Notify about user joining
    io.to(data.roomId).emit('session-user-joined', {
      roomId: data.roomId,
      user: data.user,
      participants: participants
    });
  });

  socket.on('leave-session', async (data) => {
    if (!data?.roomId || !data?.userId) return;
    console.log(`👥 User ${data.userId} leaving session in room ${data.roomId}`);
    // Remove from session participants set
    const set = roomSessionParticipants.get(data.roomId);
    if (set) {
      set.delete(data.userId);
      if (set.size === 0) {
        roomSessionParticipants.delete(data.roomId);
      }
    }
    
    // Get updated participants list
    const participants = await getRoomParticipants(data.roomId);
    console.log(`👥 Broadcasting updated participants after leave:`, participants.map(p => p.name));
    
    // Broadcast updated participants to all users in the room
    io.to(data.roomId).emit('session-participants', participants);
    
    // Notify about user leaving
    io.to(data.roomId).emit('session-user-left', {
      roomId: data.roomId,
      userId: data.userId,
      participants: participants
    });
  });

  // Session lifecycle
  socket.on('start-session', async (data) => {
    // data: { roomId, host }
    if (!data?.roomId) return;
    console.log(`▶️ Starting session in room ${data.roomId} by ${socket.userName}`);
    
    activeSessions.set(data.roomId, { active: true, host: data.host || socket.userName });
    
    // Add host to session participants
    let sessionSet = roomSessionParticipants.get(data.roomId);
    if (!sessionSet) {
      sessionSet = new Set();
      roomSessionParticipants.set(data.roomId, sessionSet);
    }
    sessionSet.add(socket.userId);
    console.log(`👥 Added host ${socket.userName} to session participants for room ${data.roomId}`);
    
    try {
      const Room = require('./models/Room');
      await Room.findByIdAndUpdate(data.roomId, { 
        isLive: true, 
        sessionHost: data.host || socket.userName,
        activeSessionId: socket.userId 
      });
      console.log(`✅ Database updated: room ${data.roomId} marked as live`);
    } catch (e) {
      console.error(`❌ Database update failed for room ${data.roomId}:`, e);
    }
    
    // Get current participants and broadcast to all users in the room
    const participants = await getRoomParticipants(data.roomId);
    console.log(`👥 Broadcasting participants for session start:`, participants.map(p => p.name));
    
    // Notify users already in the room (exclude host)
    socket.to(data.roomId).emit('session-started', { 
      roomId: data.roomId, 
      host: data.host || socket.userName,
      hostId: socket.userId 
    });
    
    // Broadcast participants list to all users in the room
    io.to(data.roomId).emit('session-participants', participants);
  });

  socket.on('end-session', async (data) => {
    if (!data?.roomId) return;
    console.log(`⏹️ Ending session in room ${data.roomId} by ${socket.userName}`);
    
    activeSessions.set(data.roomId, { active: false, host: null });
    roomBrowseState.delete(data.roomId);
    roomFollowState.delete(data.roomId);
    roomSessionParticipants.delete(data.roomId);
    
    try {
      const Room = require('./models/Room');
      await Room.findByIdAndUpdate(data.roomId, { 
        isLive: false, 
        sessionHost: null, 
        activeSessionId: null 
      });
      console.log(`✅ Database updated: room ${data.roomId} marked as not live`);
    } catch (e) {
      console.error(`❌ Database update failed for room ${data.roomId}:`, e);
    }
    
    // Notify all users in the room
    io.to(data.roomId).emit('session-ended', { roomId: data.roomId });
    io.to(data.roomId).emit('session-state', { active: false, roomId: data.roomId });
    
    // Clear participants list
    io.to(data.roomId).emit('session-participants', []);
  });

});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roomRoutes = require('./routes/rooms');
const wardrobeRoutes = require('./routes/wardrobes');
const productRoutes = require('./routes/products');
const messageRoutes = require('./routes/messages');
const callRoutes = require('./routes/calls');
const aiRoutes = require('./routes/ai');
const notificationRoutes = require('./routes/notifications');
const invitationRoutes = require('./routes/invitations');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting - DISABLED FOR DEVELOPMENT
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : true, // Allow all origins in development
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Database connection - FORCE MYNTRA FASHION DATABASE
const mongoUri = process.env.MONGODB_URI;

// For development, you can use a local MongoDB or skip DB connection
if (process.env.NODE_ENV === 'development' && !mongoUri) {
  console.log('⚠️ No MongoDB URI found, running without database (Socket.IO will still work)');
} else {
  // Ensure we're using the myntra-fashion database
  const mongoUriWithDb = mongoUri.includes('myntra-fashion') 
    ? mongoUri 
    : mongoUri.replace('mongodb.net/', 'mongodb.net/myntra-fashion');

  console.log('🔗 Connecting to Myntra Fashion Database:', mongoUriWithDb);

  mongoose.connect(mongoUriWithDb, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 20000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 30000,
    retryWrites: true,
    w: 'majority',
    heartbeatFrequencyMS: 10000
  })
  .then(() => console.log('✅ Connected to MYNTRA FASHION DATABASE successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    console.log('⚠️ Continuing without database - Socket.IO will still work for real-time chat');
  });
}

// Additional Socket.io handlers for call sessions and other features
io.on('connection', (socket) => {
  // Join call session
  socket.on('join-call', (callId) => {
    socket.join(`call-${callId}`);
    console.log(`👤 User ${socket.userId} joined call ${callId}`);
  });

  // Leave call session
  socket.on('leave-call', (callId) => {
    socket.leave(`call-${callId}`);
    console.log(`👤 User ${socket.userId} left call ${callId}`);
  });

  // Join user-specific room for notifications
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 User ${socket.userId} joined user room ${userId}`);
  });

  // Voice call signaling
  socket.on('call-signal', (data) => {
    socket.to(data.targetUserId).emit('call-signal', data);
  });

  // Call notifications
  socket.on('call-started', (data) => {
    socket.to(data.roomId).emit('call-started', data);
  });

  socket.on('user-joined-call', (data) => {
    socket.to(data.roomId).emit('user-joined-call', data);
  });

  socket.on('user-left-call', (data) => {
    socket.to(data.roomId).emit('user-left-call', data);
  });

  // Real-time browsing sync (enhanced)
  socket.on('call:sync-browse', (data) => {
    socket.to(`call-${data.callId}`).emit('call:browse-update', {
      userId: data.userId,
      productId: data.productId,
      scrollPosition: data.scrollPosition,
      searchQuery: data.searchQuery,
      filters: data.filters,
      sortBy: data.sortBy,
      sortOrder: data.sortOrder,
      page: data.page,
      totalPages: data.totalPages,
      totalProducts: data.totalProducts,
      timestamp: data.timestamp
    });
  });

  // Master control events
  socket.on('call:request-control', (data) => {
    socket.to(`call-${data.callId}`).emit('call:control-requested', {
      userId: data.userId,
      userName: data.userName,
      callId: data.callId,
      timestamp: new Date()
    });
  });

  socket.on('call:approve-control', (data) => {
    socket.to(`call-${data.callId}`).emit('call:control-transferred', {
      newController: data.newController,
      callId: data.callId,
      timestamp: new Date()
    });
  });

  socket.on('call:deny-control', (data) => {
    socket.to(`call-${data.callId}`).emit('call:control-denied', {
      requestUserId: data.requestUserId,
      callId: data.callId,
      timestamp: new Date()
    });
  });

  socket.on('call:release-control', (data) => {
    socket.to(`call-${data.callId}`).emit('call:control-released', {
      userId: data.userId,
      callId: data.callId,
      timestamp: new Date()
    });
  });

  // Cart updates
  socket.on('call:cart-update', (data) => {
    socket.to(`call-${data.callId}`).emit('call:cart-notification', data);
  });

  // Control changes
  socket.on('call:control-changed', (data) => {
    socket.to(`call-${data.callId}`).emit('call:control-update', data);
  });

  // Voice call events
  socket.on('start-voice-call', (data) => {
    console.log(`🎤 User ${socket.userName} starting voice call in room: ${data.roomId}`);
    socket.to(data.roomId).emit('voice-call-started', {
      roomId: data.roomId,
      hostId: socket.userId,
      hostName: socket.userName
    });
  });

  socket.on('join-voice-call', (data) => {
    console.log(`🎤 User ${socket.userName} joining voice call in room: ${data.roomId}`);
    socket.to(data.roomId).emit('user-joined-voice-call', {
      roomId: data.roomId,
      userId: socket.userId,
      userName: socket.userName
    });
  });

  socket.on('end-voice-call', (data) => {
    console.log(`🎤 User ${socket.userName} ending voice call in room: ${data.roomId}`);
    socket.to(data.roomId).emit('voice-call-ended', {
      roomId: data.roomId,
      userId: socket.userId
    });
  });

  socket.on('voice-call-offer', (data) => {
    console.log(`🎤 Voice call offer from ${socket.userName} to user ${data.targetUserId} in room: ${data.roomId}`);
    socket.to(data.roomId).emit('voice-call-offer', {
      fromUserId: socket.userId,
      fromUserName: socket.userName,
      targetUserId: data.targetUserId,
      offer: data.offer,
      roomId: data.roomId
    });
  });

  socket.on('voice-call-answer', (data) => {
    console.log(`🎤 Voice call answer from ${socket.userName} to user ${data.targetUserId} in room: ${data.roomId}`);
    socket.to(data.roomId).emit('voice-call-answer', {
      fromUserId: socket.userId,
      fromUserName: socket.userName,
      targetUserId: data.targetUserId,
      answer: data.answer,
      roomId: data.roomId
    });
  });

  socket.on('voice-call-ice-candidate', (data) => {
    console.log(`🎤 Voice call ICE candidate from ${socket.userName} to user ${data.targetUserId} in room: ${data.roomId}`);
    socket.to(data.roomId).emit('voice-call-ice-candidate', {
      fromUserId: socket.userId,
      fromUserName: socket.userName,
      targetUserId: data.targetUserId,
      candidate: data.candidate,
      roomId: data.roomId
    });
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/rooms', authenticateToken, roomRoutes);
app.use('/api/wardrobes', authenticateToken, wardrobeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/calls', authenticateToken, callRoutes);
app.use('/api/ai', authenticateToken, aiRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/invitations', authenticateToken, invitationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Myntra Fashion Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Manual cleanup endpoint for testing
app.post('/api/cleanup-sessions', async (req, res) => {
  try {
    console.log('🧹 Manual session cleanup triggered');
    const roomsToCheck = Array.from(activeSessions.keys());
    console.log(`📊 Active sessions in memory: ${roomsToCheck.length}`, roomsToCheck);
    
    let cleanedCount = 0;
    
    for (const roomId of roomsToCheck) {
      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      
      console.log(`🔍 Checking room ${roomId}:`);
      console.log(`  - Room exists: ${!!room}`);
      console.log(`  - Room size: ${roomSize}`);
      
      if (!room || roomSize === 0) {
        console.log(`🧹 Manual cleanup: ending stale session in room ${roomId}`);
        activeSessions.delete(roomId);
        roomBrowseState.delete(roomId);
        roomFollowState.delete(roomId);
        
        try {
          const Room = require('./models/Room');
          await Room.findByIdAndUpdate(roomId, { 
            isLive: false, 
            sessionHost: null, 
            activeSessionId: null 
          });
          console.log(`✅ Manual cleanup: database updated for room ${roomId}`);
        } catch (dbError) {
          console.error(`❌ Manual cleanup: database update failed for room ${roomId}:`, dbError);
        }
        
        io.to(roomId).emit('session-ended', { roomId });
        io.to(roomId).emit('session-state', { active: false, roomId });
        cleanedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Cleaned up ${cleanedCount} stale sessions`,
      cleanedCount,
      activeSessions: Array.from(activeSessions.keys())
    });
  } catch (error) {
    console.error('❌ Manual cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Cleanup failed', 
      error: error.message 
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);


const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🌐 Server accessible on all network interfaces`);
});

module.exports = { app, server, io };
