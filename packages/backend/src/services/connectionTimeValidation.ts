/**
 * Minimum connection time (MCT) checks for self-transfer itineraries (#901).
 *
 * A connection is the layover between two consecutive segments. Self-transfer
 * means the passenger holds separate tickets (different `ticketId` values, or
 * an explicit `selfTransfer` flag) and is not protected by a single carrier.
 *
 * Expected behavior
 * -----------------
 * - Layover >= configured MCT for the airport pair: accepted.
 * - Layover shorter than MCT: flagged (`ok: false`) with a stable reason.
 * - Missing/invalid times: flagged as `invalid_times`.
 * - Direct itineraries (0–1 segments): no connections to flag.
 *
 * Failure cases
 * -------------
 * - Self-transfer connections use the pair MCT plus `selfTransferExtraMinutes`
 *   because the passenger must collect bags and re-check.
 * - Unknown airport pairs fall back to `defaultMinutes`.
 */

export interface ConnectionSegment {
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  marketingCarrier?: string;
  operatingCarrier?: string;
  ticketId?: string;
  selfTransfer?: boolean;
}

export interface ConnectionTimeConfig {
  /** MCT used when the airport pair is not in `pairMinutes`. */
  defaultMinutes: number;
  /** Keyed as `ARRIVALAIRPORT-NEXTAIRPORT`, e.g. `LHR-CDG`. */
  pairMinutes?: Record<string, number>;
  /** Extra minutes required when the connection is a self-transfer. */
  selfTransferExtraMinutes?: number;
}

export const DEFAULT_CONNECTION_TIME_CONFIG: ConnectionTimeConfig = {
  defaultMinutes: 90,
  pairMinutes: {
    "JFK-JFK": 75,
    "LHR-LHR": 90,
    "LHR-LGW": 180,
    "CDG-CDG": 90,
  },
  selfTransferExtraMinutes: 60,
};

export type ConnectionFlagReason =
  | "below_minimum"
  | "invalid_times"
  | "negative_layover";

export interface ConnectionFlag {
  fromAirport: string;
  toAirport: string;
  layoverMinutes: number | null;
  requiredMinutes: number;
  selfTransfer: boolean;
  ok: boolean;
  reason?: ConnectionFlagReason;
}

export function pairKey(arrivalAirport: string, nextDepartureAirport: string): string {
  return `${arrivalAirport.trim().toUpperCase()}-${nextDepartureAirport.trim().toUpperCase()}`;
}

export function isSelfTransfer(
  inbound: ConnectionSegment,
  outbound: ConnectionSegment,
): boolean {
  if (inbound.selfTransfer || outbound.selfTransfer) return true;
  if (inbound.ticketId && outbound.ticketId) {
    return inbound.ticketId !== outbound.ticketId;
  }
  return false;
}

export function requiredMinutesFor(
  arrivalAirport: string,
  nextAirport: string,
  selfTransfer: boolean,
  config: ConnectionTimeConfig = DEFAULT_CONNECTION_TIME_CONFIG,
): number {
  const pair = pairKey(arrivalAirport, nextAirport);
  const base = config.pairMinutes?.[pair] ?? config.defaultMinutes;
  const extra = selfTransfer ? config.selfTransferExtraMinutes ?? 0 : 0;
  return base + extra;
}

function layoverMinutes(inbound: ConnectionSegment, outbound: ConnectionSegment): number | null {
  const arrival = Date.parse(inbound.arrivalAt);
  const departure = Date.parse(outbound.departureAt);
  if (Number.isNaN(arrival) || Number.isNaN(departure)) return null;
  return Math.round((departure - arrival) / 60000);
}

/**
 * Flag every connection whose layover is shorter than the configured MCT.
 * Direct flights return an empty list.
 */
export function validateConnectionTimes(
  segments: ConnectionSegment[],
  config: ConnectionTimeConfig = DEFAULT_CONNECTION_TIME_CONFIG,
): ConnectionFlag[] {
  const flags: ConnectionFlag[] = [];
  for (let i = 0; i < segments.length - 1; i += 1) {
    const inbound = segments[i];
    const outbound = segments[i + 1];
    const selfTransfer = isSelfTransfer(inbound, outbound);
    const required = requiredMinutesFor(inbound.to, outbound.from, selfTransfer, config);
    const layover = layoverMinutes(inbound, outbound);

    if (layover === null) {
      flags.push({
        fromAirport: inbound.to,
        toAirport: outbound.from,
        layoverMinutes: null,
        requiredMinutes: required,
        selfTransfer,
        ok: false,
        reason: "invalid_times",
      });
      continue;
    }

    if (layover < 0) {
      flags.push({
        fromAirport: inbound.to,
        toAirport: outbound.from,
        layoverMinutes: layover,
        requiredMinutes: required,
        selfTransfer,
        ok: false,
        reason: "negative_layover",
      });
      continue;
    }

    const ok = layover >= required;
    flags.push({
      fromAirport: inbound.to,
      toAirport: outbound.from,
      layoverMinutes: layover,
      requiredMinutes: required,
      selfTransfer,
      ok,
      reason: ok ? undefined : "below_minimum",
    });
  }
  return flags;
}

export function hasInsufficientConnection(flags: ConnectionFlag[]): boolean {
  return flags.some((flag) => !flag.ok);
}
