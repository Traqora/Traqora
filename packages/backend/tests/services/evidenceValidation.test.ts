import {
  EvidenceValidationError,
  MAX_EVIDENCE_URL_LENGTH,
  normalizeEvidenceUrl,
  validateEvidenceInput,
} from '../../src/services/dispute/evidenceValidation';

const CID_V0 = 'QmYwAPJzv5CZsnAzt8auV2zEJjQ98q2TfGsDz3jAC5vVsx';
const CID_V1 = 'bafybeigdyrzt5x7g2kqdnmxz2d72nk44w63v3x4jtclq6ln6ai3n6gy2he';

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EvidenceValidationError);
    expect((err as EvidenceValidationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected EvidenceValidationError with code ${code}`);
};

describe('normalizeEvidenceUrl', () => {
  it.each([undefined, null, '', '   '])('treats %p as no attachment', (value) => {
    expect(normalizeEvidenceUrl(value as any)).toBeNull();
  });

  it('normalizes bare CIDv0 and CIDv1 to ipfs:// URIs', () => {
    expect(normalizeEvidenceUrl(CID_V0)).toBe(`ipfs://${CID_V0}`);
    expect(normalizeEvidenceUrl(`  ${CID_V1}  `)).toBe(`ipfs://${CID_V1}`);
  });

  it('accepts ipfs:// URIs with an optional path', () => {
    expect(normalizeEvidenceUrl(`ipfs://${CID_V1}`)).toBe(`ipfs://${CID_V1}`);
    expect(normalizeEvidenceUrl(`ipfs://${CID_V0}/receipt.pdf`)).toBe(`ipfs://${CID_V0}/receipt.pdf`);
  });

  it('accepts https IPFS gateway URLs', () => {
    const url = `https://ipfs.io/ipfs/${CID_V1}/receipt.pdf?download=true`;
    expect(normalizeEvidenceUrl(url)).toBe(url);
  });

  it('rejects ipfs:// URIs with an invalid CID', () => {
    expectCode(() => normalizeEvidenceUrl('ipfs://not-a-cid'), 'EVIDENCE_URL_INVALID_CID');
    expectCode(() => normalizeEvidenceUrl('ipfs://abc123'), 'EVIDENCE_URL_INVALID_CID');
  });

  it('rejects plain http gateways', () => {
    expectCode(() => normalizeEvidenceUrl(`http://ipfs.io/ipfs/${CID_V0}`), 'EVIDENCE_URL_INSECURE_GATEWAY');
  });

  it('rejects https URLs where /ipfs/ is not the path prefix or the CID is invalid', () => {
    expectCode(() => normalizeEvidenceUrl(`https://evil.example/redirect?to=/ipfs/${CID_V0}`), 'EVIDENCE_URL_NOT_IPFS');
    expectCode(() => normalizeEvidenceUrl(`https://evil.example/files/ipfs/${CID_V0}`), 'EVIDENCE_URL_NOT_IPFS');
    expectCode(() => normalizeEvidenceUrl('https://ipfs.io/ipfs/not-a-cid'), 'EVIDENCE_URL_NOT_IPFS');
    expectCode(() => normalizeEvidenceUrl('https://example.com/receipt.pdf'), 'EVIDENCE_URL_NOT_IPFS');
  });

  it('rejects gateway URLs with embedded credentials', () => {
    expectCode(() => normalizeEvidenceUrl(`https://user:pass@ipfs.io/ipfs/${CID_V0}`), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects other schemes and free text', () => {
    expectCode(() => normalizeEvidenceUrl('javascript:alert(1)'), 'EVIDENCE_URL_INVALID_FORMAT');
    expectCode(() => normalizeEvidenceUrl('file:///etc/passwd'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects embedded whitespace or control characters', () => {
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}/a b`), 'EVIDENCE_URL_INVALID_CHARACTERS');
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}/\u0000`), 'EVIDENCE_URL_INVALID_CHARACTERS');
  });

  it('rejects values over the maximum length', () => {
    const url = `https://ipfs.io/ipfs/${CID_V0}/${'a'.repeat(MAX_EVIDENCE_URL_LENGTH)}`;
    expectCode(() => normalizeEvidenceUrl(url), 'EVIDENCE_URL_TOO_LONG');
  });
});

describe('validateEvidenceInput', () => {
  it('trims the description and normalizes the file URL', () => {
    expect(validateEvidenceInput({ description: '  Boarding pass  ', fileUrl: CID_V0 })).toEqual({
      description: 'Boarding pass',
      fileUrl: `ipfs://${CID_V0}`,
    });
  });

  it('rejects whitespace-only descriptions', () => {
    expectCode(() => validateEvidenceInput({ description: '      ' }), 'EVIDENCE_DESCRIPTION_EMPTY');
  });
});
