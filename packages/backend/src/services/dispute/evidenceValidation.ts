/**
 * Evidence upload validation for dispute evidence.
 *
 * Contract (see docs/DISPUTE_EVIDENCE_UPLOADS.md):
 * - `description` must contain non-whitespace text.
 * - `fileUrl` is optional. Empty / whitespace-only values mean "no attachment" (stored as null).
 * - Accepted `fileUrl` forms:
 *     1. Bare CIDv0 (`Qm...`, base58, 46 chars)           -> normalized to `ipfs://<cid>`
 *     2. Bare CIDv1 (base32 lowercase, `b...`)             -> normalized to `ipfs://<cid>`
 *     3. `ipfs://<cid>[/path]`                             -> stored as-is
 *     4. `https://<gateway>/ipfs/<cid>[/path][?query]`     -> stored as-is
 * - Rejected: non-https gateways, URLs with embedded credentials, URLs whose path does not start
 *   with `/ipfs/<valid cid>`, malformed CIDs, whitespace/control characters, values over 2048 chars.
 *
 * Violations throw `EvidenceValidationError` so callers can distinguish them from other failures.
 */

export const MAX_EVIDENCE_URL_LENGTH = 2048;

const CID_V0 = 'Qm[1-9A-HJ-NP-Za-km-z]{44}';
const CID_V1 = 'b[a-z2-7]{58,}';
const CID_PATTERN = new RegExp(`^(?:${CID_V0}|${CID_V1})$`);
const IPFS_URI_PATTERN = new RegExp(`^ipfs://(?:${CID_V0}|${CID_V1})(?:/[^\\s]*)?$`);
const GATEWAY_PATH_PATTERN = new RegExp(`^/ipfs/(?:${CID_V0}|${CID_V1})(?:/.*)?$`);
// eslint-disable-next-line no-control-regex
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]/;

export type EvidenceValidationCode =
  | 'EVIDENCE_DESCRIPTION_EMPTY'
  | 'EVIDENCE_URL_TOO_LONG'
  | 'EVIDENCE_URL_INVALID_CHARACTERS'
  | 'EVIDENCE_URL_INVALID_CID'
  | 'EVIDENCE_URL_INSECURE_GATEWAY'
  | 'EVIDENCE_URL_NOT_IPFS'
  | 'EVIDENCE_URL_INVALID_FORMAT';

export class EvidenceValidationError extends Error {
  readonly code: EvidenceValidationCode;

  constructor(code: EvidenceValidationCode, message: string) {
    super(message);
    this.name = 'EvidenceValidationError';
    this.code = code;
  }
}

export function normalizeEvidenceUrl(raw?: string | null): string | null {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (!value) return null;

  if (value.length > MAX_EVIDENCE_URL_LENGTH) {
    throw new EvidenceValidationError(
      'EVIDENCE_URL_TOO_LONG',
      `Evidence URL must be at most ${MAX_EVIDENCE_URL_LENGTH} characters`,
    );
  }

  if (WHITESPACE_OR_CONTROL.test(value)) {
    throw new EvidenceValidationError(
      'EVIDENCE_URL_INVALID_CHARACTERS',
      'Evidence URL must not contain whitespace or control characters',
    );
  }

  if (CID_PATTERN.test(value)) {
    return `ipfs://${value}`;
  }

  if (/^ipfs:\/\//i.test(value)) {
    if (IPFS_URI_PATTERN.test(value)) return value;
    throw new EvidenceValidationError('EVIDENCE_URL_INVALID_CID', 'Evidence ipfs:// URI must reference a valid CID');
  }

  if (/^https?:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new EvidenceValidationError('EVIDENCE_URL_INVALID_FORMAT', 'Invalid evidence URI format');
    }

    if (parsed.protocol !== 'https:') {
      throw new EvidenceValidationError('EVIDENCE_URL_INSECURE_GATEWAY', 'Evidence gateway URLs must use https');
    }

    if (parsed.username || parsed.password) {
      throw new EvidenceValidationError(
        'EVIDENCE_URL_INVALID_FORMAT',
        'Evidence gateway URLs must not contain credentials',
      );
    }

    if (!GATEWAY_PATH_PATTERN.test(parsed.pathname)) {
      throw new EvidenceValidationError(
        'EVIDENCE_URL_NOT_IPFS',
        'Evidence URL must be an IPFS CID, ipfs:// URI, or an IPFS gateway URL',
      );
    }

    return value;
  }

  throw new EvidenceValidationError('EVIDENCE_URL_INVALID_FORMAT', 'Invalid evidence URI format');
}

export function validateEvidenceInput(input: { description: string; fileUrl?: string | null }): {
  description: string;
  fileUrl: string | null;
} {
  const description = (input.description ?? '').trim();
  if (!description) {
    throw new EvidenceValidationError('EVIDENCE_DESCRIPTION_EMPTY', 'Evidence description must not be empty');
  }

  return { description, fileUrl: normalizeEvidenceUrl(input.fileUrl) };
}
