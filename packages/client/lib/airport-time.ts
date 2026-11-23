/**
 * Airport-local time formatting for itinerary surfaces.
 *
 * Keep AIRPORT_TIMEZONES in sync with
 * packages/backend/src/utils/airportTimezones.ts — the backend remains the
 * canonical source; this copy exists because the web client is a separate
 * deployable and cannot import backend modules.
 */

const AIRPORT_TIMEZONES: Record<string, string> = {
  // North America
  JFK: "America/New_York", EWR: "America/New_York", LGA: "America/New_York",
  BOS: "America/New_York", IAD: "America/New_York", DCA: "America/New_York",
  MIA: "America/New_York", FLL: "America/New_York", TPA: "America/New_York",
  ATL: "America/New_York", CLT: "America/New_York", PHL: "America/New_York",
  BWI: "America/New_York", ORF: "America/New_York", RDU: "America/New_York",
  ORD: "America/Chicago", MDW: "America/Chicago", DTW: "America/Chicago",
  MSP: "America/Chicago", AUS: "America/Chicago", SAT: "America/Chicago",
  DEN: "America/Denver", SLC: "America/Denver", ABQ: "America/Denver",
  LAX: "America/Los_Angeles", SFO: "America/Los_Angeles", OAK: "America/Los_Angeles",
  SAN: "America/Los_Angeles", SEA: "America/Los_Angeles", PDX: "America/Los_Angeles",
  LAS: "America/Los_Angeles", PHX: "America/Phoenix", TUS: "America/Phoenix",
  ANC: "America/Anchorage", HNL: "Pacific/Honolulu",
  YYZ: "America/Toronto", YUL: "America/Toronto", YOW: "America/Toronto",
  YVR: "America/Vancouver", YYC: "America/Edmonton", YEG: "America/Edmonton",
  YWG: "America/Winnipeg", YHZ: "America/Halifax",
  // Mexico, Central & South America
  MEX: "America/Mexico_City", CUN: "America/Cancun", GDL: "America/Mexico_City",
  SJO: "America/Costa_Rica", PTY: "America/Panama",
  GRU: "America/Sao_Paulo", GIG: "America/Sao_Paulo", CGH: "America/Sao_Paulo",
  BSB: "America/Sao_Paulo", CNF: "America/Sao_Paulo",
  EZE: "America/Argentina/Buenos_Aires", AEP: "America/Argentina/Buenos_Aires",
  SCL: "America/Santiago", BOG: "America/Bogota", LIM: "America/Lima",
  UIO: "America/Guayaquil", MVD: "America/Montevideo", GYE: "America/Guayaquil",
  // Europe
  LHR: "Europe/London", LGW: "Europe/London", MAN: "Europe/London",
  EDI: "Europe/London", GLA: "Europe/London", BHX: "Europe/London",
  DUB: "Europe/Dublin", AMS: "Europe/Amsterdam",
  CDG: "Europe/Paris", ORY: "Europe/Paris",
  FRA: "Europe/Berlin", MUC: "Europe/Berlin", DUS: "Europe/Berlin", HAM: "Europe/Berlin",
  TXL: "Europe/Berlin", BER: "Europe/Berlin",
  ZRH: "Europe/Zurich", GVA: "Europe/Zurich",
  VIE: "Europe/Vienna", BRU: "Europe/Brussels",
  FCO: "Europe/Rome", MXP: "Europe/Rome", VCE: "Europe/Rome",
  LIS: "Europe/Lisbon", OPO: "Europe/Lisbon", FAO: "Europe/Lisbon",
  MAD: "Europe/Madrid", BCN: "Europe/Madrid", AGP: "Europe/Madrid",
  ATH: "Europe/Athens", IST: "Europe/Istanbul", SAW: "Europe/Istanbul",
  HEL: "Europe/Helsinki", CPH: "Europe/Copenhagen",
  ARN: "Europe/Stockholm", OSL: "Europe/Oslo", SVG: "Europe/Oslo",
  WAW: "Europe/Warsaw", PRG: "Europe/Prague", BUD: "Europe/Budapest",
  KEF: "Atlantic/Reykjavik",
  // Middle East & Africa
  DXB: "Asia/Dubai", AUH: "Asia/Dubai", DOH: "Asia/Qatar",
  RUH: "Asia/Riyadh", JED: "Asia/Riyadh", DMM: "Asia/Riyadh",
  TLV: "Asia/Jerusalem", AMM: "Asia/Amman", BEY: "Asia/Beirut",
  CAI: "Africa/Cairo", JNB: "Africa/Johannesburg", CPT: "Africa/Johannesburg",
  LOS: "Africa/Lagos", NBO: "Africa/Nairobi", ADD: "Africa/Addis_Ababa",
  CMN: "Africa/Casablanca", TUN: "Africa/Tunis", ALG: "Africa/Algiers",
  DAR: "Africa/Dar_es_Salaam", KGL: "Africa/Kampala",
  // Asia
  HND: "Asia/Tokyo", NRT: "Asia/Tokyo", KIX: "Asia/Tokyo", NGO: "Asia/Tokyo",
  ICN: "Asia/Seoul", PEK: "Asia/Shanghai", PVG: "Asia/Shanghai",
  CAN: "Asia/Guangzhou", SZX: "Asia/Shanghai", CTU: "Asia/Shanghai",
  HKG: "Asia/Hong_Kong", TPE: "Asia/Taipei",
  SIN: "Asia/Singapore", KUL: "Asia/Kuala_Lumpur", BKK: "Asia/Bangkok",
  HAN: "Asia/Bangkok", SGN: "Asia/Ho_Chi_Minh", REP: "Asia/Ho_Chi_Minh",
  DPS: "Asia/Makassar", CGK: "Asia/Jakarta", MNL: "Asia/Manila",
  DEL: "Asia/Kolkata", BOM: "Asia/Kolkata", MAA: "Asia/Kolkata",
  HYD: "Asia/Kolkata", BLR: "Asia/Kolkata", CCU: "Asia/Kolkata",
  CMB: "Asia/Colombo", DAC: "Asia/Dhaka", KHI: "Asia/Karachi",
  ISB: "Asia/Karachi", MLE: "Indian/Maldives", KTM: "Asia/Kathmandu",
  // Oceania
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne", BNE: "Australia/Brisbane",
  PER: "Australia/Perth", ADL: "Australia/Adelaide", AKL: "Pacific/Auckland",
  WLG: "Pacific/Auckland", NAN: "Pacific/Fiji", PPT: "Pacific/Tahiti",
};

export function airportTimeZone(airportCode: string | null | undefined): string {
  if (!airportCode) return "UTC";
  return AIRPORT_TIMEZONES[airportCode.trim().toUpperCase()] ?? "UTC";
}

export interface AirportLocalParts {
  /** IANA time zone used (UTC fallback for unknown airports). */
  timeZone: string;
  /** Short zone label, e.g. "GMT+1", "EDT", "UTC". */
  zoneLabel: string;
  /** HH:mm in the airport's local time. */
  time: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * Format an instant as airport-local "HH:mm" plus an explicit short zone
 * label (e.g. "18:35" + "GMT+1"). Unknown airports render in UTC.
 */
export function formatAirportClock(isoTimestamp: string, airportCode: string | null | undefined): AirportLocalParts {
  const timeZone = airportTimeZone(airportCode);
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return { timeZone, zoneLabel: timeZone === "UTC" ? "UTC" : timeZone, time: isoTimestamp };
  }
  const formatted = clockFormatter(timeZone).format(date); // e.g. "18:35 GMT+1"
  const idx = formatted.lastIndexOf(" ");
  return {
    timeZone,
    zoneLabel: idx === -1 ? timeZone : formatted.slice(idx + 1),
    time: idx === -1 ? formatted : formatted.slice(0, idx),
  };
}

/** Format the calendar date in the airport's local time zone. */
export function formatAirportDate(
  isoTimestamp: string,
  airportCode: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  },
): string {
  const timeZone = airportTimeZone(airportCode);
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return date.toLocaleDateString("en-US", { ...options, timeZone });
}

export { AIRPORT_TIMEZONES };
export default { airportTimeZone, formatAirportClock, formatAirportDate, AIRPORT_TIMEZONES };
