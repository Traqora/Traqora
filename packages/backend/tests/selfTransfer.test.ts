import { describe, it, expect } from '@jest/globals';
import { analyzeItinerary, explainSeparateTicketRisk, listSeparateTicketRisks } from '../src/services/selfTransferService';
import { SelfTransferSegmentInput } from '../src/types/selfTransfer';

const now = (m: number): string => new Date(Date.now() + m * 60 * 1000).toISOString();

function seg(o: Partial<SelfTransferSegmentInput> = {}): SelfTransferSegmentInput {
  return { bookingId: crypto.randomUUID(), bookingReference: 'REF-001', passengerEmail: 'alice@example.com', flightNumber: 'DL1234', airline: 'DL', fromAirport: 'JFK', toAirport: 'LHR', departure: now(0), arrival: now(120), ...o };
}

describe('analyzeItinerary', () => {
  it('labels separate-ticket connections as self-transfer', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'PNR-A', fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) }), seg({ bookingId: 'b', bookingReference: 'PNR-B', fromAirport: 'LHR', toAirport: 'CDG', departure: now(180) })]);
    expect(r.isSelfTransfer).toBe(true); expect(r.separateTicketCount).toBe(1); expect(r.overallRiskLevel).toBe('medium'); expect(r.segments[1].connection?.isSelfTransfer).toBe(true);
  });
  it('treats same-ticket connections as protected', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'SAME', fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) }), seg({ bookingId: 'b', bookingReference: 'SAME', fromAirport: 'LHR', toAirport: 'CDG', departure: now(180) })]);
    expect(r.isSelfTransfer).toBe(false); expect(r.separateTicketCount).toBe(0); expect(r.overallRiskLevel).toBe('low'); expect(r.segments[1].connection?.connectionProtected).toBe(true);
  });
  it('flags short layovers as higher risk', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'PNR-A', fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) }), seg({ bookingId: 'b', bookingReference: 'PNR-B', fromAirport: 'LHR', toAirport: 'CDG', departure: now(135) })]);
    expect(r.isSelfTransfer).toBe(true); expect(r.overallRiskLevel).toBe('severe');
  });
  it('treats unknown booking references conservatively as separate tickets', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: null, fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) }), seg({ bookingId: 'b', bookingReference: 'PNR-B', fromAirport: 'LHR', toAirport: 'CDG', departure: now(180) })]);
    expect(r.isSelfTransfer).toBe(true); expect(r.separateTicketCount).toBe(1);
  });
  it('does not flag non-connecting airports as self-transfer', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'PNR-A', fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) }), seg({ bookingId: 'b', bookingReference: 'PNR-B', fromAirport: 'CDG', toAirport: 'FCO', departure: now(180) })]);
    expect(r.isSelfTransfer).toBe(false); expect(r.separateTicketCount).toBe(0); expect(r.segments[1].connection).toBeUndefined();
  });
  it('groups multiple passengers independently', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'PNR-A', passengerEmail: 'alice@example.com', fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) }), seg({ bookingId: 'b', bookingReference: 'PNR-B', passengerEmail: 'alice@example.com', fromAirport: 'LHR', toAirport: 'CDG', departure: now(180) }), seg({ bookingId: 'c', bookingReference: 'PNR-C', passengerEmail: 'bob@example.com', fromAirport: 'JFK', toAirport: 'LHR', arrival: now(120) })]);
    expect(r.isSelfTransfer).toBe(true); expect(r.separateTicketCount).toBe(1);
  });
  it('returns empty results for no input', () => {
    const r = analyzeItinerary([]);
    expect(r.isSelfTransfer).toBe(false); expect(r.separateTicketCount).toBe(0); expect(r.segments).toEqual([]); expect(r.overallRiskLevel).toBe('low');
  });
  it('orders segments by departure within each passenger', () => {
    const r = analyzeItinerary([seg({ bookingId: 'later', bookingReference: 'PNR-X', fromAirport: 'LHR', toAirport: 'CDG', departure: now(300), arrival: now(360) }), seg({ bookingId: 'earlier', bookingReference: 'PNR-Y', fromAirport: 'JFK', toAirport: 'LHR', departure: now(0), arrival: now(120) })]);
    expect(r.segments[0].bookingId).toBe('earlier'); expect(r.segments[1].bookingId).toBe('later');
  });
  it('labels segment times with explicit airport-local time zones', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'PNR-A', fromAirport: 'JFK', toAirport: 'LHR', departure: '2025-10-21T14:00:00.000Z', arrival: '2025-10-21T22:00:00.000Z' })]);
    expect(r.segments[0].departureTimeZone).toBe('America/New_York');
    expect(r.segments[0].arrivalTimeZone).toBe('Europe/London');
    expect(r.segments[0].departureLocalTime).toContain('2025');
    expect(r.segments[0].arrivalLocalTime).toContain('2025');
  });
  it('falls back to UTC for airports without a known time zone', () => {
    const r = analyzeItinerary([seg({ bookingId: 'a', bookingReference: 'PNR-A', fromAirport: 'XXX', toAirport: 'YYY', departure: '2025-10-21T14:00:00.000Z', arrival: '2025-10-21T16:00:00.000Z' })]);
    expect(r.segments[0].departureTimeZone).toBe('UTC');
    expect(r.segments[0].arrivalTimeZone).toBe('UTC');
  });
});

describe('explainSeparateTicketRisk', () => {
  it('returns protected message when no separate tickets', () => { expect(explainSeparateTicketRisk(0, 0)).toContain('same ticket'); expect(explainSeparateTicketRisk(0, 0)).toContain('protected'); });
  it('returns warning message when separate tickets exist', () => { expect(explainSeparateTicketRisk(2, 2)).toContain('self-transfer connection(s)'); expect(explainSeparateTicketRisk(2, 2)).toContain('independent contracts'); });
});

describe('listSeparateTicketRisks', () => {
  it('returns all standing risks', () => { const r = listSeparateTicketRisks(); expect(r.length).toBeGreaterThan(0); expect(r.some((x) => x.id === 'no-missed-connection-protection')).toBe(true); expect(r.some((x) => x.id === 'baggage-not-checked-through')).toBe(true); expect(r.every((x) => x.title && x.description && x.severity)).toBe(true); });
});
