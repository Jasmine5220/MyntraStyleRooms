import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { authAPI } from '../services/api';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (data: any) => void;
  sendTypingStart: (roomId: string) => void;
  sendTypingStop: (roomId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = async () => {
    try {
      // Get user data from storage
      let token = await AsyncStorage.getItem('auth_token');
      let userData = await AsyncStorage.getItem('userData');

      // If token exists but userData missing, fetch /auth/me to align socket auth
      if (token && !userData) {
        try {
          const me = await authAPI.getCurrentUser();
          if (me?.status === 'success' && me.data?.user) {
            await AsyncStorage.setItem('userData', JSON.stringify(me.data.user));
            userData = JSON.stringify(me.data.user);
          }
        } catch (e) {
          console.warn('⚠️ Failed to resolve user for socket auth');
        }
      }
      
      if (!token || !userData) {
        console.log('🔌 No auth token or user data found, skipping Socket.IO connection');
        return;
      }

      const user = JSON.parse(userData);
      
      // Disconnect existing socket if any
      if (socket) {
        socket.disconnect();
      }

      // Create new socket connection
      const newSocket = io('http://10.120.129.218:5000', {  //here
        auth: {
          token,
          userId: user._id,
          userName: user.name,
          userAvatar: user.profileImage
        },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
      });

      console.log('🔌 Socket auth data:', {
        token: token ? `${token.substring(0, 20)}...` : 'none',
        userId: user._id,
        userName: user.name,
        userAvatar: user.profileImage
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('🔌 Socket connected:', newSocket.id);
        setIsConnected(true);
        reconnectAttempts.current = 0;
      });

      newSocket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
        setIsConnected(false);
        
        // Attempt to reconnect if not manually disconnected
        if (reason !== 'io client disconnect') {
          scheduleReconnect();
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('🔌 Socket connection error:', error);
        setIsConnected(false);
        
        // Handle specific error types
        if (error.message && error.message.includes('Token user mismatch')) {
          console.log('🔄 Token mismatch detected, clearing auth data and reconnecting...');
          // Clear potentially stale auth data
          AsyncStorage.removeItem('auth_token');
          AsyncStorage.removeItem('userData');
          // Try to reconnect after a delay
          setTimeout(() => {
            connect();
          }, 2000);
        } else if (error.message && error.message.includes('Authentication failed')) {
          console.log('🔄 Authentication failed, clearing auth data...');
          AsyncStorage.removeItem('auth_token');
          AsyncStorage.removeItem('userData');
        } else {
          scheduleReconnect();
        }
      });

      newSocket.on('room-joined', (roomId) => {
        console.log('🚪 Joined room:', roomId);
      });

      newSocket.on('room-left', (roomId) => {
        console.log('🚪 Left room:', roomId);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

  const scheduleReconnect = () => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectAttempts.current++;

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  };

  const joinRoom = (roomId: string) => {
    if (socket && isConnected) {
      socket.emit('join-room', roomId);
    }
  };

  const leaveRoom = (roomId: string) => {
    if (socket && isConnected) {
      socket.emit('leave-room', roomId);
    }
  };

  const sendMessage = (data: any) => {
    if (socket && isConnected) {
      socket.emit('send-message', data);
    }
  };

  const sendTypingStart = (roomId: string) => {
    if (socket && isConnected) {
      socket.emit('typing-start', { roomId });
    }
  };

  const sendTypingStop = (roomId: string) => {
    if (socket && isConnected) {
      socket.emit('typing-stop', { roomId });
    }
  };

  // Auto-connect on mount and when authentication changes
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  // Reconnect when authentication status changes
  useEffect(() => {
    const checkAuthAndConnect = async () => {
      const token = await AsyncStorage.getItem('auth_token');
      const userData = await AsyncStorage.getItem('userData');
      
      if (token && userData && !isConnected) {
        console.log('🔌 Authentication detected, connecting to Socket.IO');
        connect();
      } else if (!token && isConnected) {
        console.log('🔌 Authentication lost, disconnecting from Socket.IO');
        disconnect();
      }
    };

    checkAuthAndConnect();
  }, [isConnected]);

  const value: SocketContextType = {
    socket,
    isConnected,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTypingStart,
    sendTypingStop
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
