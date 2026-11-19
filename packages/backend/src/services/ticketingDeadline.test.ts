import { UnprocessableEntityError } from '../utils/errors';
import { resolveStoredTicketingDeadline, resolveTicketingDeadline } from './ticketingDeadline';

describe('ticketing deadline separate from departure (#906)', () => {
  it('turns a date-only provider deadline into its own end-of-day timestamp', () => {
    const result = resolveTicketingDeadline({
      lastTicketingDate: '2026-11-01',
      departureTime: '2026-11-02T08:00:00.000Z',
    });
    expect(result.ticketingDeadline).toBe('2026-11-01T23:59:59.000Z');
    expect(result.departureTime).toBe('2026-11-02T08:00:00.000Z');
    expect(result.ticketingDeadline).not.toBe(result.departureTime);
    expect(result.sameInstantAsDeparture).toBe(false);
  });

  it('does not substitute departure when the deadline cannot be read', () => {
    const result = resolveTicketingDeadline({
      lastTicketingDateTime: 'not-a-deadline',
      departureTime: '2026-11-02T08:00:00.000Z',
    });
    expect(result.ticketingDeadline).toBeNull();
    expect(result.departureTime).toBe('2026-11-02T08:00:00.000Z');
    expect(() =>
      resolveStoredTicketingDeadline('not-a-deadline', new Date('2026-11-02T08:00:00.000Z')),
    ).toThrow(UnprocessableEntityError);
  });

  it('keeps an equal instant labelled as the deadline rather than copying the field', () => {
    const result = resolveTicketingDeadline({
      lastTicketingDateTime: '2026-11-02T08:00:00.000Z',
      departureTime: '2026-11-02T08:00:00.000Z',
    });
    expect(result.sameInstantAsDeparture).toBe(true);
    expect(result.ticketingDeadline).toBe('2026-11-02T08:00:00.000Z');
    expect(result.departureTime).toBe(result.ticketingDeadline);
  });

  it('stores a corrected deadline on retry after a missing value', () => {
    const departure = new Date('2026-11-02T08:00:00.000Z');
    expect(resolveStoredTicketingDeadline(undefined, departure)).toBeNull();
    const stored = resolveStoredTicketingDeadline('2026-11-01T18:00:00.000Z', departure);
    expect(stored?.toISOString()).toBe('2026-11-01T18:00:00.000Z');
    expect(stored?.toISOString()).not.toBe(departure.toISOString());
  });
});
