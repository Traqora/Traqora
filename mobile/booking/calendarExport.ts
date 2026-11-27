export interface BookingItinerarySnapshot {
  bookingId: string | number;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTimestamp: number;
  arrivalTimestamp?: number;
  passengerName?: string;
  seat?: string;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function generateIcsCalendar(snapshot: BookingItinerarySnapshot): string {
  const start = formatDate(snapshot.departureTimestamp);
  // Default flight duration 2 hours if arrival not specified
  const endTimestamp = snapshot.arrivalTimestamp ? snapshot.arrivalTimestamp : snapshot.departureTimestamp + 7200;
  const end = formatDate(endTimestamp);
  const summary = `Flight ${snapshot.flightNumber}: ${snapshot.origin} to ${snapshot.destination}`;
  const description = `Confirmed Booking #${snapshot.bookingId}\nFlight: ${snapshot.flightNumber}\nRoute: ${snapshot.origin} -> ${snapshot.destination}${snapshot.seat ? '\nSeat: ' + snapshot.seat : ''}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Traqora//Booking Calendar//EN',
    'BEGIN:VEVENT',
    `UID:traqora-booking-${snapshot.bookingId}@traqora.io`,
    `DTSTAMP:${formatDate(Math.floor(Date.now() / 1000))}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${snapshot.origin} Airport`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}
