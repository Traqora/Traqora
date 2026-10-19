import http from 'http';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io: ClientIO } = require('socket.io-client');

import { WebSocketServer } from '../../src/websockets/server';
import { Server } from 'socket.io';
import { attachChatHandlers } from '../../src/websockets/chatHandler';

describe('Chat WebSocket Handler', () => {
  let httpServer: http.Server;
  let io: Server;
  let clientSocket: any;
  const port = 3002;

  beforeAll((done) => {
    httpServer = http.createServer();
    io = new Server(httpServer);
    attachChatHandlers(io);
    
    httpServer.listen(port, () => {
      done();
    });
  });

  afterAll((done) => {
    io.close();
    httpServer.close(() => {
      done();
    });
  });

  beforeEach((done) => {
    clientSocket = ClientIO(`http://localhost:${port}/chat`, {
      query: { userId: 'test-user', sessionId: 'test-session' },
    });
    clientSocket.on('connect', done);
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  test('should connect to chat namespace', (done) => {
    expect(clientSocket.connected).toBe(true);
    done();
  });

  test('should receive chat history', (done) => {
    clientSocket.emit('get:history');
    clientSocket.on('history', (data: any) => {
      expect(data).toHaveProperty('messages');
      expect(Array.isArray(data.messages)).toBe(true);
      done();
    });
  });

  test('should send and receive messages', (done) => {
    const testMessage = 'How do I get a refund?';
    
    clientSocket.on('message:new', (message: any) => {
      if (message.from === 'user') {
        expect(message.text).toBe(testMessage);
      } else if (message.from === 'bot') {
        expect(message.text).toBeTruthy();
        done();
      }
    });

    clientSocket.emit('message:send', { text: testMessage });
  });

  test('should handle typing indicators', (done) => {
    clientSocket.emit('typing:start');
    
    setTimeout(() => {
      clientSocket.emit('typing:stop');
      done();
    }, 100);
  });

  test('should handle session end', (done) => {
    clientSocket.emit('session:end');
    
    setTimeout(() => {
      done();
    }, 100);
  });

  test('should handle survey submission', (done) => {
    clientSocket.on('survey:received', (data: any) => {
      expect(data.success).toBe(true);
      done();
    });

    clientSocket.emit('survey:submit', { rating: 5, feedback: 'Great service!' });
  });
});
