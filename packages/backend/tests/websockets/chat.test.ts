import http from 'http';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io: ClientIO } = require('socket.io-client');
import { WebSocketServer } from '../../src/websockets/server';

describe('WebSocket chat support (issue #379)', () => {
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
    client.removeAllListeners('chat:reply');
  });

  test('replies with a matched FAQ answer for a recognized question', (done) => {
    client.once('chat:reply', (data: any) => {
      expect(data.escalated).toBe(false);
      expect(data.message.from).toBe('bot');
      expect(data.message.text).toMatch(/refund/i);
      done();
    });

    client.emit('chat:message', 'when do I get my refund?');
  });

  test('escalates and marks the message as from an agent when nothing matches', (done) => {
    client.once('chat:reply', (data: any) => {
      expect(data.escalated).toBe(true);
      expect(data.message.from).toBe('agent');
      done();
    });

    client.emit('chat:message', 'my pet iguana needs a visa');
  });

  test('escalates immediately on an explicit human request', (done) => {
    client.once('chat:reply', (data: any) => {
      expect(data.escalated).toBe(true);
      done();
    });

    client.emit('chat:message', 'let me speak to a human agent please');
  });

  test('keeps a message history that grows across messages', (done) => {
    const freshClient = ClientIO(`http://localhost:${(httpServer.address() as any).port}`);
    freshClient.on('connect', () => {
      freshClient.once('chat:reply', () => {
        const historyAfterFirst = ws.getChatHistory(freshClient.id);
        expect(historyAfterFirst).toHaveLength(2); // user message + bot reply

        freshClient.once('chat:reply', () => {
          const historyAfterSecond = ws.getChatHistory(freshClient.id);
          expect(historyAfterSecond).toHaveLength(4);
          freshClient.close();
          done();
        });

        freshClient.emit('chat:message', 'how do I check-in online');
      });

      freshClient.emit('chat:message', 'what is my baggage allowance');
    });
  });
});
