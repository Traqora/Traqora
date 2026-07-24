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

interface UseSocketEventsOptions {
  /** Filter contract events to only those matching this wallet address. */
  walletAddress?: string;
  /** Filter contract events to only these event types (e.g. 'created', 'paid'). */
  eventTypes?: string[];
  onContractEvent?: (event: ContractEvent) => void;
  onPriceUpdate?: (data: { flightId: string; price: number; timestamp: Date }) => void;
  onBookingStatus?: (data: { bookingId: string; status: string; timestamp: Date }) => void;
}

export function useSocketEvents(options: UseSocketEventsOptions = {}) {
  const { manager } = useSocket();
  const { walletAddress, eventTypes, onContractEvent, onPriceUpdate, onBookingStatus } = options;

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
      console.debug('booking', d);
      onBookingStatus?.(d);
    };
    const onContract = (d: any) => {
      console.debug('contract_event', d);
      handleContractEvent(d);
    };

    manager.on('price_update', onPrice);
    manager.on('booking_status', onBooking);
    manager.on('contract_event', onContract);

    // Subscribe to address-specific room for targeted contract event delivery.
    if (walletAddress) {
      manager.emit('subscribe_address', walletAddress);
    }

    return () => {
      manager.off('price_update', onPrice);
      manager.off('booking_status', onBooking);
      manager.off('contract_event', onContract);

      if (walletAddress) {
        manager.emit('unsubscribe_address', walletAddress);
      }
    };
  }, [manager, walletAddress, handleContractEvent, onPriceUpdate, onBookingStatus]);
}
