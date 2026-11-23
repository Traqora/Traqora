import type { Booking } from '../db/entities/Booking';

const AIRPORT_TIMEZONES: Record<string, string> = {
  ABV: 'Africa/Lagos', ACC: 'Africa/Accra', CPT: 'Africa/Johannesburg', KAN: 'Africa/Lagos', LOS: 'Africa/Lagos', NBO: 'Africa/Nairobi',
  CDG: 'Europe/Paris', FRA: 'Europe/Berlin', LHR: 'Europe/London',
  DXB: 'Asia/Dubai', HND: 'Asia/Tokyo', SYD: 'Australia/Sydney',
  JFK: 'America/New_York', LAX: 'America/Los_Angeles', ORD: 'America/Chicago', MIA: 'America/New_York', SFO: 'America/Los_Angeles', LAS: 'America/Los_Angeles', SEA: 'America/Los_Angeles', DEN: 'America/Denver', YYZ: 'America/Toronto',
};

export function airportTimezone(airport: string): string {
  return AIRPORT_TIMEZONES[airport.toUpperCase()] ?? 'UTC';
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function formatUtc(value: Date): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatLocal(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function offsetAt(value: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).reduce<Record<string, number>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = Number(part.value);
    return acc;
  }, {});
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - value.getTime()) / 60000;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
}

function timezoneBlock(timezone: string, referenceDate: Date): string {
  const year = referenceDate.getUTCFullYear() - 1;
  const standardDate = new Date(Date.UTC(year, 0, 1));
  const daylightDate = new Date(Date.UTC(year, 6, 1));
  const standardOffset = offsetAt(standardDate, timezone);
  const daylightOffset = offsetAt(daylightDate, timezone);
  const observances: Array<[string, Date, number, number, string]> = standardOffset === daylightOffset
    ? [["STANDARD", standardDate, standardOffset, standardOffset, 'STD']]
    : [
      ["STANDARD", standardDate, daylightOffset, standardOffset, 'STD'],
      ["DAYLIGHT", daylightDate, standardOffset, daylightOffset, 'DST'],
    ];

  return [
    'BEGIN:VTIMEZONE',
    `TZID:${timezone}`,
    `X-LIC-LOCATION:${timezone}`,
    ...observances.flatMap(([kind, date, from, to, name]) => [
      `BEGIN:${kind}`,
      `DTSTART:${formatLocal(date as Date, timezone)}`,
      `TZOFFSETFROM:${formatOffset(from as number)}`,
      `TZOFFSETTO:${formatOffset(to as number)}`,
      `TZNAME:${name}`,
      `END:${kind}`,
    ]),
    'END:VTIMEZONE',
  ].join('\r\n');
}

export function buildItineraryCalendar(booking: Booking): string {
  const flight = booking.flight;
  const departure = new Date(flight.departureTime);
  if (Number.isNaN(departure.getTime())) throw new Error('Flight departure time is invalid');

  const arrival = flight.arrivalTime ? new Date(flight.arrivalTime) : new Date(departure.getTime() + 2 * 60 * 60 * 1000);
  if (Number.isNaN(arrival.getTime())) throw new Error('Flight arrival time is invalid');

  const departureTimezone = airportTimezone(flight.fromAirport);
  const arrivalTimezone = airportTimezone(flight.toAirport);
  const updatedAt = booking.updatedAt instanceof Date ? booking.updatedAt : new Date(booking.updatedAt);
  const sequence = Number.isNaN(updatedAt.getTime()) ? 0 : Math.floor(updatedAt.getTime() / 1000);
  const summary = `${flight.airlineCode || ''}${flight.flightNumber}`.trim() || flight.flightNumber;
  const description = [
    `Traqora booking ${booking.id}`,
    `Flight ${summary}`,
    `${flight.fromAirport} to ${flight.toAirport}`,
    flight.status ? `Status: ${flight.status}` : '',
    flight.gate ? `Gate: ${flight.gate}` : '',
    flight.terminal ? `Terminal: ${flight.terminal}` : '',
  ].filter(Boolean).join('\\n');
  const timezones = departureTimezone === arrivalTimezone
    ? timezoneBlock(departureTimezone, departure)
    : `${timezoneBlock(departureTimezone, departure)}\r\n${timezoneBlock(arrivalTimezone, arrival)}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Traqora//Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    timezones,
    'BEGIN:VEVENT',
    `UID:${escapeText(`${booking.id}-${flight.id}@traqora.app`)}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `LAST-MODIFIED:${formatUtc(Number.isNaN(updatedAt.getTime()) ? new Date(0) : updatedAt)}`,
    `DTSTART;TZID=${departureTimezone}:${formatLocal(departure, departureTimezone)}`,
    `DTEND;TZID=${arrivalTimezone}:${formatLocal(arrival, arrivalTimezone)}`,
    `SUMMARY:${escapeText(`Flight ${summary}: ${flight.fromAirport} to ${flight.toAirport}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(`${flight.fromAirport} Airport to ${flight.toAirport} Airport`)}`,
    `X-TRAQORA-DEPARTURE-TZID:${departureTimezone}`,
    `X-TRAQORA-ARRIVAL-TZID:${arrivalTimezone}`,
    `X-TRAQORA-BOOKING-ID:${escapeText(booking.id)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
