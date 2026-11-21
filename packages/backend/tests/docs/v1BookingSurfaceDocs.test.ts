/**
 * Documentation contract for the v1 booking surface (issues #1145, #1146 and #1148).
 * Uses the shared doc helper so link and content checks stay DRY.
 */

import {
  CANCELLATION_ELIGIBILITY_RULES,
  CANCELLATION_REASON_CODES,
} from '../../src/services/cancellationEligibility';
import {
  missingLocalLinkTargets,
  missingText,
  readRepoFile,
} from './_helpers';

const README = 'README.md';
const CLIENT_DOC = 'packages/client/docs/V1_BOOKING_DETAIL_CONTRACT.md';
const BACKEND_DOC = 'packages/backend/docs/CANCELLATION_ELIGIBILITY.md';
const LIFECYCLE_DOC = 'packages/backend/docs/booking-lifecycle-contract.md';

describe('v1 booking surface documentation (issues #1145, #1146 and #1148)', () => {
  it.each([README, CLIENT_DOC, BACKEND_DOC, LIFECYCLE_DOC])(
    'resolves every local link in %s',
    (doc) => {
      expect(missingLocalLinkTargets(doc)).toEqual([]);
    },
  );

  it('documents all five booking detail states and both detail deliverables', () => {
    const doc = readRepoFile(CLIENT_DOC);
    const required = [
      'One state at a time',
      'Supplier schedule changes',
      'missing',
      'unauthorized',
      'pending',
      'unavailable',
      'ready',
      'resolveBookingDetailState',
      'BOOKING_DETAIL_STATE_COPY',
      'normalizeScheduleChanges',
      'verifiedBy',
      'provider',
      'No new endpoint',
      'does not introduce a new page or a new public API',
    ];

    expect(missingText(doc, required)).toEqual([]);
  });

  it('documents every cancellation rule id and stable reason code', () => {
    const doc = readRepoFile(BACKEND_DOC);
    const required = [
      'Decision matrix',
      'Stable reason codes',
      'evaluateCancellationEligibility',
      'No new endpoint',
      ...CANCELLATION_ELIGIBILITY_RULES.map((rule) => rule.id),
      ...Object.values(CANCELLATION_REASON_CODES),
    ];

    expect(missingText(doc, required)).toEqual([]);
  });

  it('links both v1 contract docs from the repository README', () => {
    const readme = readRepoFile(README);
    expect(missingText(readme, [CLIENT_DOC, BACKEND_DOC])).toEqual([]);
  });

  it('cross-links the eligibility matrix from the booking lifecycle contract', () => {
    const lifecycle = readRepoFile(LIFECYCLE_DOC);
    expect(missingText(lifecycle, ['CANCELLATION_ELIGIBILITY.md'])).toEqual([]);
  });

  it('keeps the two v1 docs cross-linked in both directions', () => {
    const clientDoc = readRepoFile(CLIENT_DOC);
    const backendDoc = readRepoFile(BACKEND_DOC);

    expect(missingText(clientDoc, ['../../backend/docs/CANCELLATION_ELIGIBILITY.md'])).toEqual([]);
    expect(missingText(backendDoc, ['../../client/docs/V1_BOOKING_DETAIL_CONTRACT.md'])).toEqual([]);
  });
});
