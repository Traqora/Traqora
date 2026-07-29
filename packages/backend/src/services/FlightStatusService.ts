import { AppDataSource } from '../db/dataSource';
import { Flight } from '../db/entities/Flight';
import { FlightFollower } from '../db/entities/FlightFollower';
import { FlightStatusEvent, FlightEventType } from '../db/entities/FlightStatusEvent';
import { flightsNamespace } from '../websockets/server';
import { scheduleNotification, NotificationPayload } from '../jobs/notificationQueue';
import { logger } from '../utils/logger';
import { LessThan, MoreThanOrEqual } from 'typeorm';

export class FlightStatusService {
  private static instance: FlightStatusService;

  public constructor() {}
import { logger } from '../utils/logger';
import { FlightStatusValue } from '../models/FlightStatusAlert';

export interface FlightStatusUpdate {
  flightId: string;
  status: FlightStatusValue;
  gate?: string;
  delayMinutes?: number;
  reason?: string;
  timestamp: Date;
}

export interface OnTimePerformance {
  flightId: string;
  sampleSize: number;
  onTimeCount: number;
  disruptedCount: number;
  /** onTimeCount / sampleSize, or null when there's no recorded history yet. */
  onTimeRate: number | null;
}

/** Transitions counted as a disruption for on-time performance purposes (issue #332). */
const DISRUPTED_STATUSES: ReadonlySet<FlightStatusValue> = new Set(['delayed', 'cancelled']);

const MAX_HISTORY_PER_FLIGHT = 50;

/**
 * Tracks the last-known status for each flight in memory. Real-time gate/
 * delay/cancellation data has no live feed yet (issue #380), so this mirrors
 * PriceOracleService's mock-with-retry pattern: a pluggable fetch with the
 * same shape a real airline status API would return, so swapping the mock
 * for a real provider later doesn't require touching callers.
 */
export class FlightStatusService {
  private static instance: FlightStatusService;
  private readonly lastKnownStatus = new Map<string, FlightStatusUpdate>();
  /** Bounded history of status *transitions* per flight, oldest first — used for on-time performance (issue #332). */
  private readonly history = new Map<string, FlightStatusUpdate[]>();

  private constructor() {}

  public static getInstance(): FlightStatusService {
    if (!FlightStatusService.instance) {
      FlightStatusService.instance = new FlightStatusService();
    }
    return FlightStatusService.instance;
  }

  /**
   * Follow a flight for status updates without booking
   */
  async followFlight(userId: string, flightId: string): Promise<FlightFollower> {
    const followerRepo = AppDataSource.getRepository(FlightFollower);
    const flightRepo = AppDataSource.getRepository(Flight);

    // Check if already following
    const existing = await followerRepo.findOne({ where: { userId, flightId } });
    if (existing) {
      existing.notificationsEnabled = true;
      return followerRepo.save(existing);
    }

    const flight = await flightRepo.findOne({ where: { id: flightId } });
    if (!flight) {
      throw new Error(`Flight not found: ${flightId}`);
    }

    const follower = followerRepo.create({
      userId,
      flightId,
      flightNumber: flight.flightNumber,
      airlineCode: flight.airlineCode,
    });

    return followerRepo.save(follower);
  }

  /**
   * Unfollow a flight
   */
  async unfollowFlight(userId: string, flightId: string): Promise<void> {
    const followerRepo = AppDataSource.getRepository(FlightFollower);
    await followerRepo.delete({ userId, flightId });
  }

  /**
   * Get all flights being followed by a user
   */
  async getFollowedFlights(userId: string): Promise<FlightFollower[]> {
    const followerRepo = AppDataSource.getRepository(FlightFollower);
    return followerRepo.find({ where: { userId, notificationsEnabled: true } });
  }

  /**
   * Get followers of a specific flight
   */
  async getFlightFollowers(flightId: string): Promise<FlightFollower[]> {
    const followerRepo = AppDataSource.getRepository(FlightFollower);
    return followerRepo.find({ where: { flightId, notificationsEnabled: true } });
  }

  /**
   * Record a flight status event and notify followers
   */
  async recordStatusEvent(
    flightId: string,
    eventType: FlightEventType,
    details: {
      delayMinutes?: number;
      previousGate?: string;
      newGate?: string;
      previousTerminal?: string;
      newTerminal?: string;
      cancellationReason?: string;
      message?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<FlightStatusEvent> {
    const eventRepo = AppDataSource.getRepository(FlightStatusEvent);
    const flightRepo = AppDataSource.getRepository(Flight);

    const flight = await flightRepo.findOne({ where: { id: flightId } });
    if (!flight) {
      throw new Error(`Flight not found: ${flightId}`);
    }

    // Create the event record
    const event = eventRepo.create({
      flightId,
      flightNumber: flight.flightNumber,
      eventType,
      delayMinutes: details.delayMinutes,
      previousGate: details.previousGate,
      newGate: details.newGate,
      previousTerminal: details.previousTerminal,
      newTerminal: details.newTerminal,
      cancellationReason: details.cancellationReason,
      message: details.message,
      metadata: details.metadata,
    });

    const savedEvent = await eventRepo.save(event);

    // Update the flight record
    if (eventType === 'DELAYED' && details.delayMinutes) {
      flight.status = 'DELAYED';
      flight.delayMinutes = details.delayMinutes;
    } else if (eventType === 'ON_TIME') {
      flight.status = 'SCHEDULED';
      flight.delayMinutes = 0;
    } else if (eventType === 'CANCELLED') {
      flight.status = 'CANCELLED';
      flight.cancellationReason = details.cancellationReason;
    } else if (eventType === 'GATE_CHANGED' && details.newGate) {
      flight.gate = details.newGate;
      if (details.newTerminal) flight.terminal = details.newTerminal;
    } else if (eventType === 'DEPARTED') {
      flight.status = 'DEPARTED';
    } else if (eventType === 'LANDED') {
      flight.status = 'LANDED';
    } else if (eventType === 'DIVERTED') {
      flight.status = 'DIVERTED';
    }

    await flightRepo.save(flight);

    // Broadcast to WebSocket followers
    this.broadcastFlightEvent(flight, savedEvent);

    // Send push/email notifications to followers
    await this.notifyFollowers(flight, savedEvent);

    // If delayed over 30 min, or cancelled, or gate change - notify
    if (eventType === 'DELAYED' && details.delayMinutes && details.delayMinutes >= 30) {
      await this.notifyDelayOverThreshold(flight, details.delayMinutes);
    }

    return savedEvent;
  }

  /**
   * Broadcast flight status event to WebSocket room
   */
  private broadcastFlightEvent(flight: Flight, event: FlightStatusEvent): void {
    try {
      const room = flight.id;
      const payload = {
        flightId: flight.id,
        flightNumber: flight.flightNumber,
        airline: flight.airlineCode,
        eventType: event.eventType,
        delayMinutes: event.delayMinutes,
        gate: flight.gate,
        terminal: flight.terminal,
        status: flight.status,
        cancellationReason: flight.cancellationReason,
        message: event.message,
        timestamp: event.createdAt,
      };

      // Broadcast to the specific flight room in the flights namespace
      if (flightsNamespace) {
        flightsNamespace.to(room).emit(event.eventType.toLowerCase().replace(/_/g, '-'), payload);
        flightsNamespace.to(room).emit('flight-status-update', payload);
        logger.info(`Broadcast ${event.eventType} to flight room ${room}`);
      }
    } catch (error) {
      logger.error('Failed to broadcast flight event', {
        error: error instanceof Error ? error.message : String(error),
        flightId: flight.id,
      });
    }
  }

  /**
   * Send notifications to all followers of a flight
   */
  private async notifyFollowers(flight: Flight, event: FlightStatusEvent): Promise<void> {
    try {
      const followers = await this.getFlightFollowers(flight.id);

      for (const follower of followers) {
        let notificationType: NotificationPayload['type'];
        let notificationData: Record<string, any>;

        switch (event.eventType) {
          case 'DELAYED':
            notificationType = 'flight_delayed';
            notificationData = {
              flightNumber: flight.flightNumber,
              airline: flight.airlineCode,
              delayMinutes: event.delayMinutes || 0,
              originalTime: flight.departureTime,
              from: flight.fromAirport,
              to: flight.toAirport,
            };
            break;
          case 'CANCELLED':
            notificationType = 'flight_cancelled';
            notificationData = {
              flightNumber: flight.flightNumber,
              airline: flight.airlineCode,
              cancellationReason: event.cancellationReason || 'Unknown',
              from: flight.fromAirport,
              to: flight.toAirport,
            };
            break;
          case 'GATE_CHANGED':
            notificationType = 'gate_changed';
            notificationData = {
              flightNumber: flight.flightNumber,
              airline: flight.airlineCode,
              previousGate: event.previousGate || 'N/A',
              newGate: event.newGate || 'N/A',
              terminal: flight.terminal,
            };
            break;
          case 'BOARDING':
            notificationType = 'boarding_reminder';
            notificationData = {
              flightNumber: flight.flightNumber,
              airline: flight.airlineCode,
              gate: flight.gate,
              terminal: flight.terminal,
              departureTime: flight.departureTime,
              from: flight.fromAirport,
              to: flight.toAirport,
            };
            break;
          default:
            notificationType = 'flight_status';
            notificationData = {
              flightNumber: flight.flightNumber,
              airline: flight.airlineCode,
              status: flight.status,
              from: flight.fromAirport,
              to: flight.toAirport,
            };
        }

        await scheduleNotification(
          {
            userId: follower.userId,
            type: notificationType,
            data: notificationData,
            channels: ['email', 'push'],
          },
          0, // immediate
          1, // high priority
        );
      }
    } catch (error) {
      logger.error('Failed to notify followers', {
        error: error instanceof Error ? error.message : String(error),
        flightId: flight.id,
      });
    }
  }

  /**
   * Special notification for delays over 30 minutes
   */
  private async notifyDelayOverThreshold(flight: Flight, delayMinutes: number): Promise<void> {
    try {
      const followers = await this.getFlightFollowers(flight.id);

      for (const follower of followers) {
        await scheduleNotification(
          {
            userId: follower.userId,
            type: 'flight_delayed_significant',
            data: {
              flightNumber: flight.flightNumber,
              airline: flight.airlineCode,
              delayMinutes,
              originalTime: flight.departureTime,
              from: flight.fromAirport,
              to: flight.toAirport,
            },
            channels: ['email', 'sms', 'push'],
          },
          0,
          1,
        );
      }
    } catch (error) {
      logger.error('Failed to notify delay over threshold', {
        error: error instanceof Error ? error.message : String(error),
        flightId: flight.id,
      });
    }
  }

  /**
   * Send a boarding reminder 45 minutes before departure
   */
  async sendBoardingReminder(flightId: string): Promise<void> {
    const flightRepo = AppDataSource.getRepository(Flight);
    const flight = await flightRepo.findOne({ where: { id: flightId } });

    if (!flight || flight.status === 'CANCELLED' || flight.status === 'LANDED') {
      return;
    }

    await this.recordStatusEvent(flightId, 'BOARDING', {
      message: `Boarding for ${flight.flightNumber} begins in 45 minutes at gate ${flight.gate || 'TBD'}`,
      metadata: { boardingTime: new Date(flight.departureTime.getTime() - 45 * 60 * 1000) },
    });
  }

  /**
   * Get status history for a flight
   */
  async getFlightStatusHistory(flightId: string, limit: number = 20): Promise<FlightStatusEvent[]> {
    const eventRepo = AppDataSource.getRepository(FlightStatusEvent);
    return eventRepo.find({
      where: { flightId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get historical on-time performance for a route
   */
  async getRoutePerformance(from: string, to: string): Promise<{
    totalFlights: number;
    onTime: number;
    delayed: number;
    cancelled: number;
    averageDelay: number;
    onTimePercentage: number;
  }> {
    const flightRepo = AppDataSource.getRepository(Flight);

    const flights = await flightRepo.find({
      where: {
        fromAirport: from,
        toAirport: to,
      },
    });

    const totalFlights = flights.length;
    const delayed = flights.filter((f) => f.status === 'DELAYED').length;
    const cancelled = flights.filter((f) => f.status === 'CANCELLED').length;
    const onTime = totalFlights - delayed - cancelled;
    const totalDelayMinutes = flights.reduce((sum, f) => sum + (f.delayMinutes || 0), 0);
    const averageDelay = totalFlights > 0 ? Math.round(totalDelayMinutes / totalFlights) : 0;
    const onTimePercentage = totalFlights > 0 ? Math.round((onTime / totalFlights) * 100) : 100;

    return {
      totalFlights,
      onTime,
      delayed,
      cancelled,
      averageDelay,
      onTimePercentage,
    };
  }

  /**
   * Share flight status (generates a shareable token/link)
   */
  async shareFlightStatus(
    userId: string,
    flightId: string,
    recipientEmail: string,
  ): Promise<void> {
    const flightRepo = AppDataSource.getRepository(Flight);
    const flight = await flightRepo.findOne({ where: { id: flightId } });

    if (!flight) {
      throw new Error(`Flight not found: ${flightId}`);
    }

    // Get latest status
    const events = await this.getFlightStatusHistory(flightId, 1);
    const latestEvent = events[0] || null;

    // Send share notification to recipient
    const shareData = {
      flightNumber: flight.flightNumber,
      airline: flight.airlineCode,
      from: flight.fromAirport,
      to: flight.toAirport,
      departureTime: flight.departureTime.toISOString(),
      status: flight.status,
      gate: flight.gate,
      terminal: flight.terminal,
      delayMinutes: flight.delayMinutes,
      sharedBy: userId,
      latestEvent: latestEvent
        ? {
            type: latestEvent.eventType,
            message: latestEvent.message,
            timestamp: latestEvent.createdAt,
          }
        : null,
    };

    await scheduleNotification(
      {
        userId, // The sharer
        type: 'flight_status_shared',
        data: {
          ...shareData,
          recipientEmail,
        },
        channels: ['email'],
      },
      0,
      2,
    );

    logger.info(`Flight ${flightId} status shared with ${recipientEmail} by user ${userId}`);
  }

  /**
   * Initialize boarding reminders for upcoming flights
   * This should be called by a cron job periodically
   */
  async checkAndSendBoardingReminders(): Promise<void> {
    const flightRepo = AppDataSource.getRepository(Flight);
    const eventRepo = AppDataSource.getRepository(FlightStatusEvent);

    // Find flights departing in ~45-50 minutes that haven't had boarding reminders
    const now = new Date();
    const boardingWindowStart = new Date(now.getTime() + 44 * 60 * 1000);
    const boardingWindowEnd = new Date(now.getTime() + 50 * 60 * 1000);

    const flights = await flightRepo.find({
      where: {
        departureTime: MoreThanOrEqual(boardingWindowStart),
        status: 'SCHEDULED',
      },
    });

    for (const flight of flights) {
      if (flight.departureTime <= boardingWindowEnd && flight.departureTime >= boardingWindowStart) {
        // Check if boarding reminder was already sent
        const existingReminder = await eventRepo.findOne({
          where: {
            flightId: flight.id,
            eventType: 'BOARDING',
          },
        });

        if (!existingReminder) {
          await this.sendBoardingReminder(flight.id);
        }
      }
    }
  }

  /**
   * Automatically initiate refund for cancelled flights
   */
  async handleCancellationAutoRefund(flightId: string): Promise<void> {
    const flightRepo = AppDataSource.getRepository(Flight);
    const flight = await flightRepo.findOne({ where: { id: flightId } });

    if (!flight || flight.status !== 'CANCELLED') {
      logger.warn(`Flight ${flightId} is not cancelled, skipping auto-refund`);
      return;
    }

    const followers = await this.getFlightFollowers(flightId);

    for (const follower of followers) {
      await scheduleNotification(
        {
          userId: follower.userId,
          type: 'refund_initiated',
          data: {
            flightNumber: flight.flightNumber,
            airline: flight.airlineCode,
            cancellationReason: flight.cancellationReason,
            from: flight.fromAirport,
            to: flight.toAirport,
          },
          channels: ['email', 'push'],
        },
        0,
        1,
      );

      logger.info(`Auto-refund initiated for user ${follower.userId} on flight ${flightId}`);
    }
  }
}

export const flightStatusService = FlightStatusService.getInstance();
   * Fetches the current status for a list of flights, with retry + backoff
   * mirroring PriceOracleService.fetchPrices.
   */
  public async fetchStatuses(flightIds: string[]): Promise<FlightStatusUpdate[]> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return await this.mockApiCall(flightIds);
      } catch (error) {
        retries += 1;
        const delay = Math.pow(2, retries) * 1000;
        logger.warn(`Failed to fetch flight statuses. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
        if (retries === maxRetries) {
          logger.error('Max retries reached. Failed to fetch flight statuses.', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  /**
   * Returns the last status this service has seen for a flight, or null if
   * it hasn't been fetched/recorded yet.
   */
  public getLastKnownStatus(flightId: string): FlightStatusUpdate | null {
    return this.lastKnownStatus.get(flightId) ?? null;
  }

  /**
   * Records a status update (from a fetch or a manually-reported change) and
   * reports whether the status actually changed since the last known value —
   * callers use this to decide whether to notify subscribers.
   */
  public recordStatus(update: FlightStatusUpdate): { changed: boolean; previous: FlightStatusUpdate | null } {
    const previous = this.lastKnownStatus.get(update.flightId) ?? null;
    this.lastKnownStatus.set(update.flightId, update);

    const changed = previous?.status !== update.status;
    if (changed) {
      const entries = this.history.get(update.flightId) ?? [];
      entries.push(update);
      if (entries.length > MAX_HISTORY_PER_FLIGHT) {
        entries.splice(0, entries.length - MAX_HISTORY_PER_FLIGHT);
      }
      this.history.set(update.flightId, entries);
    }

    return { changed, previous };
  }

  /**
   * Historical on-time performance for a flight (issue #332), computed from
   * recorded status *transitions* (not every poll — only actual changes).
   * `delayed`/`cancelled` transitions count as disruptions; everything else
   * (on_time, gate_changed, boarding, departed) counts as on-time. This is a
   * simple deterministic count over in-memory history, not a statistical or
   * predictive model, and resets on process restart since there's no
   * persisted history table yet.
   */
  public getOnTimePerformance(flightId: string): OnTimePerformance {
    const entries = this.history.get(flightId) ?? [];
    const disruptedCount = entries.filter((entry) => DISRUPTED_STATUSES.has(entry.status)).length;
    const sampleSize = entries.length;

    return {
      flightId,
      sampleSize,
      onTimeCount: sampleSize - disruptedCount,
      disruptedCount,
      onTimeRate: sampleSize > 0 ? (sampleSize - disruptedCount) / sampleSize : null,
    };
  }

  private async mockApiCall(flightIds: string[]): Promise<FlightStatusUpdate[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    return flightIds.map((flightId) => {
      const existing = this.lastKnownStatus.get(flightId);
      return (
        existing ?? {
          flightId,
          status: 'on_time' as FlightStatusValue,
          timestamp: new Date(),
        }
      );
    });
  }
}
