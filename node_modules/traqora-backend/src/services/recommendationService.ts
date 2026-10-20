/**
 * Destination recommendation engine.
 *
 * Combines a user's own search/save/booking history with a lightweight
 * collaborative-filtering signal (destinations frequently searched by other
 * users who share the user's destinations) and a global trending fallback.
 * Users are deterministically split into a `personalized` vs `control` A/B
 * variant so the lift from personalization can be measured via
 * analytics.getEngagementSummary().
 */

import { createHash } from 'crypto';
import { AppDataSource } from '../db/dataSource';
import { Flight } from '../db/entities/Flight';
import { RecommendationVariant } from '../db/entities/RecommendationEvent';
import { loyaltyService } from './loyalty/loyaltyService';
import * as analytics from './analytics';

const PERSONALIZED_COUNT = 6;
const TRENDING_COUNT = 6;
const OWN_HISTORY_SEED_COUNT = 5;
/** Cheapest available fare must be at least this far below the route average to count as "good value". */
const GOOD_VALUE_RATIO = 0.9;

export interface DestinationMetadata {
  code: string;
  city: string;
  country: string;
}

// Small static lookup covering the routes seeded/searchable in this app today.
// Unknown codes fall back gracefully to the raw airport code.
const DESTINATION_METADATA: Record<string, DestinationMetadata> = {
  JFK: { code: 'JFK', city: 'New York', country: 'United States' },
  LAX: { code: 'LAX', city: 'Los Angeles', country: 'United States' },
  ORD: { code: 'ORD', city: 'Chicago', country: 'United States' },
  MIA: { code: 'MIA', city: 'Miami', country: 'United States' },
  SFO: { code: 'SFO', city: 'San Francisco', country: 'United States' },
  LAS: { code: 'LAS', city: 'Las Vegas', country: 'United States' },
  SEA: { code: 'SEA', city: 'Seattle', country: 'United States' },
  DEN: { code: 'DEN', city: 'Denver', country: 'United States' },
  LHR: { code: 'LHR', city: 'London', country: 'United Kingdom' },
  CDG: { code: 'CDG', city: 'Paris', country: 'France' },
  NRT: { code: 'NRT', city: 'Tokyo', country: 'Japan' },
  DXB: { code: 'DXB', city: 'Dubai', country: 'United Arab Emirates' },
  SYD: { code: 'SYD', city: 'Sydney', country: 'Australia' },
  SIN: { code: 'SIN', city: 'Singapore', country: 'Singapore' },
  BCN: { code: 'BCN', city: 'Barcelona', country: 'Spain' },
  FCO: { code: 'FCO', city: 'Rome', country: 'Italy' },
};

export interface PriceSignal {
  cheapestPriceCents: number | null;
  averagePriceCents: number | null;
  isGoodValue: boolean;
}

export type RecommendationOfferType = 'loyalty' | 'value' | 'discovery' | 'favorite';

export interface RecommendationOffer {
  type: RecommendationOfferType;
  label: string;
}

export interface RecommendedDestination {
  code: string;
  city: string;
  country: string;
  reason: string;
  cheapestPriceCents: number | null;
  offer: RecommendationOffer;
}

export interface RecommendationsResult {
  variant: RecommendationVariant;
  personalized: RecommendedDestination[];
  trending: RecommendedDestination[];
}

/**
 * Deterministically assigns a user to the `personalized` or `control` arm of
 * the recommendations experiment. Stable across requests for the same user
 * since it's a pure function of the user id (no persisted assignment state).
 */
export function getVariantForUser(userId: string): RecommendationVariant {
  const hash = createHash('sha256').update(`recommendations:${userId}`).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;
  return bucket < 50 ? 'personalized' : 'control';
}

export function getDestinationMetadata(code: string): DestinationMetadata {
  const normalized = code.toUpperCase();
  return DESTINATION_METADATA[normalized] ?? { code: normalized, city: normalized, country: '' };
}

/**
 * Real (non-random) value signal: compares the cheapest currently listed
 * fare to that destination against the average fare across all currently
 * listed flights to it.
 */
export async function getPriceSignal(destinationCode: string): Promise<PriceSignal> {
  const flights = await AppDataSource.getRepository(Flight)
    .createQueryBuilder('flight')
    .where('flight.toAirport = :code', { code: destinationCode.toUpperCase() })
    .andWhere('flight.seatsAvailable > 0')
    .andWhere('flight.departureTime > :now', { now: new Date() })
    .getMany();

  if (flights.length === 0) {
    return { cheapestPriceCents: null, averagePriceCents: null, isGoodValue: false };
  }

  const prices = flights.map((flight) => flight.priceCents);
  const cheapestPriceCents = Math.min(...prices);
  const averagePriceCents = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  const isGoodValue = flights.length > 1 && cheapestPriceCents <= averagePriceCents * GOOD_VALUE_RATIO;

  return { cheapestPriceCents, averagePriceCents, isGoodValue };
}

export function getOfferForDestination(params: {
  loyaltyTier?: string;
  isGoodValue: boolean;
  isNewToUser: boolean;
}): RecommendationOffer {
  if (params.loyaltyTier) {
    return { type: 'loyalty', label: `Earn 2x points as a ${params.loyaltyTier} member` };
  }
  if (params.isGoodValue) {
    return { type: 'value', label: 'Good value — below average price' };
  }
  return params.isNewToUser
    ? { type: 'discovery', label: 'New destination for you' }
    : { type: 'favorite', label: 'A favorite worth revisiting' };
}

async function buildRecommendedDestination(
  code: string,
  reason: string,
  loyaltyTier: string | undefined,
  ownCodes: Set<string>,
): Promise<RecommendedDestination> {
  const metadata = getDestinationMetadata(code);
  const priceSignal = await getPriceSignal(code);
  const offer = getOfferForDestination({
    loyaltyTier,
    isGoodValue: priceSignal.isGoodValue,
    isNewToUser: !ownCodes.has(code),
  });

  return {
    code: metadata.code,
    city: metadata.city,
    country: metadata.country,
    reason,
    cheapestPriceCents: priceSignal.cheapestPriceCents,
    offer,
  };
}

/**
 * Builds the ranked candidate destination codes (with a human-readable
 * reason) for the `personalized` arm: own history first, then
 * collaborative-filtering co-occurrence, then trending backfill.
 */
async function buildPersonalizedCandidates(
  ownFrequency: analytics.DestinationFrequency[],
  trending: analytics.TrendingDestination[],
): Promise<Array<{ code: string; reason: string }>> {
  const candidates: Array<{ code: string; reason: string }> = [];
  const seenCodes = new Set<string>();

  for (const entry of ownFrequency.slice(0, PERSONALIZED_COUNT)) {
    candidates.push({ code: entry.code, reason: 'Because you searched for this route' });
    seenCodes.add(entry.code);
  }

  if (candidates.length < PERSONALIZED_COUNT) {
    const seedCodes = ownFrequency.slice(0, OWN_HISTORY_SEED_COUNT).map((entry) => entry.code);
    const coOccurring = await analytics.getCoOccurringDestinations(
      seedCodes,
      seenCodes,
      PERSONALIZED_COUNT - candidates.length,
    );
    for (const entry of coOccurring) {
      candidates.push({ code: entry.code, reason: 'Popular with travelers who like your usual destinations' });
      seenCodes.add(entry.code);
    }
  }

  for (const entry of trending) {
    if (candidates.length >= PERSONALIZED_COUNT) break;
    if (seenCodes.has(entry.code)) continue;
    candidates.push({ code: entry.code, reason: 'Trending with Traqora travelers' });
    seenCodes.add(entry.code);
  }

  return candidates;
}

export async function getRecommendations(userId: string): Promise<RecommendationsResult> {
  const variant = getVariantForUser(userId);

  const [ownFrequency, trending] = await Promise.all([
    analytics.getUserDestinationFrequency(userId),
    analytics.getTrendingDestinations(TRENDING_COUNT),
  ]);

  const loyaltyTier = loyaltyService.getTier(userId);
  const ownCodes = new Set(ownFrequency.map((entry) => entry.code));

  const candidates =
    variant === 'personalized'
      ? await buildPersonalizedCandidates(ownFrequency, trending)
      : trending.slice(0, PERSONALIZED_COUNT).map((entry) => ({
          code: entry.code,
          reason: 'Trending with Traqora travelers',
        }));

  const [personalized, trendingDestinations] = await Promise.all([
    Promise.all(
      candidates.map((candidate) =>
        buildRecommendedDestination(candidate.code, candidate.reason, loyaltyTier, ownCodes),
      ),
    ),
    Promise.all(
      trending.map((entry) =>
        buildRecommendedDestination(entry.code, 'Trending with Traqora travelers', loyaltyTier, ownCodes),
      ),
    ),
  ]);

  await Promise.all(
    personalized.map((destination) =>
      analytics.recordRecommendationEvent({
        userId,
        destinationCode: destination.code,
        variant,
        action: 'view',
        reason: destination.reason,
      }),
    ),
  );

  return { variant, personalized, trending: trendingDestinations };
}
