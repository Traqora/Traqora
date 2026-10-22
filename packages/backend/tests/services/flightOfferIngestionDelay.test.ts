/**
 * Regression coverage for #933: publish provider offer ingestion delay with a
 * bounded label set, and reject timestamps that cannot describe staleness.
 */

import {
  normalizeFlightProviderLabel,
  recordFlightOfferIngestionDelay,
  register,
} from '../../src/services/metrics';

describe('normalizeFlightProviderLabel', () => {
  it('maps known providers and aliases to bounded labels', () => {
    expect(normalizeFlightProviderLabel('Amadeus')).toBe('amadeus');
    expect(normalizeFlightProviderLabel('LH')).toBe('lufthansa');
    expect(normalizeFlightProviderLabel('Lufthansa')).toBe('lufthansa');
    expect(normalizeFlightProviderLabel('Air France')).toBe('air-france');
    expect(normalizeFlightProviderLabel('BA')).toBe('british-airways');
    expect(normalizeFlightProviderLabel('offchain-repository')).toBe(
      'offchain-repository',
    );
  });

  it('collapses unknown providers so cardinality stays bounded', () => {
    expect(normalizeFlightProviderLabel('brand-new-provider')).toBe('other');
    expect(normalizeFlightProviderLabel('')).toBe('other');
    expect(normalizeFlightProviderLabel(null)).toBe('other');
  });
});

describe('recordFlightOfferIngestionDelay', () => {
  const ingestedAt = new Date('2026-10-19T12:00:00.000Z');

  it('observes the delay between provider update and ingestion', async () => {
    const providerUpdatedAt = new Date(ingestedAt.getTime() - 120_000);

    expect(
      recordFlightOfferIngestionDelay('Lufthansa', providerUpdatedAt, ingestedAt),
    ).toBe(true);

    const metrics = await register.metrics();
    expect(metrics).toContain(
      'traqora_flight_offer_ingestion_delay_seconds_count{provider="lufthansa"}',
    );
    expect(metrics).toContain(
      'traqora_flight_offer_ingestion_delay_seconds_sum{provider="lufthansa"} 120',
    );
  });

  it('labels a new provider as other instead of creating a new series', async () => {
    expect(
      recordFlightOfferIngestionDelay(
        'a-provider-that-does-not-exist',
        new Date(ingestedAt.getTime() - 60_000),
        ingestedAt,
      ),
    ).toBe(true);

    const metrics = await register.metrics();
    expect(metrics).toContain(
      'traqora_flight_offer_ingestion_delay_seconds_count{provider="other"}',
    );
    expect(metrics).not.toContain(
      'provider="a-provider-that-does-not-exist"',
    );
  });

  it('skips missing, invalid, and future provider timestamps', () => {
    expect(recordFlightOfferIngestionDelay('amadeus', null, ingestedAt)).toBe(false);
    expect(recordFlightOfferIngestionDelay('amadeus', 'not-a-date', ingestedAt)).toBe(
      false,
    );
    expect(
      recordFlightOfferIngestionDelay(
        'amadeus',
        new Date(ingestedAt.getTime() + 1_000),
        ingestedAt,
      ),
    ).toBe(false);
  });
});
