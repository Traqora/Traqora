import { io, Socket } from 'socket.io-client';

type PriceUpdate = { flightId: string; price: number; currency?: string };
type BookingStatus = { bookingId: string; status: string };
type FlightAlert = {
  message: string;
  flightId: string;
  status?: string;
  gate?: string;
  delayMinutes?: number;
  timestamp?: Date;
};
type FlightStatusValue = 'SCHEDULED' | 'DELAYED' | 'GATE_CHANGED' | 'BOARDING' | 'CANCELLED' | 'LANDED';
type FlightStatusChange = {
  flightId: string;
  status: FlightStatusValue;
  detail?: string;
  timestamp: Date;
};

// Flight Status Types
type FlightStatusUpdate = {
  flightId: string;
  flightNumber: string;
  airline: string;
  eventType: string;
  delayMinutes?: number;
  gate?: string;
  terminal?: string;
  status: string;
  cancellationReason?: string;
  message?: string;
  timestamp: string;
};

type FlightDelayed = FlightStatusUpdate & { delayMinutes: number };
type GateChanged = FlightStatusUpdate & { previousGate: string; newGate: string };
type FlightCancelled = FlightStatusUpdate & { cancellationReason: string };
type BoardingReminder = FlightStatusUpdate & { gate: string; terminal: string };

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

  // Flight Status Event Handlers
  onFlightStatusUpdate(fn: (data: FlightStatusUpdate) => void) {
    this.socket?.on('flight-status-update', fn);
  }

  onFlightDelayed(fn: (data: FlightDelayed) => void) {
    this.socket?.on('flight-delayed', fn);
  }

  onGateChanged(fn: (data: GateChanged) => void) {
    this.socket?.on('gate-changed', fn);
  }

  onFlightCancelled(fn: (data: FlightCancelled) => void) {
    this.socket?.on('flight-cancelled', fn);
  }

  onBoardingReminder(fn: (data: BoardingReminder) => void) {
    this.socket?.on('boarding-reminder', fn);
  onFlightAlert(fn: (data: FlightAlert) => void) {
    // server emits "alert" (flight status changes: delays, cancellations, gate changes)
    this.socket?.on('alert', fn);
  }

  /** Server emits "flight_status" (issue #333) — the typed status enum + optional detail, distinct from "alert"'s free-text message. */
  onFlightStatus(fn: (data: FlightStatusChange) => void) {
    this.socket?.on('flight_status', fn);
  }

  /** Joins the `flight:<flightId>` room so flight_status/alert/priceUpdate events for it are delivered to this socket (issue #333). */
  subscribeFlight(flightId: string) {
    this.socket?.emit('subscribe', flightId);
  }

  unsubscribeFlight(flightId: string) {
    this.socket?.emit('unsubscribe', flightId);
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
export type { PriceUpdate, BookingStatus, FlightStatusUpdate, FlightDelayed, GateChanged, FlightCancelled, BoardingReminder };