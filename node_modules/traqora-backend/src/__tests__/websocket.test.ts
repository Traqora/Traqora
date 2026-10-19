import http from 'http';
// note: using require for client to avoid missing types
const { io: ClientIO } = require('socket.io-client');
import { WebSocketServer } from '../websockets/server';

describe('WebSocketServer', () => {
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

  test('broadcastPriceUpdate should emit to room', (done) => {
    const flightId = 'room123';
    client.emit('subscribe', flightId);
    client.on('priceUpdate', (data: any) => {
      expect(data.flightId).toBe(flightId);
      expect(typeof data.price).toBe('number');
      done();
    });
    setTimeout(() => {
      ws.broadcastPriceUpdate(flightId, 42);
    }, 50);
  });
});
