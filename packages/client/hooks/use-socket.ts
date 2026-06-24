"use client";

// Re-export the SocketProvider hook and provider component
export { useSocket, SocketProvider } from '@/components/socket/SocketProvider';

// Export socket event hooks
export { useSocketEvents } from './use-socket-events';