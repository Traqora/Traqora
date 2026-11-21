/**
 * Supplier schedule change model for the v1 booking detail view (issue #1145).
 *
 * A change is only renderable when it carries an explicit provider
 * verification marker. Unverified or malformed entries are dropped at the
 * boundary so the UI can never present an unchecked value as a supplier fact.
 */

export interface ScheduleChange {
  id: string;
  flightNumber: string;
  originalDeparture: string;
  revisedDeparture: string;
  /** Literal marker. Values without "provider" are rejected by normalization. */
  verifiedBy: "provider";
  /** ISO timestamp for when the supplier published the change. */
  verifiedAt: string;
  reason?: string;
  providerOfferId?: string;
}

const MAX_CHANGES = 20;
const MAX_SHORT_FIELD = 80;
const MAX_REASON_LENGTH = 200;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

/**
 * Validate a raw list of schedule changes in one linear pass.
 *
 * Kept pure and dependency free so it is cheap on render and easy to test.
 * Nothing here performs I/O; callers supply data already obtained from a
 * trusted provider-backed source.
 */
export function normalizeScheduleChanges(input: readonly unknown[]): ScheduleChange[] {
  if (!Array.isArray(input)) return [];

  const changes: ScheduleChange[] = [];
  for (const entry of input) {
    if (changes.length >= MAX_CHANGES) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const candidate = entry as Record<string, unknown>;
    if (candidate.verifiedBy !== "provider") continue;

    const id = cleanText(candidate.id, MAX_SHORT_FIELD);
    const flightNumber = cleanText(candidate.flightNumber, MAX_SHORT_FIELD);
    const originalDeparture = cleanText(candidate.originalDeparture, MAX_SHORT_FIELD);
    const revisedDeparture = cleanText(candidate.revisedDeparture, MAX_SHORT_FIELD);
    const verifiedAt = cleanText(candidate.verifiedAt, MAX_SHORT_FIELD);

    if (!id || !flightNumber || !originalDeparture || !revisedDeparture || !verifiedAt) continue;
    if (Number.isNaN(Date.parse(verifiedAt))) continue;
    if (originalDeparture === revisedDeparture) continue;

    const change: ScheduleChange = {
      id,
      flightNumber,
      originalDeparture,
      revisedDeparture,
      verifiedBy: "provider",
      verifiedAt,
    };

    const reason = cleanText(candidate.reason, MAX_REASON_LENGTH);
    if (reason) change.reason = reason;

    const providerOfferId = cleanText(candidate.providerOfferId, MAX_SHORT_FIELD);
    if (providerOfferId) change.providerOfferId = providerOfferId;

    changes.push(change);
  }

  return changes;
}
