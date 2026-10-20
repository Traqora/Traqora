import { IsNull } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import {
  TrackedFlight,
  TrackedFlightStatus,
  CabinClass,
} from '../db/entities/TrackedFlight';
import { PriceObservation } from '../db/entities/PriceObservation';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';

export interface CreateTrackerParams {
  userId: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  cabinClass?: CabinClass;
  passengers?: number;
  targetPriceCents?: number | null;
  currency?: string;
}

export interface UpdateTrackerParams {
  targetPriceCents?: number | null;
  status?: TrackedFlightStatus;
  cabinClass?: CabinClass;
  passengers?: number;
}

export interface RecordObservationParams {
  trackedFlightId: string;
  priceCents: number;
  currency?: string;
  source: string;
  sourceUrl?: string | null;
  carrierCode?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PriceDropAssessment {
  isDrop: boolean;
  /** True when the price met the user's explicit target. */
  metTarget: boolean;
  previousPriceCents: number | null;
  dropCents: number;
  dropPercent: number;
  reason: 'target_reached' | 'significant_drop' | 'first_observation' | 'no_drop';
}

export interface PriceStats {
  trackedFlightId: string;
  observationCount: number;
  currentPriceCents: number | null;
  lowestPriceCents: number | null;
  highestPriceCents: number | null;
  averagePriceCents: number | null;
  /** Change from the first to the most recent observation, in minor units. */
  changeCents: number | null;
  changePercent: number | null;
  trend: 'rising' | 'falling' | 'stable' | 'unknown';
  sources: string[];
  currency: string;
}

export interface HistoryFilters {
  days?: number;
  source?: string;
  limit?: number;
}

/** A price must fall at least this much below the previous sighting to alert. */
export const SIGNIFICANT_DROP_PERCENT = 5;

/** Minimum gap between two drop notifications for the same tracker. */
export const NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Absolute change under this percent counts as a flat trend. */
const STABLE_TREND_PERCENT = 2;

const IATA_PATTERN = /^[A-Z]{3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Decides whether an incoming price constitutes an alertable drop.
 *
 * Pure so the rule can be tested without touching the database — the
 * cooldown/persistence concerns live in `PriceTrackingService.recordObservation`.
 */
export function assessPriceDrop(
  newPriceCents: number,
  previousPriceCents: number | null,
  targetPriceCents: number | null,
): PriceDropAssessment {
  const metTarget =
    targetPriceCents !== null &&
    targetPriceCents !== undefined &&
    newPriceCents <= targetPriceCents;

  if (previousPriceCents === null || previousPriceCents === undefined) {
    return {
      isDrop: metTarget,
      metTarget,
      previousPriceCents: null,
      dropCents: 0,
      dropPercent: 0,
      reason: metTarget ? 'target_reached' : 'first_observation',
    };
  }

  const dropCents = previousPriceCents - newPriceCents;
  const dropPercent =
    previousPriceCents > 0 ? (dropCents / previousPriceCents) * 100 : 0;
  const isSignificantDrop = dropPercent >= SIGNIFICANT_DROP_PERCENT;

  return {
    isDrop: metTarget || isSignificantDrop,
    metTarget,
    previousPriceCents,
    dropCents: Math.max(dropCents, 0),
    dropPercent: Math.max(Number(dropPercent.toFixed(2)), 0),
    reason: metTarget
      ? 'target_reached'
      : isSignificantDrop
        ? 'significant_drop'
        : 'no_drop',
  };
}

export class PriceTrackingService {
  private static instance: PriceTrackingService;

  private get trackerRepo() {
    return AppDataSource.getRepository(TrackedFlight);
  }

  private get observationRepo() {
    return AppDataSource.getRepository(PriceObservation);
  }

  static getInstance(): PriceTrackingService {
    if (!PriceTrackingService.instance) {
      PriceTrackingService.instance = new PriceTrackingService();
    }
    return PriceTrackingService.instance;
  }

  static resetForTesting(): void {
    PriceTrackingService.instance = undefined as unknown as PriceTrackingService;
  }

  async createTracker(params: CreateTrackerParams): Promise<TrackedFlight> {
    const origin = params.origin?.toUpperCase();
    const destination = params.destination?.toUpperCase();

    if (!IATA_PATTERN.test(origin ?? '')) {
      throw new BadRequestError(`Invalid origin airport code: ${params.origin}`);
    }
    if (!IATA_PATTERN.test(destination ?? '')) {
      throw new BadRequestError(
        `Invalid destination airport code: ${params.destination}`,
      );
    }
    if (origin === destination) {
      throw new BadRequestError('Origin and destination must differ');
    }
    if (!ISO_DATE_PATTERN.test(params.departureDate ?? '')) {
      throw new BadRequestError('departureDate must be an ISO date (YYYY-MM-DD)');
    }
    if (params.returnDate && !ISO_DATE_PATTERN.test(params.returnDate)) {
      throw new BadRequestError('returnDate must be an ISO date (YYYY-MM-DD)');
    }
    if (params.returnDate && params.returnDate < params.departureDate) {
      throw new BadRequestError('returnDate must not precede departureDate');
    }
    if (
      params.targetPriceCents !== undefined &&
      params.targetPriceCents !== null &&
      params.targetPriceCents <= 0
    ) {
      throw new BadRequestError('targetPriceCents must be positive');
    }

    const duplicate = await this.trackerRepo.findOne({
      where: {
        userId: params.userId,
        origin,
        destination,
        departureDate: params.departureDate,
        // A one-way tracker stores NULL, which `=` never matches in SQL.
        returnDate: params.returnDate ? params.returnDate : IsNull(),
        cabinClass: params.cabinClass ?? 'economy',
        status: 'active',
      },
    });

    if (duplicate) {
      throw new ConflictError('An active tracker already exists for this route');
    }

    const tracker = this.trackerRepo.create({
      userId: params.userId,
      origin,
      destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate ?? null,
      cabinClass: params.cabinClass ?? 'economy',
      passengers: params.passengers ?? 1,
      targetPriceCents: params.targetPriceCents ?? null,
      currency: params.currency ?? 'USD',
      status: 'active',
      notificationCount: 0,
    });

    const saved = await this.trackerRepo.save(tracker);
    logger.info('Flight price tracker created', {
      trackerId: saved.id,
      userId: params.userId,
      route: `${origin}-${destination}`,
    });
    return saved;
  }

  async listTrackers(
    userId: string,
    status?: TrackedFlightStatus,
  ): Promise<TrackedFlight[]> {
    return this.trackerRepo.find({
      where: status ? { userId, status } : { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getTracker(id: string, userId?: string): Promise<TrackedFlight> {
    const tracker = await this.trackerRepo.findOne({ where: { id } });
    if (!tracker) throw new NotFoundError('Tracked flight not found');
    if (userId && tracker.userId !== userId) {
      throw new NotFoundError('Tracked flight not found');
    }
    return tracker;
  }

  async updateTracker(
    id: string,
    userId: string,
    patch: UpdateTrackerParams,
  ): Promise<TrackedFlight> {
    const tracker = await this.getTracker(id, userId);

    if (patch.targetPriceCents !== undefined) {
      if (patch.targetPriceCents !== null && patch.targetPriceCents <= 0) {
        throw new BadRequestError('targetPriceCents must be positive');
      }
      tracker.targetPriceCents = patch.targetPriceCents;
    }
    if (patch.status !== undefined) tracker.status = patch.status;
    if (patch.cabinClass !== undefined) tracker.cabinClass = patch.cabinClass;
    if (patch.passengers !== undefined) {
      if (patch.passengers < 1) {
        throw new BadRequestError('passengers must be at least 1');
      }
      tracker.passengers = patch.passengers;
    }

    return this.trackerRepo.save(tracker);
  }

  async deleteTracker(id: string, userId: string): Promise<void> {
    const tracker = await this.getTracker(id, userId);
    await this.observationRepo.delete({ trackedFlightId: tracker.id });
    await this.trackerRepo.delete({ id: tracker.id });
    logger.info('Flight price tracker deleted', { trackerId: id, userId });
  }

  /**
   * Appends a price sighting, refreshes the tracker's rolling min/last, and
   * fires a drop alert when the rules in `assessPriceDrop` are met and the
   * notification cooldown has elapsed.
   */
  async recordObservation(params: RecordObservationParams): Promise<{
    observation: PriceObservation;
    assessment: PriceDropAssessment;
    notified: boolean;
  }> {
    if (!Number.isInteger(params.priceCents) || params.priceCents <= 0) {
      throw new BadRequestError('priceCents must be a positive integer');
    }
    if (!params.source?.trim()) {
      throw new BadRequestError('source is required');
    }

    const tracker = await this.getTracker(params.trackedFlightId);

    const assessment = assessPriceDrop(
      params.priceCents,
      tracker.lastPriceCents ?? null,
      tracker.targetPriceCents ?? null,
    );

    const observation = await this.observationRepo.save(
      this.observationRepo.create({
        trackedFlightId: tracker.id,
        priceCents: params.priceCents,
        currency: params.currency ?? tracker.currency,
        source: params.source.trim(),
        sourceUrl: params.sourceUrl ?? null,
        carrierCode: params.carrierCode ?? null,
        metadata: params.metadata ?? null,
      }),
    );

    tracker.lastPriceCents = params.priceCents;
    tracker.lowestPriceCents =
      tracker.lowestPriceCents === null || tracker.lowestPriceCents === undefined
        ? params.priceCents
        : Math.min(tracker.lowestPriceCents, params.priceCents);
    tracker.lastCheckedAt = new Date();

    let notified = false;
    if (assessment.isDrop && tracker.status === 'active') {
      if (this.cooldownElapsed(tracker.lastNotifiedAt ?? null)) {
        notified = await this.sendDropAlert(tracker, params.priceCents, assessment);
        if (notified) {
          tracker.lastNotifiedAt = new Date();
          tracker.notificationCount += 1;
        }
      } else {
        logger.debug('Price drop suppressed by cooldown', {
          trackerId: tracker.id,
        });
      }
    }

    await this.trackerRepo.save(tracker);

    return { observation, assessment, notified };
  }

  /**
   * Bulk ingestion path for the extension, which batches sightings collected
   * while the user browses. One bad row does not sink the batch.
   */
  async recordObservations(
    observations: RecordObservationParams[],
  ): Promise<{
    recorded: number;
    notified: number;
    errors: Array<{ trackedFlightId: string; message: string }>;
  }> {
    let recorded = 0;
    let notified = 0;
    const errors: Array<{ trackedFlightId: string; message: string }> = [];

    for (const entry of observations) {
      try {
        const result = await this.recordObservation(entry);
        recorded += 1;
        if (result.notified) notified += 1;
      } catch (error) {
        errors.push({
          trackedFlightId: entry.trackedFlightId,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { recorded, notified, errors };
  }

  async getPriceHistory(
    trackedFlightId: string,
    filters: HistoryFilters = {},
  ): Promise<PriceObservation[]> {
    await this.getTracker(trackedFlightId);

    const query = this.observationRepo
      .createQueryBuilder('observation')
      .where('observation.trackedFlightId = :trackedFlightId', { trackedFlightId })
      .orderBy('observation.observedAt', 'ASC');

    if (filters.days !== undefined) {
      const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);
      query.andWhere('observation.observedAt >= :since', { since });
    }
    if (filters.source) {
      query.andWhere('observation.source = :source', { source: filters.source });
    }
    if (filters.limit !== undefined) {
      query.take(filters.limit);
    }

    return query.getMany();
  }

  async getPriceStats(trackedFlightId: string): Promise<PriceStats> {
    const tracker = await this.getTracker(trackedFlightId);
    const observations = await this.observationRepo.find({
      where: { trackedFlightId },
      order: { observedAt: 'ASC' },
    });

    if (observations.length === 0) {
      return {
        trackedFlightId,
        observationCount: 0,
        currentPriceCents: null,
        lowestPriceCents: null,
        highestPriceCents: null,
        averagePriceCents: null,
        changeCents: null,
        changePercent: null,
        trend: 'unknown',
        sources: [],
        currency: tracker.currency,
      };
    }

    const prices = observations.map((o) => o.priceCents);
    const first = prices[0];
    const current = prices[prices.length - 1];
    const changeCents = current - first;
    const changePercent = first > 0 ? Number(((changeCents / first) * 100).toFixed(2)) : 0;

    return {
      trackedFlightId,
      observationCount: observations.length,
      currentPriceCents: current,
      lowestPriceCents: Math.min(...prices),
      highestPriceCents: Math.max(...prices),
      averagePriceCents: Math.round(
        prices.reduce((sum, p) => sum + p, 0) / prices.length,
      ),
      changeCents,
      changePercent,
      trend:
        Math.abs(changePercent) < STABLE_TREND_PERCENT
          ? 'stable'
          : changePercent > 0
            ? 'rising'
            : 'falling',
      sources: [...new Set(observations.map((o) => o.source))],
      currency: tracker.currency,
    };
  }

  private cooldownElapsed(lastNotifiedAt: Date | null): boolean {
    if (!lastNotifiedAt) return true;
    return Date.now() - lastNotifiedAt.getTime() >= NOTIFICATION_COOLDOWN_MS;
  }

  private async sendDropAlert(
    tracker: TrackedFlight,
    priceCents: number,
    assessment: PriceDropAssessment,
  ): Promise<boolean> {
    try {
      const notifier = NotificationService.getInstance();
      return await notifier.sendPriceAlert(
        tracker.userId,
        `${tracker.origin}-${tracker.destination} ${tracker.departureDate}: $${priceCents / 100} (target $${(tracker.targetPriceCents ?? assessment.previousPriceCents ?? priceCents) / 100})`,
        { currency: tracker.currency },
      );
    } catch (error) {
      logger.error('Failed to send price drop alert', error as Error);
      return false;
    }
  }
}
