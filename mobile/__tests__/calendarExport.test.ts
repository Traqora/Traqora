import { generateIcsCalendar, BookingItinerarySnapshot } from '../booking/calendarExport';

describe('Calendar Export', () => {
  it('generates valid ICS calendar string for confirmed booking', () => {
    const snapshot: BookingItinerarySnapshot = {
      bookingId: 1001,
      flightNumber: 'TRQ101',
      origin: 'JFK',
      destination: 'LHR',
      departureTimestamp: 1672531200,
      arrivalTimestamp: 1672560000,
      seat: '12A'
    };

    const ics = generateIcsCalendar(snapshot);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Flight TRQ101: JFK to LHR');
    expect(ics).toContain('DTSTART:20230101T000000Z');
    expect(ics).toContain('DTEND:20230101T080000Z');
    expect(ics).toContain('UID:traqora-booking-1001@traqora.io');
    expect(ics).toContain('END:VCALENDAR');
  });
});
