/**
 * Analytics WebSocket handler — issue #245.
 *
 * Extends the existing WebSocketServer with analytics-specific event types:
 * - distribution_event: pushed when a payout/distribution is recorded
 * - revenue_update:     pushed on booking revenue changes
 * - analytics_alert:   pushed for anomaly/cost alerts
 *
 * Clients subscribe to an analytics room by emitting `subscribe_analytics`.
 * Reconnection with exponential backoff is implemented on the client hook
 * (useAnalyticsWebSocket); the server side enforces per-connection rate limits.
 *
 * Authentication: JWT required for analytics subscriptions.
 */

import { Server } from 'socket.io';
import { logger } from '../utils/logger';

export interface DistributionEvent {
  distributionId: string;
  amount: number;
  currency: string;
  timestamp: Date;
}

export interface RevenueUpdate {
  bookingId: string;
  revenueCents: number;
  delta: number;
  timestamp: Date;
}

export interface AnalyticsAlert {
  alertId: string;
  type: 'anomaly' | 'cost_threshold' | 'distribution_anomaly';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: Date;
}

// Simple token-bucket rate limiter: max 60 messages per minute per socket
const MESSAGE_LIMIT = 60;
const WINDOW_MS = 60_000;

const socketMessageCounts = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const entry = socketMessageCounts.get(socketId);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    socketMessageCounts.set(socketId, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > MESSAGE_LIMIT) return true;
  return false;
}

const ANALYTICS_ROOM = 'analytics';
const HEARTBEAT_INTERVAL_MS = 30_000;

export function attachAnalyticsHandlers(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('subscribe_analytics', () => {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Rate limit exceeded. Retry after 60s.' });
        return;
      }
      const user = (socket as any).data?.user;
      if (!user) {
        socket.emit('error', { message: 'Authentication required for analytics subscription.' });
        return;
      }
      socket.join(ANALYTICS_ROOM);
      logger.info(`Socket ${socket.id} joined analytics room (user=${user.sub ?? user.id ?? 'unknown'})`);
      socket.emit('analytics_subscribed', { room: ANALYTICS_ROOM });
    });

    socket.on('unsubscribe_analytics', () => {
      socket.leave(ANALYTICS_ROOM);
      logger.info(`Socket ${socket.id} left analytics room`);
    });

    socket.on('disconnect', () => {
      socketMessageCounts.delete(socket.id);
    });
  });

  // Heartbeat to keep connections alive and detect stale sockets
  setInterval(() => {
    io.to(ANALYTICS_ROOM).emit('heartbeat', { ts: new Date() });
  }, HEARTBEAT_INTERVAL_MS).unref();
}

export function broadcastDistributionEvent(io: Server, event: DistributionEvent): void {
  io.to(ANALYTICS_ROOM).emit('distribution_event', event);
  logger.info(`Broadcast distribution_event: distributionId=${event.distributionId}`);
}

export function broadcastRevenueUpdate(io: Server, update: RevenueUpdate): void {
  io.to(ANALYTICS_ROOM).emit('revenue_update', update);
  logger.info(`Broadcast revenue_update: bookingId=${update.bookingId} delta=${update.delta}`);
}

export function broadcastAnalyticsAlert(io: Server, alert: AnalyticsAlert): void {
  io.to(ANALYTICS_ROOM).emit('analytics_alert', alert);
  logger.info(`Broadcast analytics_alert: type=${alert.type} severity=${alert.severity}`);
}
