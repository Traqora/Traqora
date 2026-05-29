/**
 * WebSocket Integration Tests
 * Spins up a real HTTP/WS server and exercises the full handshake,
 * message routing, and event broadcasting pipeline.
 */

import http from 'http';
import WebSocket from 'ws';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createMockRepository, createMockRedisClient } from '../helpers/mocks';
import { createUser, createBooking } from '../helpers/factories';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function connectWS(server: http.Server, path = '/ws', token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const url = `ws://localhost:${address.port}${path}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket message timeout')), 5000);
    ws.once('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('WebSocket Integration', () => {
  let app: Express.Application;
  let server: http.Server;
  let userRepo: ReturnType<typeof createMockRepository>;
  let redis: ReturnType<typeof createMockRedisClient>;

  beforeAll(async () => {
    userRepo = createMockRepository();
    redis = createMockRedisClient();

    app = createApp({ userRepo: userRepo as any, redis: redis as any });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve)); // random port
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => jest.clearAllMocks());

  // ── connection ─────────────────────────────────────────────────────────────

  describe('connection', () => {
    it('accepts a WebSocket connection on /ws', async () => {
      const user = createUser();
      userRepo.findOneBy.mockResolvedValue(user);

      const ws = await connectWS(server, '/ws', 'valid-token');
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('rejects connection with invalid JWT token (401)', async () => {
      await expect(connectWS(server, '/ws', 'invalid-token')).rejects.toThrow();
    });

    it('sends a welcome message on successful connection', async () => {
      const user = createUser();
      userRepo.findOneBy.mockResolvedValue(user);

      const ws = await connectWS(server, '/ws', 'valid-token');
      const message = await waitForMessage(ws);

      expect(message.type).toBe('connected');
      expect(message.userId).toBe(user.id);
      ws.close();
    });
  });

  // ── booking event subscription ─────────────────────────────────────────────

  describe('booking event subscription', () => {
    it('receives booking_confirmed event after confirmation', async () => {
      const user = createUser();
      const booking = createBooking({ userId: user.id });
      userRepo.findOneBy.mockResolvedValue(user);

      const ws = await connectWS(server, '/ws', 'valid-token');
      await waitForMessage(ws); // discard welcome

      // Subscribe to booking updates
      ws.send(JSON.stringify({ action: 'subscribe', channel: `booking:${booking.id}` }));

      // Simulate the server emitting a booking event (via API endpoint that triggers broadcast)
      await request(app)
        .post(`/internal/emit`)
        .send({ channel: `booking:${booking.id}`, event: { type: 'booking_confirmed', bookingId: booking.id } });

      const event = await waitForMessage(ws);
      expect(event.type).toBe('booking_confirmed');
      expect(event.bookingId).toBe(booking.id);

      ws.close();
    });

    it('does NOT receive events for channels it did not subscribe to', async () => {
      const user = createUser();
      userRepo.findOneBy.mockResolvedValue(user);

      const ws = await connectWS(server, '/ws', 'valid-token');
      await waitForMessage(ws); // welcome

      // Subscribe to booking-A only
      ws.send(JSON.stringify({ action: 'subscribe', channel: 'booking:booking-A' }));

      // Emit event on booking-B
      await request(app)
        .post(`/internal/emit`)
        .send({ channel: 'booking:booking-B', event: { type: 'booking_confirmed', bookingId: 'booking-B' } });

      const received = await Promise.race([
        waitForMessage(ws).then(() => true),
        new Promise<false>((r) => setTimeout(() => r(false), 500)),
      ]);

      expect(received).toBe(false); // should NOT have received anything
      ws.close();
    });
  });

  // ── price alert subscription ───────────────────────────────────────────────

  describe('price alert subscription', () => {
    it('receives price_drop event when price falls below target', async () => {
      const user = createUser();
      userRepo.findOneBy.mockResolvedValue(user);

      const ws = await connectWS(server, '/ws', 'valid-token');
      await waitForMessage(ws); // welcome

      ws.send(JSON.stringify({ action: 'subscribe', channel: `price:LOS-LHR` }));

      await request(app)
        .post('/internal/emit')
        .send({ channel: 'price:LOS-LHR', event: { type: 'price_drop', origin: 'LOS', destination: 'LHR', newPrice: 320 } });

      const event = await waitForMessage(ws);
      expect(event.type).toBe('price_drop');
      expect(event.newPrice).toBe(320);

      ws.close();
    });
  });

  // ── disconnection ──────────────────────────────────────────────────────────

  describe('disconnection', () => {
    it('removes client from registry on disconnect', async () => {
      const user = createUser();
      userRepo.findOneBy.mockResolvedValue(user);

      const ws = await connectWS(server, '/ws', 'valid-token');
      await waitForMessage(ws); // welcome

      const beforeClose = await request(app).get('/internal/ws/stats');
      expect(beforeClose.body.connectedClients).toBeGreaterThan(0);

      ws.close();
      await new Promise((r) => setTimeout(r, 100)); // allow cleanup

      const afterClose = await request(app).get('/internal/ws/stats');
      expect(afterClose.body.connectedClients).toBe(0);
    });
  });

  // ── broadcast ──────────────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('delivers system announcement to all connected clients', async () => {
      const users = [createUser(), createUser()];
      userRepo.findOneBy
        .mockResolvedValueOnce(users[0])
        .mockResolvedValueOnce(users[1]);

      const clients = await Promise.all([
        connectWS(server, '/ws', 'token-a'),
        connectWS(server, '/ws', 'token-b'),
      ]);

      // Discard welcome messages
      await Promise.all(clients.map(waitForMessage));

      await request(app)
        .post('/internal/broadcast')
        .send({ event: { type: 'system_announcement', message: 'Scheduled maintenance tonight' } });

      const messages = await Promise.all(clients.map(waitForMessage));
      messages.forEach((msg) => {
        expect(msg.type).toBe('system_announcement');
      });

      clients.forEach((ws) => ws.close());
    });
  });
});
