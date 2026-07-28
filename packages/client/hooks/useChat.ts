'use client';

import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  id: string;
  from: 'user' | 'bot' | 'agent';
  text: string;
  createdAt: Date;
}

export function useChat(userId?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const sessionId = sessionStorage.getItem('chatSessionId') || undefined;
    const chatUserId = userId || localStorage.getItem('userId') || `guest-${Date.now()}`;
    
    const newSocket = io(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat`, {
      query: { userId: chatUserId, sessionId },
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      newSocket.emit('get:history');
    });

    newSocket.on('history', (data: { messages: ChatMessage[] }) => {
      setMessages(data.messages);
    });

    newSocket.on('message:new', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
      setIsTyping(false);
    });

    newSocket.on('typing:user', () => {
      setIsTyping(true);
    });

    newSocket.on('typing:stop', () => {
      setIsTyping(false);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [userId]);

  const sendMessage = useCallback((text: string, attachments?: string[]) => {
    if (!socket || !isConnected) return;
    socket.emit('message:send', { text, attachments });
    setIsTyping(true);
  }, [socket, isConnected]);

  const endSession = useCallback(() => {
    if (!socket) return;
    socket.emit('session:end');
  }, [socket]);

  const submitSurvey = useCallback((rating: number, feedback: string) => {
    if (!socket) return;
    socket.emit('survey:submit', { rating, feedback });
  }, [socket]);

  return {
    messages,
    sendMessage,
    endSession,
    submitSurvey,
    isConnected,
    isTyping,
  };
}
