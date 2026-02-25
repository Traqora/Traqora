import { io, Socket } from 'socket.io-client';

type PriceUpdate = { flightId: string; price: number; currency?: string };
type BookingStatus = { bookingId: string; status: string };

class SocketManager {
  private socket: Socket | null = null;
  private url: string;
  private namespace = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 8;

  constructor(url?: string) {
    this.url = url || (typeof window !== 'undefined' ? window.location.origin : '');
  }

  connect(authToken?: string) {
    if (this.socket && this.socket.connected) return;

    const opts: any = {
      reconnection: false,
      auth: {},
    };

    if (authToken) opts.auth.token = authToken;

    this.socket = io(this.url + this.namespace, opts);

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
    });

    this.socket.on('connect_error', (err) => {
      this.scheduleReconnect();
      console.warn('Socket connect_error', err?.message || err);
    });

    this.socket.on('disconnect', (reason) => {
      this.scheduleReconnect();
      console.warn('Socket disconnected', reason);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);
    this.reconnectAttempts += 1;
    setTimeout(() => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || undefined : undefined;
      this.connect(token);
    }, delay);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  onPriceUpdate(fn: (data: PriceUpdate) => void) {
    // server emits "priceUpdate"
    this.socket?.on('priceUpdate', fn);
  }

  onBookingStatus(fn: (data: BookingStatus) => void) {
    this.socket?.on('booking_status', fn);
  }

  on(event: string, fn: (...args: any[]) => void) {
    this.socket?.on(event, fn);
  }

  off(event: string, fn?: (...args: any[]) => void) {
    if (!this.socket) return;
    if (fn) this.socket.off(event, fn);
    else this.socket.removeAllListeners(event);
  }

  emit(event: string, payload?: any) {
    this.socket?.emit(event, payload);
  }

  isConnected() {
    return !!this.socket && this.socket.connected;
  }
}

const defaultManager = new SocketManager();

export { SocketManager, defaultManager };
