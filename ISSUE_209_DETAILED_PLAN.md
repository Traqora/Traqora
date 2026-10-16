# Issue #209: Real-Time Flight Status Updates - Detailed Plan

## Objective
Implement WebSocket-based real-time flight status updates with push notifications and historical tracking.

## Priority: High | Type: Feature | Estimated Duration: 3-4 weeks

---

## Phase 1: Flight Status Service

### 1.1 Create Flight Status Service
**File:** `packages/backend/src/services/flight-status.ts`

```typescript
import { AppDataSource } from '../db/dataSource';
import { Flight } from '../db/entities/Flight';
import { FlightStatusHistory } from '../db/entities/FlightStatusHistory';
import { getWebSocketServer } from '../websockets/server';
import { PushNotificationService } from './PushNotificationService';
import { logger } from '../utils/logger';

export interface FlightStatusUpdate {
  flightId: string;
  previousStatus: string;
  newStatus: string;
  delayMinutes?: number;
  gate?: string;
  terminal?: string;
  cancellationReason?: string;
  timestamp: Date;
}

export class FlightStatusService {
  private flightRepo = AppDataSource.getRepository(Flight);
  private statusHistoryRepo = AppDataSource.getRepository(FlightStatusHistory);
  private pushService = new PushNotificationService();
  private wsServer = getWebSocketServer();

  /**
   * Update flight status and broadcast to subscribed clients
   */
  async updateFlightStatus(update: FlightStatusUpdate): Promise<void> {
    try {
      // Fetch current flight
      const flight = await this.flightRepo.findOne({
        where: { id: update.flightId }
      });

      if (!flight) {
        throw new Error(`Flight not found: ${update.flightId}`);
      }

      // Check if status actually changed
      if (flight.status === update.newStatus && flight.delayMinutes === update.delayMinutes) {
        logger.info(`No status change for flight ${update.flightId}`);
        return;
      }

      // Record status change history
      await this.recordStatusHistory(update);

      // Update flight entity
      flight.status = update.newStatus;
      if (update.delayMinutes !== undefined) {
        flight.delayMinutes = update.delayMinutes;
      }
      if (update.gate) {
        flight.gate = update.gate;
      }
      if (update.terminal) {
        flight.terminal = update.terminal;
      }
      if (update.cancellationReason) {
        flight.cancellationReason = update.cancellationReason;
      }
      flight.updatedAt = new Date();

      // Save to database
      await this.flightRepo.save(flight);

      // Broadcast via WebSocket
      this.broadcastStatusUpdate(update);

      // Send push notifications
      await this.sendPushNotifications(update);

      logger.info(`Flight status updated: ${update.flightId} -> ${update.newStatus}`);
    } catch (error) {
      logger.error(`Error updating flight status:`, error);
      throw error;
    }
  }

  /**
   * Record status change in history
   */
  private async recordStatusHistory(update: FlightStatusUpdate): Promise<void> {
    const history = this.statusHistoryRepo.create({
      flightId: update.flightId,
      previousStatus: update.previousStatus,
      newStatus: update.newStatus,
      delayMinutes: update.delayMinutes,
      gate: update.gate,
      terminal: update.terminal,
      cancellationReason: update.cancellationReason,
      timestamp: update.timestamp
    });

    await this.statusHistoryRepo.save(history);
  }

  /**
   * Broadcast status update via WebSocket
   */
  private broadcastStatusUpdate(update: FlightStatusUpdate): void {
    if (!this.wsServer) {
      logger.warn('WebSocket server not available');
      return;
    }

    // Broadcast to all users subscribed to this flight
    const flightRoom = `flight:${update.flightId}`;
    
    this.wsServer.io.to(flightRoom).emit('flightStatusChange', {
      flightId: update.flightId,
      previousStatus: update.previousStatus,
      newStatus: update.newStatus,
      delayMinutes: update.delayMinutes,
      gate: update.gate,
      terminal: update.terminal,
      cancellationReason: update.cancellationReason,
      timestamp: update.timestamp
    });
  }

  /**
   * Send push notifications for significant changes
   */
  private async sendPushNotifications(update: FlightStatusUpdate): Promise<void> {
    try {
      // Only send for significant changes
      if (update.previousStatus === update.newStatus) return;

      let notificationTitle = '';
      let notificationBody = '';
      let shouldNotify = true;

      switch (update.newStatus) {
        case 'DELAYED':
          if (update.delayMinutes && update.delayMinutes > 15) {
            notificationTitle = 'Flight Delayed';
            notificationBody = `Flight ${update.flightId} is delayed by ${update.delayMinutes} minutes`;
          } else {
            shouldNotify = false;
          }
          break;

        case 'CANCELLED':
          notificationTitle = 'Flight Cancelled';
          notificationBody = `Flight ${update.flightId} has been cancelled`;
          break;

        case 'BOARDING':
          notificationTitle = 'Flight Boarding';
          notificationBody = `Flight ${update.flightId} is now boarding`;
          break;

        case 'LANDED':
          notificationTitle = 'Flight Landed';
          notificationBody = `Flight ${update.flightId} has landed`;
          break;

        default:
          shouldNotify = false;
      }

      if (shouldNotify && notificationTitle) {
        // Get all users with bookings on this flight
        // Send push notifications based on user preferences
        // This will be implemented in Phase 4
        logger.info(`Would send notification: ${notificationTitle} - ${notificationBody}`);
      }
    } catch (error) {
      logger.error('Error sending push notifications:', error);
      // Don't throw - notifications are non-critical
    }
  }

  /**
   * Get flight status history
   */
  async getStatusHistory(flightId: string, limit: number = 50): Promise<FlightStatusHistory[]> {
    return this.statusHistoryRepo
      .createQueryBuilder('history')
      .where('history.flightId = :flightId', { flightId })
      .orderBy('history.timestamp', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get current flight status
   */
  async getFlightStatus(flightId: string): Promise<{
    status: string;
    delayMinutes: number;
    gate?: string;
    terminal?: string;
    cancellationReason?: string;
  } | null> {
    const flight = await this.flightRepo.findOne({
      where: { id: flightId },
      select: ['status', 'delayMinutes', 'gate', 'terminal', 'cancellationReason']
    });

    if (!flight) return null;

    return {
      status: flight.status,
      delayMinutes: flight.delayMinutes,
      gate: flight.gate,
      terminal: flight.terminal,
      cancellationReason: flight.cancellationReason
    };
  }
}

export const flightStatusService = new FlightStatusService();
```

### 1.2 Create Flight Status Sync Job
**File:** `packages/backend/src/jobs/flight-status-sync.ts`

```typescript
import * as cron from 'node-cron';
import { AppDataSource } from '../db/dataSource';
import { Flight } from '../db/entities/Flight';
import { flightStatusService } from '../services/flight-status';
import { amadeusService } from '../services/amadeus';
import { logger } from '../utils/logger';

export class FlightStatusSyncJob {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Start the flight status sync job
   * Runs every 5 minutes
   */
  start(): void {
    // Run every 5 minutes
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.syncFlightStatuses();
    });

    logger.info('Flight status sync job started');
  }

  /**
   * Stop the flight status sync job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
      logger.info('Flight status sync job stopped');
    }
  }

  /**
   * Sync flight statuses from external API
   */
  private async syncFlightStatuses(): Promise<void> {
    try {
      const flightRepo = AppDataSource.getRepository(Flight);

      // Get flights within 24 hours that need syncing
      const flights = await flightRepo
        .createQueryBuilder('flight')
        .where('flight.departureTime > NOW() AND flight.departureTime < NOW() + INTERVAL 24 HOUR')
        .where('flight.lastSyncedAt IS NULL OR flight.lastSyncedAt < NOW() - INTERVAL 5 MINUTE')
        .take(100) // Process in batches
        .getMany();

      if (flights.length === 0) {
        logger.debug('No flights to sync');
        return;
      }

      logger.info(`Syncing ${flights.length} flight statuses`);

      for (const flight of flights) {
        try {
          // Fetch latest status from external API
          const externalStatus = await amadeusService.getFlightStatus(
            flight.flightNumber,
            flight.airlineCode,
            flight.departureTime
          );

          if (!externalStatus) {
            flight.lastSyncError = 'No data from external API';
            flight.syncAttempts++;
            continue;
          }

          // Prepare update
          const previousStatus = flight.status;
          const update = {
            flightId: flight.id,
            previousStatus,
            newStatus: externalStatus.status,
            delayMinutes: externalStatus.delayMinutes,
            gate: externalStatus.gate,
            terminal: externalStatus.terminal,
            cancellationReason: externalStatus.cancellationReason,
            timestamp: new Date()
          };

          // Update flight
          await flightStatusService.updateFlightStatus(update);

          // Update sync metadata
          flight.lastSyncedAt = new Date();
          flight.lastSyncError = null;
          flight.syncAttempts = 0;

        } catch (error) {
          logger.error(`Error syncing flight ${flight.id}:`, error);
          flight.lastSyncError = error.message;
          flight.syncAttempts++;
        }
      }

      // Save all updates
      await flightRepo.save(flights);

    } catch (error) {
      logger.error('Error in flight status sync job:', error);
    }
  }
}

export const flightStatusSyncJob = new FlightStatusSyncJob();
```

---

## Phase 2: WebSocket Event System

### 2.1 Extend WebSocket Server
**File:** `packages/backend/src/websockets/server.ts` (modify)

```typescript
// Add to ServerToClientEvents interface
interface ServerToClientEvents {
  priceUpdate: (data: { flightId: string; price: number; timestamp: Date }) => void;
  alert: (data: { message: string; flightId: string }) => void;
  booking_status: (data: { bookingId: string; status: string; timestamp: Date }) => void;
  
  // NEW: Flight status events
  flightStatusChange: (data: {
    flightId: string;
    previousStatus: string;
    newStatus: string;
    delayMinutes?: number;
    gate?: string;
    terminal?: string;
    cancellationReason?: string;
    timestamp: Date;
  }) => void;
}

interface ClientToServerEvents {
  subscribe: (flightId: string) => void;
  unsubscribe: (flightId: string) => void;
  
  // NEW: Flight subscription events
  subscribeFlight: (flightId: string) => void;
  unsubscribeFlight: (flightId: string) => void;
}

// Add to setupConnectionHandlers()
private setupConnectionHandlers() {
  this.io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    logger.info(`Client connected: ${socket.id}`);

    // Flight status subscription
    socket.on('subscribeFlight', (flightId: string) => {
      try {
        // Validate flight ID format
        if (!this.isValidFlightId(flightId)) {
          socket.emit('error', { message: 'Invalid flight ID' });
          return;
        }

        const room = `flight:${flightId}`;
        socket.join(room);
        logger.info(`Socket ${socket.id} subscribed to ${room}`);

        // Send current status if available
        this.sendCurrentFlightStatus(socket, flightId);
      } catch (error) {
        logger.error(`Error subscribing to flight:`, error);
        socket.emit('error', { message: 'Failed to subscribe' });
      }
    });

    // Flight status unsubscription
    socket.on('unsubscribeFlight', (flightId: string) => {
      const room = `flight:${flightId}`;
      socket.leave(room);
      logger.info(`Socket ${socket.id} unsubscribed from ${room}`);
    });

    // Existing handlers...
    socket.on('subscribe', (flightId: string) => { /* ... */ });
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
}

private isValidFlightId(flightId: string): boolean {
  // UUID validation
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(flightId);
}

private async sendCurrentFlightStatus(socket: Socket, flightId: string): Promise<void> {
  try {
    const status = await flightStatusService.getFlightStatus(flightId);
    if (status) {
      socket.emit('flightStatusChange', {
        flightId,
        newStatus: status.status,
        previousStatus: status.status,
        delayMinutes: status.delayMinutes,
        gate: status.gate,
        terminal: status.terminal,
        cancellationReason: status.cancellationReason,
        timestamp: new Date()
      });
    }
  } catch (error) {
    logger.error(`Error sending current flight status:`, error);
  }
}
```

---

## Phase 3: Client Hook

### 3.1 Create useFlightStatus Hook
**File:** `packages/client/hooks/use-flight-status.ts`

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSocket } from './use-socket'

export interface FlightStatus {
  status: 'SCHEDULED' | 'DELAYED' | 'BOARDING' | 'LANDED' | 'CANCELLED'
  delayMinutes?: number
  gate?: string
  terminal?: string
  cancellationReason?: string
}

export interface StatusUpdate {
  flightId: string
  previousStatus: string
  newStatus: string
  delayMinutes?: number
  gate?: string
  terminal?: string
  cancellationReason?: string
  timestamp: Date
}

export function useFlightStatus(flightId: string | null) {
  const { socket, isConnected } = useSocket()
  const [status, setStatus] = useState<FlightStatus | null>(null)
  const [history, setHistory] = useState<StatusUpdate[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  // Subscribe to flight status updates
  useEffect(() => {
    if (!flightId || !socket || !isConnected) {
      return
    }

    setLoading(true)
    setIsSubscribed(true)

    // Subscribe to flight
    socket.emit('subscribeFlight', flightId)

    // Listen for status changes
    const handleStatusChange = (update: StatusUpdate) => {
      setStatus({
        status: update.newStatus as FlightStatus['status'],
        delayMinutes: update.delayMinutes,
        gate: update.gate,
        terminal: update.terminal,
        cancellationReason: update.cancellationReason
      })

      // Add to history
      setHistory(prev => [update, ...prev])
      setLoading(false)

      // Show notification for significant changes
      if (update.previousStatus !== update.newStatus) {
        notifyStatusChange(update)
      }
    }

    socket.on('flightStatusChange', handleStatusChange)

    return () => {
      socket.off('flightStatusChange', handleStatusChange)
      socket.emit('unsubscribeFlight', flightId)
      setIsSubscribed(false)
    }
  }, [flightId, socket, isConnected])

  const notifyStatusChange = useCallback((update: StatusUpdate) => {
    // Browser notification or toast
    const messages: Record<string, string> = {
      DELAYED: `Flight delayed by ${update.delayMinutes} minutes`,
      CANCELLED: 'Flight cancelled',
      BOARDING: 'Flight is now boarding',
      LANDED: 'Flight has landed'
    }

    const message = messages[update.newStatus]
    if (message && 'Notification' in window) {
      new Notification('Flight Status Update', {
        body: message,
        icon: '/flight-icon.png'
      })
    }
  }, [])

  return {
    status,
    history,
    isSubscribed,
    loading,
    isConnected
  }
}
```

---

## Phase 4: Push Notifications

### 4.1 Extend Push Notification Service
**File:** `packages/backend/src/services/PushNotificationService.ts` (modify)

```typescript
export class PushNotificationService {
  /**
   * Send flight status notification to users
   */
  async sendFlightStatusNotification(
    userId: string,
    flightId: string,
    status: string,
    details: {
      delayMinutes?: number
      gate?: string
      cancellationReason?: string
    }
  ): Promise<void> {
    try {
      // Get user preferences
      const userPreferences = await this.getUserNotificationPreferences(userId)

      // Check if user wants notifications for this type
      if (!userPreferences.flightStatusUpdates) {
        return
      }

      // Get user's push notification tokens
      const tokens = await this.getUserPushTokens(userId)

      if (tokens.length === 0) {
        return
      }

      // Prepare notification
      const notification = {
        title: this.getStatusTitle(status),
        body: this.getStatusBody(status, details),
        data: {
          flightId,
          status,
          deepLink: `/app/flight/${flightId}`
        }
      }

      // Send to all user devices
      for (const token of tokens) {
        await this.sendFirebaseNotification(token, notification)
      }

    } catch (error) {
      logger.error('Error sending flight status notification:', error)
    }
  }

  private getStatusTitle(status: string): string {
    const titles: Record<string, string> = {
      DELAYED: 'Flight Delayed',
      CANCELLED: 'Flight Cancelled',
      BOARDING: 'Flight Boarding',
      LANDED: 'Flight Landed'
    }
    return titles[status] || 'Flight Status Update'
  }

  private getStatusBody(status: string, details: any): string {
    const bodies: Record<string, string> = {
      DELAYED: `Delayed by ${details.delayMinutes || 0} minutes`,
      CANCELLED: details.cancellationReason || 'Flight cancelled',
      BOARDING: `Gate ${details.gate || 'TBD'}`,
      LANDED: 'Your flight has landed'
    }
    return bodies[status] || 'Status updated'
  }
}
```

---

## Phase 5: Historical Tracking

### 5.1 Create FlightStatusHistory Entity
**File:** `packages/backend/src/db/entities/FlightStatusHistory.ts`

```typescript
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'flight_status_history' })
@Index(['flightId', 'timestamp'])
@Index(['newStatus', 'timestamp'])
export class FlightStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  flightId!: string

  @Column({ type: 'varchar', length: 32 })
  previousStatus!: string

  @Column({ type: 'varchar', length: 32 })
  newStatus!: string

  @Column({ type: 'integer', nullable: true })
  delayMinutes?: number

  @Column({ type: 'varchar', length: 16, nullable: true })
  gate?: string

  @Column({ type: 'varchar', length: 16, nullable: true })
  terminal?: string

  @Column({ type: 'varchar', length: 256, nullable: true })
  cancellationReason?: string

  @Column({ type: 'timestamptz' })
  timestamp!: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}
```

### 5.2 Create Migration
**File:** `packages/backend/src/db/migrations/1750002000000-CreateFlightStatusHistory.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class CreateFlightStatusHistory1750002000000 implements MigrationInterface {
  name = 'CreateFlightStatusHistory1750002000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'flight_status_history',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'flightId',
            type: 'uuid'
          },
          {
            name: 'previousStatus',
            type: 'varchar',
            length: '32'
          },
          {
            name: 'newStatus',
            type: 'varchar',
            length: '32'
          },
          {
            name: 'delayMinutes',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'gate',
            type: 'varchar',
            length: '16',
            isNullable: true
          },
          {
            name: 'terminal',
            type: 'varchar',
            length: '16',
            isNullable: true
          },
          {
            name: 'cancellationReason',
            type: 'varchar',
            length: '256',
            isNullable: true
          },
          {
            name: 'timestamp',
            type: 'timestamptz'
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'NOW()'
          }
        ]
      })
    )

    await queryRunner.createIndex(
      'flight_status_history',
      new TableIndex({
        columnNames: ['flightId', 'timestamp']
      })
    )

    await queryRunner.createIndex(
      'flight_status_history',
      new TableIndex({
        columnNames: ['newStatus', 'timestamp']
      })
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('flight_status_history')
  }
}
```

---

## Phase 6: Update Flight Search UI

### 6.1 Flight Status Component
**File:** `packages/client/components/flight-card/FlightStatus.tsx`

```typescript
'use client'

import { useFlightStatus } from '@/hooks/use-flight-status'
import { Badge } from '@/components/ui/badge'

export function FlightStatus({ flightId }: { flightId: string }) {
  const { status, loading } = useFlightStatus(flightId)

  if (loading || !status) {
    return <Badge variant="outline">Loading...</Badge>
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      SCHEDULED: 'bg-blue-100 text-blue-800',
      DELAYED: 'bg-orange-100 text-orange-800',
      BOARDING: 'bg-green-100 text-green-800',
      LANDED: 'bg-gray-100 text-gray-800',
      CANCELLED: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div>
      <Badge className={getStatusColor(status.status)}>
        {status.status}
      </Badge>
      {status.delayMinutes && status.delayMinutes > 0 && (
        <p className="text-sm text-orange-600 mt-1">
          Delayed by {status.delayMinutes} minutes
        </p>
      )}
      {status.gate && (
        <p className="text-sm text-gray-600">Gate: {status.gate}</p>
      )}
      {status.terminal && (
        <p className="text-sm text-gray-600">Terminal: {status.terminal}</p>
      )}
    </div>
  )
}
```

---

## Integration with Existing Systems

### 6.2 Update app.ts to Start Sync Job
**File:** `packages/backend/src/app.ts`

```typescript
import { flightStatusSyncJob } from './jobs/flight-status-sync'

// After server initialization
if (process.env.NODE_ENV !== 'test') {
  flightStatusSyncJob.start()
}

// Graceful shutdown
process.on('SIGTERM', () => {
  flightStatusSyncJob.stop()
  // ... other cleanup
})
```

---

## Testing Strategy

1. **Unit Tests**
   - Flight status service methods
   - Status history recording
   - Notification logic

2. **Integration Tests**
   - WebSocket subscription/unsubscription
   - Status broadcast to clients
   - Push notification delivery

3. **End-to-End Tests**
   - Flight status update flow
   - Client receives WebSocket event
   - Historical data retrieval

---

## Success Metrics

- ✅ Real-time status updates transmitted within 5 seconds
- ✅ WebSocket subscriptions working for multiple clients
- ✅ Status history recorded accurately
- ✅ Push notifications sent for significant changes
- ✅ No WebSocket memory leaks during subscriptions
- ✅ All tests passing
- ✅ Load testing with 1000+ concurrent connections

---

## Rollback Plan

1. Disable flight status sync job in app.ts
2. Remove WebSocket event listeners from client
3. Revert database migration
4. Redeploy

---

## Dependencies
- #223 (Database Query Optimization) - for performance improvements
- #221 (Input Sanitization) - validates flight IDs in subscriptions
