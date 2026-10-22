import { buildItineraryCalendar } from '../../src/services/itineraryCalendar';

const booking = (updatedAt: Date) => ({
  id: 'booking-1',
  updatedAt,
  flight: {
    id: 'flight-1', flightNumber: '101', airlineCode: 'TQ',
    fromAirport: 'JFK', toAirport: 'LHR',
    departureTime: new Date('2026-11-01T14:00:00.000Z'),
    arrivalTime: new Date('2026-11-01T22:00:00.000Z'), status: 'SCHEDULED',
  },
} as any);

describe('buildItineraryCalendar', () => {
  it('emits a stable UID, airport TZIDs, and CRLF calendar lines', () => {
    const calendar = buildItineraryCalendar(booking(new Date('2026-10-01T00:00:00.000Z')));
    expect(calendar).toContain('UID:booking-1-flight-1@traqora.app');
    expect(calendar).toContain('DTSTART;TZID=America/New_York:20261101T090000');
    expect(calendar).toContain('DTEND;TZID=Europe/London:20261101T220000');
    expect(calendar).toContain('\r\nBEGIN:VEVENT\r\n');
  });

  it('changes SEQUENCE/LAST-MODIFIED when the booking/flight update timestamp changes', () => {
    const first = buildItineraryCalendar(booking(new Date('2026-10-01T00:00:00.000Z')));
    const second = buildItineraryCalendar(booking(new Date('2026-10-02T00:00:00.000Z')));
    expect(first).not.toBe(second);
    expect(second).toContain('LAST-MODIFIED:20261002T000000Z');
  });
});
