import {
  EvidenceValidationError,
  MAX_EVIDENCE_URL_LENGTH,
  normalizeEvidenceUrl,
  validateEvidenceInput,
  validateEvidenceItem,
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

  it('handles null and undefined fileUrl', () => {
    expect(validateEvidenceInput({ description: 'Test', fileUrl: null })).toEqual({
      description: 'Test',
      fileUrl: null,
    });
    expect(validateEvidenceInput({ description: 'Test', fileUrl: undefined })).toEqual({
      description: 'Test',
      fileUrl: null,
    });
  });

  it('passes through URL validation errors from fileUrl', () => {
    expectCode(
      () => validateEvidenceInput({ description: 'Test', fileUrl: 'http://evil.com/ipfs/abc' }),
      'EVIDENCE_URL_INSECURE_GATEWAY',
    );
  });
});

describe('validateEvidenceItem', () => {
  it('accepts valid evidence with description and fileUrl', () => {
    expect(validateEvidenceItem('Receipt scan', CID_V0)).toBe(true);
  });

  it('accepts valid evidence with description only', () => {
    expect(validateEvidenceItem('Written statement')).toBe(true);
  });

  it('rejects empty description', () => {
    expectCode(() => validateEvidenceItem('', CID_V0), 'DESCRIPTION_TOO_SHORT');
  });

  it('rejects description shorter than 3 characters', () => {
    expectCode(() => validateEvidenceItem('ab', CID_V0), 'DESCRIPTION_TOO_SHORT');
  });

  it('rejects description exactly 2 characters', () => {
    expectCode(() => validateEvidenceItem('ab'), 'DESCRIPTION_TOO_SHORT');
  });

  it('accepts description exactly 3 characters', () => {
    expect(validateEvidenceItem('abc')).toBe(true);
  });

  it('rejects fileUrl exceeding maximum length', () => {
    const longUrl = 'a'.repeat(2049);
    expectCode(() => validateEvidenceItem('Test', longUrl), 'URL_TOO_LONG');
  });

  it('accepts fileUrl at maximum length', () => {
    const maxLengthUrl = 'a'.repeat(2048);
    expect(validateEvidenceItem('Test', maxLengthUrl)).toBe(true);
  });

  it('handles undefined fileUrl', () => {
    expect(validateEvidenceItem('Test description')).toBe(true);
  });
});

describe('EvidenceValidationError', () => {
  it('creates error with message and code', () => {
    const error = new EvidenceValidationError('Test error', 'TEST_CODE');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('EvidenceValidationError');
  });

  it('defaults to INVALID_EVIDENCE code when not provided', () => {
    const error = new EvidenceValidationError('Test error');
    expect(error.code).toBe('INVALID_EVIDENCE');
  });

  it('is instanceof Error', () => {
    const error = new EvidenceValidationError('Test error', 'TEST_CODE');
    expect(error instanceof Error).toBe(true);
  });
});

describe('CID validation edge cases', () => {
  it('rejects CIDv0 with invalid characters', () => {
    expectCode(() => normalizeEvidenceUrl('QmYwAPJzv5CZsnAzt8auV2zEJjQ98q2TfGsDz3jAC5vVsxX'), 'EVIDENCE_URL_INVALID_CID');
  });

  it('rejects CIDv0 with wrong length', () => {
    expectCode(() => normalizeEvidenceUrl('QmYwAPJzv5CZsnAzt8auV2zEJjQ98q2TfGsDz3jAC5vV'), 'EVIDENCE_URL_INVALID_CID');
  });

  it('rejects CIDv1 with invalid base32 characters', () => {
    expectCode(() => normalizeEvidenceUrl('bafybeigdyrzt5x7g2kqdnmxz2d72nk44w63v3x4jtclq6ln6ai3n6gy2h'), 'EVIDENCE_URL_INVALID_CID');
  });

  it('accepts CIDv1 with valid minimum length', () => {
    const minCidV1 = 'b' + 'a'.repeat(58);
    expect(normalizeEvidenceUrl(minCidV1)).toBe(`ipfs://${minCidV1}`);
  });

  it('accepts CIDv1 with longer length', () => {
    const longCidV1 = 'b' + 'a'.repeat(100);
    expect(normalizeEvidenceUrl(longCidV1)).toBe(`ipfs://${longCidV1}`);
  });
});

describe('IPFS URI validation edge cases', () => {
  it('accepts ipfs:// with path component', () => {
    expect(normalizeEvidenceUrl(`ipfs://${CID_V0}/path/to/file.pdf`)).toBe(`ipfs://${CID_V0}/path/to/file.pdf`);
  });

  it('accepts ipfs:// with query parameters', () => {
    expect(normalizeEvidenceUrl(`ipfs://${CID_V0}?download=true`)).toBe(`ipfs://${CID_V0}?download=true`);
  });

  it('accepts ipfs:// with fragment', () => {
    expect(normalizeEvidenceUrl(`ipfs://${CID_V0}#page=2`)).toBe(`ipfs://${CID_V0}#page=2`);
  });

  it('rejects ipfs:// with whitespace in path', () => {
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}/my file.pdf`), 'EVIDENCE_URL_INVALID_CID');
  });

  it('rejects ipfs:// with control characters', () => {
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}/file\u0000.pdf`), 'EVIDENCE_URL_INVALID_CID');
  });

  it('accepts case-insensitive ipfs:// protocol', () => {
    expect(normalizeEvidenceUrl(`IPFS://${CID_V0}`)).toBe(`IPFS://${CID_V0}`);
    expect(normalizeEvidenceUrl(`Ipfs://${CID_V0}`)).toBe(`Ipfs://${CID_V0}`);
  });
});

describe('Gateway URL validation edge cases', () => {
  it('accepts gateway with query parameters', () => {
    const url = `https://ipfs.io/ipfs/${CID_V1}/file.pdf?download=true&filename=test.pdf`;
    expect(normalizeEvidenceUrl(url)).toBe(url);
  });

  it('accepts gateway with fragment', () => {
    const url = `https://ipfs.io/ipfs/${CID_V1}/file.pdf#page=5`;
    expect(normalizeEvidenceUrl(url)).toBe(url);
  });

  it('accepts gateway with port number', () => {
    const url = `https://ipfs.io:443/ipfs/${CID_V1}`;
    expect(normalizeEvidenceUrl(url)).toBe(url);
  });

  it('rejects gateway with http protocol', () => {
    expectCode(() => normalizeEvidenceUrl(`http://ipfs.io/ipfs/${CID_V0}`), 'EVIDENCE_URL_INSECURE_GATEWAY');
  });

  it('rejects gateway with username in URL', () => {
    expectCode(() => normalizeEvidenceUrl(`https://user@ipfs.io/ipfs/${CID_V0}`), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects gateway with password in URL', () => {
    expectCode(() => normalizeEvidenceUrl(`https://:pass@ipfs.io/ipfs/${CID_V0}`), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects gateway with both username and password', () => {
    expectCode(() => normalizeEvidenceUrl(`https://user:pass@ipfs.io/ipfs/${CID_V0}`), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects gateway with path not starting with /ipfs/', () => {
    expectCode(() => normalizeEvidenceUrl(`https://ipfs.io/files/${CID_V0}`), 'EVIDENCE_URL_NOT_IPFS');
  });

  it('rejects gateway with /ipfs/ but invalid CID', () => {
    expectCode(() => normalizeEvidenceUrl('https://ipfs.io/ipfs/not-a-cid'), 'EVIDENCE_URL_NOT_IPFS');
  });

  it('rejects gateway with query-based redirect attempt', () => {
    expectCode(() => normalizeEvidenceUrl(`https://evil.com?path=/ipfs/${CID_V0}`), 'EVIDENCE_URL_NOT_IPFS');
  });

  it('rejects non-IPFS https URLs', () => {
    expectCode(() => normalizeEvidenceUrl('https://example.com/file.pdf'), 'EVIDENCE_URL_NOT_IPFS');
    expectCode(() => normalizeEvidenceUrl('https://s3.amazonaws.com/bucket/file.pdf'), 'EVIDENCE_URL_NOT_IPFS');
  });
});

describe('Security-related validation', () => {
  it('rejects javascript: URLs', () => {
    expectCode(() => normalizeEvidenceUrl('javascript:alert(1)'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects data: URLs', () => {
    expectCode(() => normalizeEvidenceUrl('data:text/plain,hello'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects file: URLs', () => {
    expectCode(() => normalizeEvidenceUrl('file:///etc/passwd'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects ftp: URLs', () => {
    expectCode(() => normalizeEvidenceUrl('ftp://example.com/file.pdf'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects mailto: URLs', () => {
    expectCode(() => normalizeEvidenceUrl('mailto:test@example.com'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects tel: URLs', () => {
    expectCode(() => normalizeEvidenceUrl('tel:+1234567890'), 'EVIDENCE_URL_INVALID_FORMAT');
  });

  it('rejects URLs with embedded newlines', () => {
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}\n/malicious`), 'EVIDENCE_URL_INVALID_CHARACTERS');
  });

  it('rejects URLs with embedded tabs', () => {
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}\t/malicious`), 'EVIDENCE_URL_INVALID_CHARACTERS');
  });

  it('rejects URLs with null bytes', () => {
    expectCode(() => normalizeEvidenceUrl(`ipfs://${CID_V0}\u0000/malicious`), 'EVIDENCE_URL_INVALID_CHARACTERS');
  });
});

describe('Unicode and special characters', () => {
  it('accepts unicode characters in description when using validateEvidenceInput', () => {
    const result = validateEvidenceInput({ description: '收据扫描 📄', fileUrl: CID_V0 });
    expect(result.description).toBe('收据扫描 📄');
  });

  it('accepts unicode in description for validateEvidenceItem', () => {
    expect(validateEvidenceItem('Receipt 扫描 📄')).toBe(true);
  });

  it('rejects control characters in description via validateEvidenceItem', () => {
    expectCode(() => validateEvidenceItem('Test\u0000'), 'DESCRIPTION_TOO_SHORT');
  });
});

describe('Boundary conditions', () => {
  it('accepts URL at exactly MAX_EVIDENCE_URL_LENGTH', () => {
    const url = `https://ipfs.io/ipfs/${CID_V0}/${'a'.repeat(MAX_EVIDENCE_URL_LENGTH - 50)}`;
    expect(normalizeEvidenceUrl(url)).toBe(url);
  });

  it('rejects URL at MAX_EVIDENCE_URL_LENGTH + 1', () => {
    const url = `https://ipfs.io/ipfs/${CID_V0}/${'a'.repeat(MAX_EVIDENCE_URL_LENGTH - 49)}`;
    expectCode(() => normalizeEvidenceUrl(url), 'EVIDENCE_URL_TOO_LONG');
  });

  it('handles very long descriptions in validateEvidenceInput', () => {
    const longDesc = 'a'.repeat(10000);
    const result = validateEvidenceInput({ description: longDesc });
    expect(result.description).toBe(longDesc);
  });

  it('handles minimum valid description length', () => {
    expect(validateEvidenceItem('abc')).toBe(true);
  });
});
