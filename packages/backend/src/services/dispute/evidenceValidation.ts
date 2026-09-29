export const MAX_EVIDENCE_URL_LENGTH = 2048;

const CID_V0 = 'Qm[1-9A-HJ-NP-Za-km-z]{44}';

const CID_V1 = 'b[a-z2-7]{58,}';

const CID_PATTERN = new RegExp(`^(?:${CID_V0}|${CID_V1})$`);

const IPFS_URI_PATTERN = new RegExp(`^ipfs://(?:${CID_V0}|${CID_V1})(?:/[^\\s]*)?$`);

const GATEWAY_PATH_PATTERN = new RegExp(`^/ipfs/(?:${CID_V0}|${CID_V1})(?:/.*)?$`);

// eslint-disable-next-line no-control-regex
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f]/;

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

export type EvidenceValidationCode = 
  | 'EVIDENCE_URL_TOO_LONG'
  | 'EVIDENCE_URL_INVALID_CHARACTERS'
  | 'EVIDENCE_URL_INVALID_CID'
  | 'EVIDENCE_URL_INVALID_FORMAT'
  | 'EVIDENCE_URL_INSECURE_GATEWAY'
  | 'EVIDENCE_URL_NOT_IPFS'
  | 'EVIDENCE_DESCRIPTION_EMPTY'
  | 'DESCRIPTION_TOO_SHORT'
  | 'URL_TOO_LONG'
  | 'INVALID_EVIDENCE';

export class EvidenceValidationError extends Error {
  code: string;
  constructor(message: string, code: string = 'INVALID_EVIDENCE') {
    super(message);
    this.code = code;
    this.name = 'EvidenceValidationError';
  }
}

export function validateEvidenceItem(description: string, fileUrl?: string): boolean {
  if (!description || description.length < 3) {
    throw new EvidenceValidationError('Evidence description must be at least 3 characters long', 'DESCRIPTION_TOO_SHORT');
  }
  if (fileUrl && fileUrl.length > 2048) {
    throw new EvidenceValidationError('File URL exceeds maximum length', 'URL_TOO_LONG');
  }
  return true;
}
