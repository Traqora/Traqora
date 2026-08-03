/**
 * Recommendation analytics — data-access and aggregation layer backing
 * recommendationService.ts. Scoped to destination-recommendation signals
 * (own history, global trending, co-occurrence, engagement tracking); it is
 * intentionally separate from services/analytics/* (pricing/cohort/funnel
 * analytics) and services/user-analytics.ts (notification-delivery stats).
 */

import { AppDataSource } from '../db/dataSource';
import { SearchHistoryEntry } from '../db/entities/SearchHistoryEntry';
import { SavedSearch } from '../db/entities/SavedSearch';
import { Booking } from '../db/entities/Booking';
import {
  RecommendationEvent,
  RecommendationAction,
  RecommendationVariant,
} from '../db/entities/RecommendationEvent';

const TRENDING_WINDOW_DAYS = 30;
/** Bookings are a much stronger signal of destination interest than a search. */
const BOOKING_SIGNAL_WEIGHT = 3;

export interface DestinationFrequency {
  code: string;
  count: number;
  lastSeenAt: Date;
}

export interface TrendingDestination {
  code: string;
  count: number;
}

export interface CoOccurringDestination {
  code: string;
  score: number;
}

export interface RecordRecommendationEventInput {
  userId: string;
  destinationCode: string;
  variant: RecommendationVariant;
  action: RecommendationAction;
  reason?: string;
}

export interface EngagementSummary {
  variant: RecommendationVariant;
  views: number;
  clicks: number;
  dismissals: number;
  clickThroughRate: number;
}

function bumpFrequency(
  frequency: Map<string, DestinationFrequency>,
  rawCode: string,
  seenAt: Date,
  weight = 1,
): void {
  const code = rawCode.toUpperCase();
  const existing = frequency.get(code);
  if (existing) {
    existing.count += weight;
    if (seenAt > existing.lastSeenAt) existing.lastSeenAt = seenAt;
  } else {
    frequency.set(code, { code, count: weight, lastSeenAt: seenAt });
  }
}

/**
 * A single user's own signal: destinations they've searched, saved, or
 * booked, ranked by frequency (bookings weighted heaviest) then recency.
 */
export async function getUserDestinationFrequency(userId: string): Promise<DestinationFrequency[]> {
  const frequency = new Map<string, DestinationFrequency>();

  const [searches, savedSearches, bookings] = await Promise.all([
    AppDataSource.getRepository(SearchHistoryEntry).find({ where: { userId } }),
    AppDataSource.getRepository(SavedSearch).find({ where: { userId } }),
    AppDataSource.getRepository(Booking).find({ where: { walletAddress: userId } }),
  ]);

  for (const entry of searches) {
    bumpFrequency(frequency, entry.toAirport, entry.createdAt);
  }
  for (const entry of savedSearches) {
    bumpFrequency(frequency, entry.toAirport, entry.updatedAt);
  }
  for (const booking of bookings) {
    if (booking.flight?.toAirport) {
      bumpFrequency(frequency, booking.flight.toAirport, booking.createdAt, BOOKING_SIGNAL_WEIGHT);
    }
  }

  return Array.from(frequency.values()).sort(
    (a, b) => b.count - a.count || b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );
}

/**
 * Globally trending destinations across all users in the recent window.
 * Used as the cold-start fallback and as the standalone "Trending now" rail.
 */
export async function getTrendingDestinations(
  limit = 10,
  sinceDays = TRENDING_WINDOW_DAYS,
): Promise<TrendingDestination[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const frequency = new Map<string, number>();

  const [searches, bookings] = await Promise.all([
    AppDataSource.getRepository(SearchHistoryEntry)
      .createQueryBuilder('search')
      .where('search.createdAt >= :since', { since })
      .getMany(),
    AppDataSource.getRepository(Booking)
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.flight', 'flight')
      .where('booking.createdAt >= :since', { since })
      .getMany(),
  ]);

  for (const entry of searches) {
    const code = entry.toAirport.toUpperCase();
    frequency.set(code, (frequency.get(code) || 0) + 1);
  }
  for (const booking of bookings) {
    if (!booking.flight?.toAirport) continue;
    const code = booking.flight.toAirport.toUpperCase();
    frequency.set(code, (frequency.get(code) || 0) + BOOKING_SIGNAL_WEIGHT);
  }

  return Array.from(frequency.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Lightweight collaborative filtering: for the given seed destinations,
 * find which other destinations are frequently searched by the same users
 * who searched for those seeds ("travelers who liked X also liked Y").
 */
export async function getCoOccurringDestinations(
  seedCodes: string[],
  excludeCodes: Set<string>,
  limit = 10,
): Promise<CoOccurringDestination[]> {
  const normalizedSeeds = Array.from(new Set(seedCodes.map((code) => code.toUpperCase())));
  if (normalizedSeeds.length === 0) return [];

  const seedSearches = await AppDataSource.getRepository(SearchHistoryEntry)
    .createQueryBuilder('search')
    .where('search.toAirport IN (:...codes)', { codes: normalizedSeeds })
    .getMany();

  const relatedUserIds = Array.from(new Set(seedSearches.map((entry) => entry.userId)));
  if (relatedUserIds.length === 0) return [];

  const relatedSearches = await AppDataSource.getRepository(SearchHistoryEntry)
    .createQueryBuilder('search')
    .where('search.userId IN (:...userIds)', { userIds: relatedUserIds })
    .getMany();

  const coOccurrence = new Map<string, number>();
  for (const entry of relatedSearches) {
    const code = entry.toAirport.toUpperCase();
    if (normalizedSeeds.includes(code) || excludeCodes.has(code)) continue;
    coOccurrence.set(code, (coOccurrence.get(code) || 0) + 1);
  }

  return Array.from(coOccurrence.entries())
    .map(([code, score]) => ({ code, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function recordRecommendationEvent(input: RecordRecommendationEventInput): Promise<void> {
  const repo = AppDataSource.getRepository(RecommendationEvent);
  const event = repo.create({
    userId: input.userId,
    destinationCode: input.destinationCode.toUpperCase(),
    variant: input.variant,
    action: input.action,
    reason: input.reason ?? null,
  });
  await repo.save(event);
}

/**
 * Click-through performance per experiment variant, optionally scoped to a
 * single user — the measurement step for the recommendations A/B test.
 */
export async function getEngagementSummary(userId?: string): Promise<EngagementSummary[]> {
  const qb = AppDataSource.getRepository(RecommendationEvent).createQueryBuilder('event');
  if (userId) {
    qb.where('event.userId = :userId', { userId });
  }
  const events = await qb.getMany();

  const byVariant = new Map<RecommendationVariant, { views: number; clicks: number; dismissals: number }>();
  for (const event of events) {
    const bucket = byVariant.get(event.variant) || { views: 0, clicks: 0, dismissals: 0 };
    if (event.action === 'view') bucket.views += 1;
    else if (event.action === 'click') bucket.clicks += 1;
    else if (event.action === 'dismiss') bucket.dismissals += 1;
    byVariant.set(event.variant, bucket);
  }

  return Array.from(byVariant.entries()).map(([variant, bucket]) => ({
    variant,
    ...bucket,
    clickThroughRate: bucket.views > 0 ? bucket.clicks / bucket.views : 0,
  }));
}
