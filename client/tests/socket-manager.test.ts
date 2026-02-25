import { SocketManager } from '../lib/socket'
import { EventEmitter } from 'events'

// monkey-patch io() to return our emitter for test
jest.mock('socket.io-client', () => {
  const EventEmitter = require('events');
  return {
    io: jest.fn(() => new EventEmitter()),
  };
});

test('SocketManager basic API', () => {
  const m = new SocketManager('http://localhost:3001')
  expect(typeof m.connect).toBe('function')
  expect(typeof m.disconnect).toBe('function')
  expect(typeof m.on).toBe('function')
});

test('SocketManager handles price updates', () => {
  const m = new SocketManager('http://localhost:3001');
  const handler = jest.fn();
  m.connect();
  m.onPriceUpdate(handler);
  // fire event on underlying socket
  (m as any).socket.emit('priceUpdate', { flightId: 'a', price: 5 });
  expect(handler).toHaveBeenCalledWith({ flightId: 'a', price: 5 });
});
