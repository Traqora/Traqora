import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import http from 'http';
import { logger } from '../utils/logger';
import { config } from '../config';
import jwt from 'jsonwebtoken';

// Interface for typed events
interface ServerToClientEvents {
  priceUpdate: (data: { flightId: string; price: number; timestamp: Date }) => void;
  alert: (data: { message: string; flightId: string }) => void;
  booking_status: (data: { bookingId: string; status: string; timestamp: Date }) => void;
}

interface ClientToServerEvents {
  subscribe: (flightId: string) => void;
  unsubscribe: (flightId: string) => void;
}

export class WebSocketServer {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private pubClient: any;
  private subClient: any;
  private redisEnabled: boolean = false; // Track Redis status

  constructor(httpServer: http.Server) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.corsOrigin || '*',
        methods: ['GET', 'POST']
      }
    });

    // Setup connection handlers immediately
    this.setupConnectionHandlers();
    
    // Setup Redis adapter asynchronously but don't block
    this.setupRedisAdapter().catch(error => {
      logger.error('Redis adapter setup failed, continuing with in-memory adapter:', error);
    });
  }

  private async setupRedisAdapter() {
    try {
      const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://172.20.145.159:6379';
      logger.info(`Attempting to connect to Redis at: ${redisUrl}`);
      
      this.pubClient = createClient({ url: redisUrl });
      this.subClient = this.pubClient.duplicate();

      // Add error handlers before connecting
      this.pubClient.on('error', (err: any) => {
        logger.error(`Redis Publisher error: ${err.message}`);
        this.redisEnabled = false;
      });

      this.subClient.on('error', (err: any) => {
        logger.error(`Redis Subscriber error: ${err.message}`);
        this.redisEnabled = false;
      });

      // Connect with timeout
      await Promise.race([
        Promise.all([this.pubClient.connect(), this.subClient.connect()]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);

      // Apply Redis adapter
      this.io.adapter(createAdapter(this.pubClient, this.subClient));
      this.redisEnabled = true;
      logger.info('✅ WebSocket Redis Adapter initialized successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ Redis adapter not initialized (using in-memory adapter): ${errorMessage}`);
      this.redisEnabled = false;
      
      // Clean up any partial connections
      if (this.pubClient) {
        try { this.pubClient.quit(); } catch (e) {}
      }
      if (this.subClient) {
        try { this.subClient.quit(); } catch (e) {}
      }
    }
  }

  private setupConnectionHandlers() {
    // Add connection logging middleware
    this.io.use((socket, next) => {
      logger.info(`Socket connection attempt: ${socket.id}`);
      next();
    });

    // Authentication middleware: verify JWT if provided, attach to socket.data.user
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) return next();

      try {
        const payload = jwt.verify(token, config.jwtSecret) as any;
        (socket as any).data = (socket as any).data || {};
        (socket as any).data.user = payload;
        logger.info(`Socket ${socket.id} authenticated (user=${payload?.sub || payload?.id || 'unknown'})`);
      } catch (err) {
        logger.warn(`Socket ${socket.id} failed auth: ${(err as any)?.message || err}`);
        // allow connection to proceed but unauthenticated
      }
      return next();
    });

    this.io.on('connection', (socket: Socket) => {
      logger.info(`✅ Client connected: ${socket.id} (Redis: ${this.redisEnabled ? 'enabled' : 'disabled'})`);

      socket.on('subscribe', (flightId: string) => {
        logger.info(`Client ${socket.id} subscribed to flight ${flightId}`);
        socket.join(`flight:${flightId}`);
      });

      socket.on('unsubscribe', (flightId: string) => {
        logger.info(`Client ${socket.id} unsubscribed from flight ${flightId}`);
        socket.leave(`flight:${flightId}`);
      });

      socket.on('subscribe_booking', (bookingId: string) => {
        logger.info(`Client ${socket.id} subscribed to booking ${bookingId}`);
        socket.join(`booking:${bookingId}`);
      });

      socket.on('unsubscribe_booking', (bookingId: string) => {
        logger.info(`Client ${socket.id} unsubscribed from booking ${bookingId}`);
        socket.leave(`booking:${bookingId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`🔴 Client disconnected: ${socket.id}`);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket ${socket.id} error:`, error);
      });
    });

    // Handle server-level errors
    this.io.engine.on('connection_error', (err: any) => {
      logger.error('Engine connection error:', err);
    });
  }

  public broadcastPriceUpdate(flightId: string, price: number) {
    const room = `flight:${flightId}`;
    logger.info(`Broadcasting price update to ${room}: $${price}`);
    
    this.io.to(room).emit('priceUpdate', {
      flightId,
      price,
      timestamp: new Date()
    });
  }

  public broadcastBookingStatus(bookingId: string, status: string) {
    const room = `booking:${bookingId}`;
    logger.info(`Broadcasting booking status to ${room}: ${status}`);
    this.io.to(room).emit('booking_status', {
      bookingId,
      status,
      timestamp: new Date(),
    });
  }

  // Method to check Redis status
  public isRedisEnabled(): boolean {
    return this.redisEnabled;
  }
}

let wsServer: WebSocketServer | null = null;

export const initWebSocket = (httpServer: http.Server) => {
  logger.info('Initializing WebSocket server...');
  wsServer = new WebSocketServer(httpServer);
  return wsServer;
};

export const getWebSocketServer = () => {
  if (!wsServer) {
    throw new Error('WebSocket Server not initialized');
  }
  return wsServer;
};
