"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '@/components/socket/SocketProvider';
import { toast } from 'sonner';

export type BookingStatus = 'created' | 'awaiting_payment' | 'paid' | 'onchain_pending' | 'onchain_submitted' | 'confirmed' | 'failed' | 'refunded';

interface BookingStatusData {
  bookingId: string;
  status: BookingStatus;
  timestamp: Date;
}

interface UseBookingStatusOptions {
  bookingId?: string;
  onStatusChange?: (status: BookingStatus, data: BookingStatusData) => void;
  enabled?: boolean;
}

// Offline queue for status updates when disconnected
const offlineQueue = new Map<string, BookingStatusData[]>();

export function useBookingStatus({
  bookingId,
  onStatusChange,
  enabled = true,
}: UseBookingStatusOptions) {
  const [currentStatus, setCurrentStatus] = useState<BookingStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { manager } = useSocket();
  const processedEventsRef = useRef<Set<string>>(new Set());

  const handleBookingStatus = useCallback((data: BookingStatusData) => {
    if (bookingId && data.bookingId !== bookingId) return;
    
    // Deduplicate events
    const eventKey = `${data.bookingId}-${data.status}-${data.timestamp.getTime()}`;
    if (processedEventsRef.current.has(eventKey)) return;
    processedEventsRef.current.add(eventKey);
    
    setCurrentStatus(data.status);
    setLastUpdate(new Date(data.timestamp));
    setIsConnected(true);
    
    // Show toast notifications for critical status changes
    if (data.status === 'confirmed') {
      toast.success('Booking Confirmed', {
        description: 'Your booking has been successfully confirmed on the blockchain.',
      });
    } else if (data.status === 'failed') {
      toast.error('Booking Failed', {
        description: 'Your booking could not be completed. Please try again.',
      });
    } else if (data.status === 'refunded') {
      toast.info('Booking Refunded', {
        description: 'Your booking has been refunded.',
      });
    }
    
    onStatusChange?.(data.status, data);
  }, [bookingId, onStatusChange]);

  useEffect(() => {
    if (!enabled) return;

    const onBooking = (data: BookingStatusData) => {
      handleBookingStatus(data);
    };

    const onConnect = () => {
      setIsConnected(true);
      // Process offline queue on reconnect
      if (bookingId && offlineQueue.has(bookingId)) {
        const queuedEvents = offlineQueue.get(bookingId) || [];
        queuedEvents.forEach(event => handleBookingStatus(event));
        offlineQueue.delete(bookingId);
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    manager.on('booking_status', onBooking);
    manager.on('connect', onConnect);
    manager.on('disconnect', onDisconnect);

    // Subscribe to booking-specific room
    if (bookingId) {
      manager.emit('subscribe_booking', bookingId);
    }

    return () => {
      manager.off('booking_status', onBooking);
      manager.off('connect', onConnect);
      manager.off('disconnect', onDisconnect);
      if (bookingId) {
        manager.emit('unsubscribe_booking', bookingId);
      }
    };
  }, [enabled, bookingId, manager, handleBookingStatus]);

  return {
    status: currentStatus,
    lastUpdate,
    isConnected,
  };
}
