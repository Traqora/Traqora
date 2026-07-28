// packages/client/hooks/use-socket-events.ts
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Prevent duplicate socket instances across component re-renders
const sockets: Record<string, Socket> = {};

const getSocket = (namespace: string): Socket => {
  const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';
  if (!sockets[namespace]) {
    sockets[namespace] = io(`${baseUrl}/${namespace}`, {
      autoConnect: true,
      reconnectionAttempts: 5,
    });
  }
  return sockets[namespace];
};

/**
 * HOOK 1: Flight Tracking Socket Events
 * Handles: Delays, Gate Changes, Cancellations, Boarding Reminders
 */
export const useFlightSocket = (flightId?: string) => {
  const socket = getSocket('flights');

  // Automatically join a specific flight room if an ID is passed
  useEffect(() => {
    if (!flightId) return;
    socket.emit('track-flight', flightId);
    return () => {
      socket.emit('untrack-flight', flightId);
    };
  }, [flightId, socket]);

  const onFlightEvent = useCallback(
    (
      event: 'flight-delayed' | 'gate-changed' | 'flight-cancelled' | 'boarding-reminder' | 'flight-status-update',
      callback: (data: any) => void
    ) => {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    },
    [socket]
  );

  return { onFlightEvent };
};

/**
 * HOOK 2: In-App Chat Support Socket Events
 * Handles: AI/Human messaging and Agent Status updates
 */
export const useChatSocket = (userId: string) => {
  const socket = getSocket('chat');

  // Register user session for targeted delivery
  useEffect(() => {
    if (!userId) return;
    socket.emit('join-session', userId);
  }, [userId, socket]);

  const sendMessage = useCallback(
    (message: { text: string; attachments?: string[] }) => {
      socket.emit('send-message', { userId, ...message });
    },
    [userId, socket]
  );

  const onChatEvent = useCallback(
    (event: 'chat-message' | 'agent-status', callback: (data: any) => void) => {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    },
    [socket]
  );

  return { sendMessage, onChatEvent };
};