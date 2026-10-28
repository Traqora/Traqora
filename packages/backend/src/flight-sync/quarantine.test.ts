import { syncAndQuarantineBatch, ProviderRecord } from './quarantine';

describe('syncAndQuarantineBatch', () => {
  test('processes valid records and quarantines malformed ones', () => {
    const records: ProviderRecord[] = [
      { id: 'rec-1', payload: { flight: 'AA123' } },
      { id: '', payload: { flight: 'BAD' } },
      { id: 'rec-3', payload: { flight: 'UA456' } },
    ];

    const validator = (r: ProviderRecord) => r.payload.flight !== 'UA456';

    const result = syncAndQuarantineBatch(records, validator);

    expect(result.validRecords).toHaveLength(1);
    expect(result.validRecords[0].id).toBe('rec-1');

    expect(result.quarantinedRecords).toHaveLength(2);
    expect(result.quarantinedRecords[0].id).toBe('unknown');
    expect(result.quarantinedRecords[1].id).toBe('rec-3');
    expect(result.quarantinedRecords[1].reason).toContain('Validation failed');
  });

  test('handles exceptions thrown in validator safely', () => {
    const records: ProviderRecord[] = [
      { id: 'rec-err', payload: {} },
    ];

    const validator = () => {
      throw new Error('Crash in check');
    };

    const result = syncAndQuarantineBatch(records, validator);

    expect(result.validRecords).toHaveLength(0);
    expect(result.quarantinedRecords).toHaveLength(1);
    expect(result.quarantinedRecords[0].reason).toContain('Crash in check');
  });
});
