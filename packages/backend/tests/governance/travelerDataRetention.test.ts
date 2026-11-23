import { DataRetentionService } from '../../src/services/DataRetentionService';
import {
  DELETION_REQUEST_RETENTION_DAYS,
  DELETION_VERIFICATION_WINDOW_DAYS,
} from '../../src/services/DataRetentionService';
import {
  getTravelerDataPolicy,
  listTravelerDataCategories,
  TRAVELER_DATA_POLICIES,
} from '../../src/services/governance/travelerDataRetention';

describe('traveler data retention and deletion mapping (#1185)', () => {
  it('covers every in-scope traveler data category exactly once', () => {
    const categories = listTravelerDataCategories();

    expect(categories).toEqual([
      'account',
      'profile',
      'passenger',
      'travel_documents',
      'search_history',
      'booking',
      'refund',
      'notification',
      'consent',
      'deletion_request',
      'audit',
    ]);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('defines purpose, retention, erasure and legal exceptions for every policy', () => {
    for (const policy of TRAVELER_DATA_POLICIES) {
      expect(policy.storedFields.length).toBeGreaterThan(0);
      expect(policy.purpose.trim()).not.toBe('');
      expect(['contract', 'legitimate_interests', 'consent', 'legal_obligation']).toContain(policy.lawfulBasis);
      expect(policy.retention.active.trim()).not.toBe('');
      expect(policy.retention.source.trim()).not.toBe('');
      expect(policy.deletionBehavior.trim()).not.toBe('');
      expect(policy.legalExceptions.length).toBeGreaterThan(0);
    }
  });

  it('maps passenger PII to its purpose, encrypted fields and legal holds', () => {
    const policy = getTravelerDataPolicy('passenger');

    expect(policy.storedFields).toEqual(
      expect.arrayContaining(['email', 'firstName', 'lastName', 'phone', 'sorobanAddress']),
    );
    expect(policy.purpose).toMatch(/ticket/i);
    expect(policy.lawfulBasis).toBe('contract');
    expect(policy.deletionBehavior).toMatch(/wallet foreign key/i);
    expect(policy.legalExceptions).toEqual(expect.arrayContaining(['Refunds and chargebacks']));
  });

  it('maps deletion request retention windows to the enforced constants', () => {
    const policy = getTravelerDataPolicy('deletion_request');

    expect(policy.retention.active).toContain(`${DELETION_VERIFICATION_WINDOW_DAYS} day`);
    expect(policy.retention.archiveAfter).toContain(`${DELETION_REQUEST_RETENTION_DAYS} day`);
    expect(DELETION_VERIFICATION_WINDOW_DAYS + DELETION_REQUEST_RETENTION_DAYS).toBe(120);
  });

  it('documents the audit archive and deletion windows used by the retention job', () => {
    const policy = getTravelerDataPolicy('audit');
    const service = new DataRetentionService();

    expect(policy.retention.archiveAfter).toContain('2 years');
    expect(policy.retention.deleteAfter).toContain('7 years');
    expect(service.getPolicy('security')).toMatchObject({ archiveAfterYears: 2, retentionYears: 7 });
    expect(service.getPolicy('admin')).toMatchObject({ archiveAfterYears: 2, retentionYears: 7 });
    expect(service.getPolicy('approvals')).toMatchObject({ archiveAfterYears: 2, retentionYears: 7 });
  });

  it('exposes the same registry through DataRetentionService', () => {
    const service = new DataRetentionService();

    expect(service.getTravelerDataPolicies()).toBe(TRAVELER_DATA_POLICIES);
  });

  it('rejects an unknown category instead of returning a fallback policy', () => {
    expect(() => getTravelerDataPolicy('unknown' as any)).toThrow('Unknown traveler data category');
  });
});
