import http from 'http';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io: ClientIO } = require('socket.io-client');
import { WebSocketServer } from '../../src/websockets/server';

describe('WebSocket flight status push notifications (issue #381)', () => {
  let httpServer: http.Server;
  let ws: WebSocketServer;
  let client: any;

  beforeAll((done) => {
    httpServer = http.createServer();
    ws = new WebSocketServer(httpServer as any);
    httpServer.listen(0, () => {
      const port = (httpServer.address() as any).port;
      client = ClientIO(`http://localhost:${port}`);
      client.on('connect', done);
    });
  });

  afterAll(() => {
    client.close();
    httpServer.close();
  });

  afterEach(() => {
    client.removeAllListeners('flight_status');
  });

  test('delivers a delay notification to clients subscribed to that flight', (done) => {
    const flightId = 'flight-abc';
    client.emit('subscribe', flightId);

    client.once('flight_status', (data: any) => {
      expect(data.flightId).toBe(flightId);
      expect(data.status).toBe('DELAYED');
      expect(data.detail).toBe('New departure: 14:45');
      done();
    });

    setTimeout(() => {
      ws.broadcastFlightStatus(flightId, 'DELAYED', 'New departure: 14:45');
    }, 50);
  });

  test('delivers a gate change notification', (done) => {
    const flightId = 'flight-gate-change';
    client.emit('subscribe', flightId);

    client.once('flight_status', (data: any) => {
      expect(data.status).toBe('GATE_CHANGED');
      expect(data.detail).toBe('Gate B12');
      done();
    });

    setTimeout(() => {
      ws.broadcastFlightStatus(flightId, 'GATE_CHANGED', 'Gate B12');
    }, 50);
  });

  test('does not deliver to clients subscribed to a different flight room', (done) => {
    const subscribedFlight = 'flight-relevant';
    const otherFlight = 'flight-irrelevant';
    client.emit('subscribe', subscribedFlight);

    const handler = jest.fn();
    client.on('flight_status', handler);

    setTimeout(() => {
      ws.broadcastFlightStatus(otherFlight, 'CANCELLED');
    }, 50);

    setTimeout(() => {
      expect(handler).not.toHaveBeenCalled();
      client.off('flight_status', handler);
      done();
    }, 150);
  });

  test('supports a cancellation with no detail payload', (done) => {
    const flightId = 'flight-cancel';
    client.emit('subscribe', flightId);

    client.once('flight_status', (data: any) => {
      expect(data.status).toBe('CANCELLED');
      expect(data.detail).toBeUndefined();
      done();
    });

    setTimeout(() => {
      ws.broadcastFlightStatus(flightId, 'CANCELLED');
    }, 50);
  });
});
