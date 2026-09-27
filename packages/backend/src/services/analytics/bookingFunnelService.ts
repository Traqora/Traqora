/**
 * Search → Book → Pay conversion funnel — issue #770.
 *
 * Contract (see docs/BOOKING_FUNNEL.md):
 *  - Input: a half-open time window [from, to). Both bounds must be valid dates, from < to, and the
 *    window may not exceed MAX_FUNNEL_WINDOW_DAYS.
 *  - Stages (counted independently inside the window, keyed on createdAt):
 *      search → rows in search_history_entries
 *      book   → rows in bookings (any status)
 *      pay    → bookings whose status is at or past successful payment (PAID_BOOKING_STATUSES)
 *  - Output: per-stage count, conversion from the previous stage and drop-off, plus overall
 *    search→pay conversion. Rates are percentages rounded to 1 dp, or null when the denominator is 0.
 *  - Errors: FunnelWindowError for an invalid window.
 */

import { AppDataSource } from '../../db/dataSource';
import { Booking, BookingStatus } from '../../db/entities/Booking';
import { SearchHistoryEntry } from '../../db/entities/SearchHistoryEntry';

export const DEFAULT_FUNNEL_WINDOW_DAYS = 30;
export const MAX_FUNNEL_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses a booking can only reach after payment succeeded. */
export const PAID_BOOKING_STATUSES: BookingStatus[] = [
  'paid',
  'onchain_pending',
  'onchain_submitted',
  'confirmed',
  'refunded',
  'refund_rejected',
];

export type FunnelStageKey = 'search' | 'book' | 'pay';

export interface FunnelStage {
  key: FunnelStageKey;
  count: number;
  /** % of the previous stage that reached this stage (100 for the first stage). */
  conversionFromPrevious: number | null;
  /** 100 - conversionFromPrevious (0 for the first stage). */
  dropOffFromPrevious: number | null;
}

export interface BookingFunnelReport {
  window: { from: string; to: string };
  stages: FunnelStage[];
  overallConversionRate: number | null;
}

export interface FunnelCounts {
  searches: number;
  bookings: number;
  payments: number;
}

export class FunnelWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FunnelWindowError';
  }
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function resolveFunnelWindow(from?: Date, to?: Date, now: Date = new Date()): { from: Date; to: Date } {
  const end = to ?? now;
  const start = from ?? new Date(end.getTime() - DEFAULT_FUNNEL_WINDOW_DAYS * DAY_MS);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new FunnelWindowError('from and to must be valid dates');
  }
  if (start >= end) {
    throw new FunnelWindowError('from must be before to');
  }
  if (end.getTime() - start.getTime() > MAX_FUNNEL_WINDOW_DAYS * DAY_MS) {
    throw new FunnelWindowError(`Funnel window may not exceed ${MAX_FUNNEL_WINDOW_DAYS} days`);
  }
  return { from: start, to: end };
}

export function buildFunnelReport(counts: FunnelCounts, window: { from: Date; to: Date }): BookingFunnelReport {
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Funnel count "${name}" must be a non-negative integer`);
    }
  }

  const ordered: Array<[FunnelStageKey, number]> = [
    ['search', counts.searches],
    ['book', counts.bookings],
    ['pay', counts.payments],
  ];

  const stages: FunnelStage[] = ordered.map(([key, count], index) => {
    if (index === 0) {
      return { key, count, conversionFromPrevious: 100, dropOffFromPrevious: 0 };
    }
    const conversion = rate(count, ordered[index - 1][1]);
    return {
      key,
      count,
      conversionFromPrevious: conversion,
      dropOffFromPrevious: conversion === null ? null : Number((100 - conversion).toFixed(1)),
    };
  });

  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    stages,
    overallConversionRate: rate(counts.payments, counts.searches),
  };
}

export async function getBookingFunnel(params: { from?: Date; to?: Date } = {}): Promise<BookingFunnelReport> {
  const window = resolveFunnelWindow(params.from, params.to);
  const range = { from: window.from, to: window.to };

  const [searches, bookings, payments] = await Promise.all([
    AppDataSource.getRepository(SearchHistoryEntry)
      .createQueryBuilder('search')
      .where('search.createdAt >= :from AND search.createdAt < :to', range)
      .getCount(),
    AppDataSource.getRepository(Booking)
      .createQueryBuilder('booking')
      .where('booking.createdAt >= :from AND booking.createdAt < :to', range)
      .getCount(),
    AppDataSource.getRepository(Booking)
      .createQueryBuilder('booking')
      .where('booking.createdAt >= :from AND booking.createdAt < :to', range)
      .andWhere('booking.status IN (:...statuses)', { statuses: PAID_BOOKING_STATUSES })
      .getCount(),
  ]);

  return buildFunnelReport({ searches, bookings, payments }, window);
}
