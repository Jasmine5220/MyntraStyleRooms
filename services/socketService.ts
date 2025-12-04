import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { authAPI } from './api';

interface SocketMessage {
  id: string;
  text: string;
  sender: 'user' | 'friend' | 'ai' | 'maya';
  senderName: string;
  senderId?: string;
  senderAvatar?: string;
  timestamp: string;
  roomId: string;
  messageType?: 'text' | 'product' | 'image' | 'voice' | 'system';
  productData?: any;
  reactions?: {
    thumbsUp: number;
    thumbsDown: number;
    userThumbsUp?: boolean;
    userThumbsDown?: boolean;
  };
}

interface TypingUser {
  userId: string;
  userName: string;
  roomId: string;
}

interface SocketServiceCallbacks {
  onMessage?: (message: SocketMessage) => void;
  onTypingStart?: (user: TypingUser) => void;
  onTypingStop?: (user: TypingUser) => void;
  onUserJoined?: (user: TypingUser) => void;
  onUserLeft?: (user: TypingUser) => void;
  onReactionUpdate?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
  onSessionStarted?: (data: any) => void;
  onSessionEnded?: (data: any) => void;
  onSessionUserJoined?: (data: any) => void;
  onSessionUserLeft?: (data: any) => void;
  onBrowseUpdate?: (data: any) => void;
  onSessionParticipants?: (data: any[]) => void;
  onFollowUpdated?: (data: any) => void;
  onFollowNavigate?: (data: any) => void;
  // Voice call events
  onVoiceCallOffer?: (data: any) => void;
  onVoiceCallAnswer?: (data: any) => void;
  onVoiceCallIceCandidate?: (data: any) => void;
  onVoiceCallStarted?: (data: any) => void;
  onVoiceCallEnded?: (data: any) => void;
  onUserJoinedVoiceCall?: (data: any) => void;
  onUserLeftVoiceCall?: (data: any) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private callbacks: SocketServiceCallbacks = {};
  private currentRoomId: string | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private hasSwitchedToPolling = false;
  private sessionState: { active: boolean; host?: string; roomId?: string } = { active: false };

  // Initialize socket connection
  async initialize(callbacks: SocketServiceCallbacks) {
    this.callbacks = callbacks;

    try {
      // Get user token and info from storage (use same keys as the rest of the app)
      let token = (await AsyncStorage.getItem('auth_token')) || (await AsyncStorage.getItem('userToken'));
      let userInfo = (await AsyncStorage.getItem('userData')) || (await AsyncStorage.getItem('userInfo'));

      // Resolve user if token present but user info missing
      if (token && !userInfo) {
        try {
          const me = await authAPI.getCurrentUser();
          if (me?.status === 'success' && me.data?.user) {
            await AsyncStorage.setItem('userData', JSON.stringify(me.data.user));
            userInfo = JSON.stringify(me.data.user);
          }
        } catch (e) {
          console.warn('⚠️ Failed to fetch current user for socket auth, will fallback if needed');
        }
      }

      // Fallback to mock if still missing token or user
      let user;
      if (token && userInfo) {
        user = JSON.parse(userInfo);
      } else {
        console.log('⚠️ No authentication found, using mock user for Socket.IO');
        token = 'mock-token';
        user = {
          _id: 'mock-user-1',
          name: 'You',
          email: 'test@example.com'
        };
      }
      
      // Determine server URL based on environment
      const serverUrl = __DEV__ 
        ? (process.env.EXPO_PUBLIC_SOCKET_URL || 'http://10.120.129.218:5000')
        : (process.env.EXPO_PUBLIC_SOCKET_URL || 'https://your-production-url.com');

      console.log('🔌 Connecting to Socket.IO server:', serverUrl);

      this.socket = io(serverUrl, {
        auth: {
          token: token || 'mock-token',
          userId: user._id,
          userName: user.name,
          userAvatar: user.profileImage || undefined
        },
        transports: ['polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        forceNew: false,
        withCredentials: false,
        path: '/socket.io',
        upgrade: false, // Disable upgrade to websocket
        rememberUpgrade: false,
        autoConnect: true
      });

      this.setupEventListeners();
      
    } catch (error) {
      console.error('❌ Socket initialization error:', error);
      this.callbacks.onError?.(error);
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      this.isConnected = true;
      this.hasSwitchedToPolling = false;
      this.callbacks.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      this.isConnected = false;
      this.callbacks.onDisconnect?.();
    });

    this.socket.on('connect_error', (error) => {
      console.warn('❌ Socket connection error:', error?.message || error);
      
      // Handle specific authentication errors
      if (error?.message && error.message.includes('Token user mismatch')) {
        console.log('🔄 Token mismatch detected, clearing auth data...');
        // Clear potentially stale auth data
        AsyncStorage.removeItem('auth_token');
        AsyncStorage.removeItem('userData');
      } else if (error?.message && error.message.includes('Authentication failed')) {
        console.log('🔄 Authentication failed, clearing auth data...');
        AsyncStorage.removeItem('auth_token');
        AsyncStorage.removeItem('userData');
      }
      
      this.callbacks.onError?.(error);
    });

    // Room events
    this.socket.on('room-joined', (roomId) => {
      console.log('🚪 Joined room:', roomId);
      this.currentRoomId = roomId;
    });

    this.socket.on('room-left', (roomId) => {
      console.log('🚪 Left room:', roomId);
      if (this.currentRoomId === roomId) {
        this.currentRoomId = null;
      }
    });

    // Message events
    this.socket.on('new-message', (message: SocketMessage) => {
      console.log('💬 New message received:', message.text);
      this.callbacks.onMessage?.(message);
    });

    // Typing events
    this.socket.on('typing-start', (user: TypingUser) => {
      console.log('⌨️ User started typing:', user.userName);
      this.callbacks.onTypingStart?.(user);
    });

    this.socket.on('typing-stop', (user: TypingUser) => {
      console.log('⌨️ User stopped typing:', user.userName);
      this.callbacks.onTypingStop?.(user);
    });

    // User events
    this.socket.on('user-joined-room', (user: TypingUser) => {
      console.log('👋 User joined room:', user.userName);
      this.callbacks.onUserJoined?.(user);
    });

    this.socket.on('user-left-room', (user: TypingUser) => {
      console.log('👋 User left room:', user.userName);
      this.callbacks.onUserLeft?.(user);
    });

    // Reaction events
    this.socket.on('message-reaction-updated', (data) => {
      console.log('👍 Reaction updated:', data);
      this.callbacks.onReactionUpdate?.(data);
    });

    // Session events
    this.socket.on('session-started', (data) => {
      console.log('▶️ Session started:', data);
      this.sessionState = { active: true, host: data?.host, roomId: data?.roomId };
      this.callbacks.onSessionStarted?.(data);
    });

    this.socket.on('session-ended', (data) => {
      console.log('⏹️ Session ended:', data);
      this.sessionState = { active: false, roomId: data?.roomId };
      this.callbacks.onSessionEnded?.(data);
    });

    this.socket.on('session-user-joined', (data) => {
      console.log('👥 Session user joined:', data);
      this.callbacks.onSessionUserJoined?.(data);
    });

    this.socket.on('session-user-left', (data) => {
      console.log('👥 Session user left:', data);
      this.callbacks.onSessionUserLeft?.(data);
    });

    // Browse sync events
    this.socket.on('browse-update', (data) => {
      console.log('🧭 Browse update:', data);
      this.callbacks.onBrowseUpdate?.(data);
    });

    this.socket.on('session-participants', (list) => {
      console.log('👥 Session participants list:', list?.length || 0);
      this.callbacks.onSessionParticipants?.(list);
    });

    this.socket.on('browse-snapshot', (arr) => {
      console.log('🧭 Browse snapshot:', Array.isArray(arr) ? arr.length : 0);
      if (Array.isArray(arr)) {
        arr.forEach((data) => this.callbacks.onBrowseUpdate?.(data));
      }
    });
    // Follow events
    this.socket.on('follow-updated', (data) => {
      console.log('👉 Follow updated:', data);
      this.callbacks.onFollowUpdated?.(data);
    });
    this.socket.on('follow-navigate', (data) => {
      console.log('🧭 Follow navigate to product:', data);
      this.callbacks.onFollowNavigate?.(data);
    });
    this.socket.on('session-state', (state) => {
      console.log('ℹ️ Session state snapshot:', state);
      this.sessionState = { active: !!state?.active, host: state?.host, roomId: state?.roomId };
      // Do NOT trigger onSessionStarted on snapshot to avoid false start toasts
    });

    // Voice call events
    this.socket.on('voice-call-offer', (data) => {
      console.log('🎤 Voice call offer received:', data);
      this.callbacks.onVoiceCallOffer?.(data);
    });

    this.socket.on('voice-call-answer', (data) => {
      console.log('🎤 Voice call answer received:', data);
      this.callbacks.onVoiceCallAnswer?.(data);
    });

    this.socket.on('voice-call-ice-candidate', (data) => {
      console.log('🎤 Voice call ICE candidate received:', data);
      this.callbacks.onVoiceCallIceCandidate?.(data);
    });

    this.socket.on('voice-call-started', (data) => {
      console.log('🎤 Voice call started:', data);
      this.callbacks.onVoiceCallStarted?.(data);
    });

    this.socket.on('voice-call-ended', (data) => {
      console.log('🎤 Voice call ended:', data);
      this.callbacks.onVoiceCallEnded?.(data);
    });

    this.socket.on('user-joined-voice-call', (data) => {
      console.log('🎤 User joined voice call:', data);
      this.callbacks.onUserJoinedVoiceCall?.(data);
    });

    this.socket.on('user-left-voice-call', (data) => {
      console.log('🎤 User left voice call:', data);
      this.callbacks.onUserLeftVoiceCall?.(data);
    });
  }

  // Join a room
  joinRoom(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot join room');
      return;
    }

    console.log('🚪 Joining room:', roomId);
    this.socket.emit('join-room', roomId);
  }

  // Leave a room
  leaveRoom(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot leave room');
      return;
    }

    console.log('🚪 Leaving room:', roomId);
    this.socket.emit('leave-room', roomId);
  }

  // Send a message
  sendMessage(message: Omit<SocketMessage, 'id' | 'timestamp'>) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send message');
      return;
    }

    const messageData = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date().toISOString()
    };

    console.log('💬 Sending message:', messageData.text);
    this.socket.emit('send-message', messageData);
  }

  // Start typing indicator
  startTyping(roomId: string) {
    if (!this.socket || !this.isConnected) {
      return;
    }

    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.socket.emit('typing-start', { roomId });

    // Auto-stop typing after 3 seconds
    this.typingTimeout = setTimeout(() => {
      this.stopTyping(roomId);
    }, 3000);
  }

  // Stop typing indicator
  stopTyping(roomId: string) {
    if (!this.socket || !this.isConnected) {
      return;
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }

    this.socket.emit('typing-stop', { roomId });
  }

  // Send reaction
  sendReaction(messageId: string, reactionType: 'thumbsUp' | 'thumbsDown', roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send reaction');
      return;
    }

    console.log('👍 Sending reaction:', reactionType, 'for message:', messageId);
    this.socket.emit('message-reaction', {
      messageId,
      reactionType,
      roomId
    });
  }

  // Disconnect socket
  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting socket');
      
      // Leave current room before disconnecting
      if (this.currentRoomId) {
        console.log(`🚪 Leaving room ${this.currentRoomId} before disconnect`);
        this.socket.emit('leave-room', this.currentRoomId);
      }
      
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentRoomId = null;
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  // Session controls
  startSession(roomId: string, payload?: any) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot start session');
      return;
    }
    this.socket.emit('start-session', { roomId, ...payload });
  }

  endSession(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot end session');
      return;
    }
    this.socket.emit('end-session', { roomId });
  }

  joinSession(roomId: string, user: { userId: string; userName: string; avatar?: string }) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot join session');
      return;
    }
    this.socket.emit('join-session', { roomId, user });
  }

  leaveSession(roomId: string, userId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot leave session');
      return;
    }
    this.socket.emit('leave-session', { roomId, userId });
  }

  // Broadcast product view in session
  sendBrowseView(roomId: string, payload: { userId: string; name: string; productId: string; productTitle: string; productImage: string; }) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send browse view');
      return;
    }
    this.socket.emit('browse-view', { roomId, ...payload });
  }

  // Clear product view in session
  sendBrowseClear(roomId: string, payload: { userId: string; name?: string }) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot clear browse view');
      return;
    }
    this.socket.emit('browse-clear', { roomId, ...payload });
  }

  // Follow a user in session
  followUser(roomId: string, targetUserId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot follow user');
      return;
    }
    this.socket.emit('follow-user', { roomId, targetUserId });
  }

  // Unfollow a user in session
  unfollowUser(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot unfollow user');
      return;
    }
    this.socket.emit('unfollow-user', { roomId });
  }

  // Join user-specific room for follow notifications
  joinUser(userId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot join user room');
      return;
    }
    this.socket.emit('join-user', userId);
  }

  // Merge/attach callbacks without re-initializing
  updateCallbacks(partial: Partial<SocketServiceCallbacks>) {
    console.log('🔄 Updating socket callbacks:', Object.keys(partial));
    console.log('🔄 Previous callbacks:', Object.keys(this.callbacks));
    
    // Only update callbacks that are actually different
    const newCallbacks = { ...this.callbacks };
    Object.keys(partial).forEach(key => {
      if (partial[key as keyof SocketServiceCallbacks] !== this.callbacks[key as keyof SocketServiceCallbacks]) {
        newCallbacks[key as keyof SocketServiceCallbacks] = partial[key as keyof SocketServiceCallbacks];
        console.log(`🔄 Updated callback: ${key}`);
      } else {
        console.log(`🔄 Skipped unchanged callback: ${key}`);
      }
    });
    
    this.callbacks = newCallbacks;
    console.log('🔄 Final callbacks:', Object.keys(this.callbacks));
  }

  // Voice call methods
  startVoiceCall(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot start voice call');
      return;
    }
    this.socket.emit('start-voice-call', { roomId });
  }

  joinVoiceCall(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot join voice call');
      return;
    }
    this.socket.emit('join-voice-call', { roomId });
  }

  endVoiceCall(roomId: string) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot end voice call');
      return;
    }
    this.socket.emit('end-voice-call', { roomId });
  }

  sendVoiceCallOffer(roomId: string, targetUserId: string, offer: any) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send voice call offer');
      return;
    }
    this.socket.emit('voice-call-offer', { roomId, targetUserId, offer });
  }

  sendVoiceCallAnswer(roomId: string, targetUserId: string, answer: any) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send voice call answer');
      return;
    }
    this.socket.emit('voice-call-answer', { roomId, targetUserId, answer });
  }

  sendVoiceCallIceCandidate(roomId: string, targetUserId: string, candidate: any) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ Socket not connected, cannot send voice call ICE candidate');
      return;
    }
    this.socket.emit('voice-call-ice-candidate', { roomId, targetUserId, candidate });
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      currentRoomId: this.currentRoomId,
      socketId: this.socket?.id,
      sessionState: this.sessionState,
    };
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;
