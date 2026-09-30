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
"use client";

import { useEffect, useCallback } from 'react';
import { useSocket } from '@/components/socket/SocketProvider';

export interface ContractEvent {
  contractId: string;
  eventType: string;
  ledger: number;
  walletAddress?: string;
  data: unknown;
  timestamp: Date;
}

export interface FlightAlertEvent {
  message: string;
  flightId: string;
  status?: string;
  gate?: string;
  delayMinutes?: number;
  timestamp?: Date;
}

export type FlightStatusValue = 'SCHEDULED' | 'DELAYED' | 'GATE_CHANGED' | 'BOARDING' | 'CANCELLED' | 'LANDED';

/** Typed flight status change (issue #333) — mirrors the server's FlightStatusPayload emitted on the "flight_status" event. */
export interface FlightStatusEvent {
  flightId: string;
  status: FlightStatusValue;
  detail?: string;
  timestamp?: Date;
}

interface UseSocketEventsOptions {
  /** Filter contract events to only those matching this wallet address. */
  walletAddress?: string;
  /** Filter contract events to only these event types (e.g. 'created', 'paid'). */
  eventTypes?: string[];
  onContractEvent?: (event: ContractEvent) => void;
  onPriceUpdate?: (data: { flightId: string; price: number; timestamp: Date }) => void;
  onBookingStatus?: (data: { bookingId: string; status: string; timestamp: Date }) => void;
  /** Flight status changes: delays, cancellations, gate changes (#380). */
  onFlightAlert?: (data: FlightAlertEvent) => void;
  /** Typed flight status transitions (issue #333) — distinct from onFlightAlert's free-text message. */
  onFlightStatus?: (data: FlightStatusEvent) => void;
}

export function useSocketEvents(options: UseSocketEventsOptions = {}) {
  const { manager } = useSocket();
  const { walletAddress, eventTypes, onContractEvent, onPriceUpdate, onBookingStatus, onFlightAlert, onFlightStatus } = options;

  const handleContractEvent = useCallback(
    (event: ContractEvent) => {
      if (walletAddress && event.walletAddress && event.walletAddress !== walletAddress) return;
      if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(event.eventType)) return;
      onContractEvent?.(event);
    },
    [walletAddress, eventTypes, onContractEvent],
  );

  useEffect(() => {
    const onPrice = (d: any) => {
      console.debug('price', d);
      onPriceUpdate?.(d);
    };
    const onBooking = (d: any) => {
      console.debug('booking_status', d);
      onBookingStatus?.(d);
    };
    const onContract = (d: any) => {
      console.debug('contract_event', d);
      handleContractEvent(d);
    };
    const onAlert = (d: any) => {
      console.debug('alert', d);
      onFlightAlert?.(d);
    };
    const onFlightStatusChange = (d: any) => {
      console.debug('flight_status', d);
      onFlightStatus?.(d);
    };

    manager.on('priceUpdate', onPrice);
    manager.on('booking_status', onBooking);
    manager.on('contract_event', onContract);
    manager.on('alert', onAlert);
    manager.on('flight_status', onFlightStatusChange);

    // Subscribe to address-specific room for targeted contract event delivery.
    if (walletAddress) {
      manager.emit('subscribe_address', walletAddress);
    }

    return () => {
      manager.off('priceUpdate', onPrice);
      manager.off('booking_status', onBooking);
      manager.off('contract_event', onContract);
      manager.off('alert', onAlert);
      manager.off('flight_status', onFlightStatusChange);

      if (walletAddress) {
        manager.emit('unsubscribe_address', walletAddress);
      }
    };
  }, [manager, walletAddress, handleContractEvent, onPriceUpdate, onBookingStatus, onFlightAlert, onFlightStatus]);
}
