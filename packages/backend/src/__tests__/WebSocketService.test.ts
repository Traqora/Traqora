import { WebSocketService } from '../../src/services/WebSocketService';
import { createMockWebSocketClient, createMockWebSocketServer, createMockRedisClient } from '../../../tests/helpers/mocks';

describe('WebSocketService', () => {
  let service: WebSocketService;
  let wss: ReturnType<typeof createMockWebSocketServer>;
  let redis: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    wss = createMockWebSocketServer();
    redis = createMockRedisClient();
    service = new WebSocketService(wss as any, redis as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ── registerClient ─────────────────────────────────────────────────────────

  describe('registerClient()', () => {
    it('stores client socket keyed by userId', () => {
      const ws = createMockWebSocketClient();
      service.registerClient('user-001', ws as any);

      expect(service.getClientCount()).toBe(1);
    });

    it('replaces previous connection when same user reconnects', () => {
      const ws1 = createMockWebSocketClient();
      const ws2 = createMockWebSocketClient();

      service.registerClient('user-001', ws1 as any);
      service.registerClient('user-001', ws2 as any);

      expect(service.getClientCount()).toBe(1);
      expect(ws1.close).toHaveBeenCalledTimes(1);
    });

    it('registers multiple different users independently', () => {
      service.registerClient('user-001', createMockWebSocketClient() as any);
      service.registerClient('user-002', createMockWebSocketClient() as any);
      service.registerClient('user-003', createMockWebSocketClient() as any);

      expect(service.getClientCount()).toBe(3);
    });
  });

  // ── removeClient ───────────────────────────────────────────────────────────

  describe('removeClient()', () => {
    it('removes a registered client', () => {
      const ws = createMockWebSocketClient();
      service.registerClient('user-001', ws as any);
      service.removeClient('user-001');

      expect(service.getClientCount()).toBe(0);
    });

    it('does not throw when removing a non-existent client', () => {
      expect(() => service.removeClient('ghost-user')).not.toThrow();
    });
  });

  // ── sendToUser ─────────────────────────────────────────────────────────────

  describe('sendToUser()', () => {
    it('sends a JSON message to a connected user', () => {
      const ws = createMockWebSocketClient();
      service.registerClient('user-001', ws as any);

      const payload = { type: 'booking_confirmed', bookingId: 'b-001' };
      service.sendToUser('user-001', payload);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it('does not throw when target user is not connected', () => {
      expect(() =>
        service.sendToUser('offline-user', { type: 'test' }),
      ).not.toThrow();
    });

    it('skips send if client socket is not in OPEN state', () => {
      const ws = { ...createMockWebSocketClient(), readyState: 3 }; // CLOSED
      service.registerClient('user-closed', ws as any);

      service.sendToUser('user-closed', { type: 'test' });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ── broadcast ──────────────────────────────────────────────────────────────

  describe('broadcast()', () => {
    it('sends a message to all connected clients', () => {
      const clients = ['u1', 'u2', 'u3'].map(() => createMockWebSocketClient());
      clients.forEach((ws, i) => service.registerClient(`user-${i}`, ws as any));

      service.broadcast({ type: 'system_notice', message: 'Maintenance in 5 minutes' });

      clients.forEach((ws) => expect(ws.send).toHaveBeenCalledTimes(1));
    });

    it('excludes closed connections during broadcast', () => {
      const openWs = createMockWebSocketClient(); // readyState = 1 (OPEN)
      const closedWs = { ...createMockWebSocketClient(), readyState: 3 };

      service.registerClient('open-user', openWs as any);
      service.registerClient('closed-user', closedWs as any);

      service.broadcast({ type: 'test' });

      expect(openWs.send).toHaveBeenCalledTimes(1);
      expect(closedWs.send).not.toHaveBeenCalled();
    });
  });

  // ── subscribeToBookingUpdates ──────────────────────────────────────────────

  describe('subscribeToBookingUpdates()', () => {
    it('subscribes client to booking room', async () => {
      const ws = createMockWebSocketClient();
      service.registerClient('user-001', ws as any);

      await service.subscribeToBookingUpdates('user-001', 'booking-abc');

      expect(redis.sadd).toHaveBeenCalledWith('room:booking:booking-abc', 'user-001');
    });

    it('throws if user is not connected', async () => {
      await expect(
        service.subscribeToBookingUpdates('offline', 'booking-xyz'),
      ).rejects.toThrow(/not connected/i);
    });
  });

  // ── publishBookingEvent ────────────────────────────────────────────────────

  describe('publishBookingEvent()', () => {
    it('publishes event to Redis and delivers to subscribed users', async () => {
      const ws = createMockWebSocketClient();
      service.registerClient('user-001', ws as any);
      redis.smembers.mockResolvedValue(['user-001']);

      const event = { type: 'booking_status_changed', bookingId: 'b-001', status: 'confirmed' };
      await service.publishBookingEvent('b-001', event);

      expect(redis.publish).toHaveBeenCalledWith('booking:events', JSON.stringify(event));
    });
  });

  // ── heartbeat / ping ───────────────────────────────────────────────────────

  describe('heartbeat()', () => {
    it('pings all connected clients', () => {
      const clients = [createMockWebSocketClient(), createMockWebSocketClient()];
      clients.forEach((ws, i) => service.registerClient(`user-hb-${i}`, ws as any));

      service.heartbeat();

      clients.forEach((ws) => expect(ws.ping).toHaveBeenCalledTimes(1));
    });

    it('removes unresponsive clients after failed ping', () => {
      const unresponsive = createMockWebSocketClient();
      unresponsive.ping.mockImplementation((_: any, __: any, cb: Function) => cb(new Error('timeout')));

      service.registerClient('dead-user', unresponsive as any);
      service.heartbeat();

      expect(service.getClientCount()).toBe(0);
    });
  });
});
