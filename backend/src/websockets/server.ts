import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import http from 'http';
import logger from '../utils/logger';
import { config } from '../config';

// Interface for typed events
interface ServerToClientEvents {
  priceUpdate: (data: { flightId: string; price: number; timestamp: Date }) => void;
  alert: (data: { message: string; flightId: string }) => void;
}

interface ClientToServerEvents {
  subscribe: (flightId: string) => void;
  unsubscribe: (flightId: string) => void;
}

export class WebSocketServer {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private pubClient: any;
  private subClient: any;

  constructor(httpServer: http.Server) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.corsOrigin || '*', // Configure appropriately for production
        methods: ['GET', 'POST']
      }
    });

    this.setupRedisAdapter();
    this.setupConnectionHandlers();
  }

  private async setupRedisAdapter() {
    try {
      const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      this.pubClient = createClient({ url: redisUrl });
      this.subClient = this.pubClient.duplicate();

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      this.io.adapter(createAdapter(this.pubClient, this.subClient));
      logger.info('WebSocket Redis Adapter initialized');
    } catch (error) {
      logger.error('Failed to initialize Redis Adapter for WebSocket', error);
    }
  }

  private setupConnectionHandlers() {
    this.io.use((socket, next) => {
      // Middleware for authentication
      // In a real app, verify JWT token from socket.handshake.auth.token
      const token = socket.handshake.auth.token;
      if (token) {
        // verify(token)...
        return next();
      }
      // For now, allow unauthenticated for demo or throw error
      // return next(new Error('Authentication error'));
      next();
    });

    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      socket.on('subscribe', (flightId: string) => {
        logger.info(`Client ${socket.id} subscribed to flight ${flightId}`);
        socket.join(`flight:${flightId}`);
      });

      socket.on('unsubscribe', (flightId: string) => {
        logger.info(`Client ${socket.id} unsubscribed from flight ${flightId}`);
        socket.leave(`flight:${flightId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  public broadcastPriceUpdate(flightId: string, price: number) {
    this.io.to(`flight:${flightId}`).emit('priceUpdate', {
      flightId,
      price,
      timestamp: new Date()
    });
  }
}

let wsServer: WebSocketServer | null = null;

export const initWebSocket = (httpServer: http.Server) => {
  wsServer = new WebSocketServer(httpServer);
  return wsServer;
};

export const getWebSocketServer = () => {
  if (!wsServer) {
    throw new Error('WebSocket Server not initialized');
  }
  return wsServer;
};
