import http from 'http';
import { Server } from 'socket.io';
const { io: ClientIO } = require('socket.io-client');
import {
  attachAnalyticsHandlers,
  broadcastDistributionEvent,
  broadcastRevenueUpdate,
  broadcastAnalyticsAlert,
} from '../../../src/websockets/analyticsHandler';

describe('Analytics WebSocket handler (#245)', () => {
  let httpServer: http.Server;
  let io: Server;
  let authenticatedClient: any;
  let unauthenticatedClient: any;
  let port: number;

  const MOCK_JWT_USER = { sub: 'user-123', role: 'admin' };

  beforeAll((done) => {
    httpServer = http.createServer();
    io = new Server(httpServer, { cors: { origin: '*' } });

    // Inject mock auth middleware: if token === 'valid-token', set socket.data.user
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (token === 'valid-token') {
        (socket as any).data = { user: MOCK_JWT_USER };
      }
      next();
    });

    attachAnalyticsHandlers(io);

    httpServer.listen(0, () => {
      port = (httpServer.address() as any).port;

      authenticatedClient = ClientIO(`http://localhost:${port}`, {
        auth: { token: 'valid-token' },
      });
      unauthenticatedClient = ClientIO(`http://localhost:${port}`);

      let ready = 0;
      const onConnect = () => { if (++ready === 2) done(); };
      authenticatedClient.on('connect', onConnect);
      unauthenticatedClient.on('connect', onConnect);
    });
  });

  afterAll(() => {
    authenticatedClient.close();
    unauthenticatedClient.close();
    io.close();
    httpServer.close();
  });

  it('authenticated client can subscribe to analytics room', (done) => {
    authenticatedClient.emit('subscribe_analytics');
    authenticatedClient.once('analytics_subscribed', (data: any) => {
      expect(data.room).toBe('analytics');
      done();
    });
  });

  it('unauthenticated client receives error on subscribe attempt', (done) => {
    unauthenticatedClient.emit('subscribe_analytics');
    unauthenticatedClient.once('error', (data: any) => {
      expect(data.message).toMatch(/authentication/i);
      done();
    });
  });

  it('broadcasts distribution_event to analytics room', (done) => {
    authenticatedClient.emit('subscribe_analytics');
    authenticatedClient.once('analytics_subscribed', () => {
      authenticatedClient.once('distribution_event', (data: any) => {
        expect(data.distributionId).toBe('dist-001');
        expect(data.amount).toBe(5000);
        done();
      });
      broadcastDistributionEvent(io, {
        distributionId: 'dist-001',
        amount: 5000,
        currency: 'XLM',
        timestamp: new Date(),
      });
    });
  });

  it('broadcasts revenue_update to analytics room', (done) => {
    authenticatedClient.emit('subscribe_analytics');
    authenticatedClient.once('analytics_subscribed', () => {
      authenticatedClient.once('revenue_update', (data: any) => {
        expect(data.bookingId).toBe('bk-999');
        expect(data.delta).toBe(200);
        done();
      });
      broadcastRevenueUpdate(io, {
        bookingId: 'bk-999',
        revenueCents: 10200,
        delta: 200,
        timestamp: new Date(),
      });
    });
  });

  it('broadcasts analytics_alert to analytics room', (done) => {
    authenticatedClient.emit('subscribe_analytics');
    authenticatedClient.once('analytics_subscribed', () => {
      authenticatedClient.once('analytics_alert', (data: any) => {
        expect(data.type).toBe('anomaly');
        expect(data.severity).toBe('high');
        done();
      });
      broadcastAnalyticsAlert(io, {
        alertId: 'alert-001',
        type: 'anomaly',
        severity: 'high',
        message: 'Revenue spike detected',
        timestamp: new Date(),
      });
    });
  });
});
