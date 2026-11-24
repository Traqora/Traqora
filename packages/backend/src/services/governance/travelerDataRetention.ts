/**
 * Traveler data inventory for the v1 booking journey (issue #1185).
 *
 * This is the machine-readable counterpart of
 * `docs/privacy/TRAVELER_DATA_RETENTION.md`. It records where each category of
 * personal data is used, why it is kept, how long it is kept, what happens on
 * erasure, and which legal exceptions can override deletion. No new data
 * collection is introduced here.
 */

export type TravelerDataCategory =
  | 'account'
  | 'profile'
  | 'passenger'
  | 'travel_documents'
  | 'search_history'
  | 'booking'
  | 'refund'
  | 'notification'
  | 'consent'
  | 'deletion_request'
  | 'audit';

export type TravelerDataLawfulBasis =
  | 'contract'
  | 'legitimate_interests'
  | 'consent'
  | 'legal_obligation';

export interface TravelerDataRetentionPolicy {
  category: TravelerDataCategory;
  storedFields: readonly string[];
  purpose: string;
  lawfulBasis: TravelerDataLawfulBasis;
  retention: {
    active: string;
    archiveAfter: string | null;
    deleteAfter: string | null;
    source: string;
  };
  deletionBehavior: string;
  legalExceptions: readonly string[];
}

/**
 * Authoritative v1 mapping. Retention windows that are enforced in code point
 * to their implementation in `retention.source`. Categories without an
 * automated purge job say so explicitly rather than implying one exists.
 */
export const TRAVELER_DATA_POLICIES: readonly TravelerDataRetentionPolicy[] = [
  {
    category: 'account',
    storedFields: ['walletAddress', 'walletType', 'createdAt', 'lastLoginAt'],
    purpose: 'Authenticate the traveler and maintain the wallet-based account.',
    lawfulBasis: 'contract',
    retention: {
      active: 'For the lifetime of the account.',
      archiveAfter: null,
      deleteAfter: 'After a verified deletion request is executed.',
      source: 'src/api/routes/users.ts, src/services/DataRetentionService.ts',
    },
    deletionBehavior:
      'Included in the data export. Erasure follows the verified deletion request workflow.',
    legalExceptions: ['Security audit records', 'Fraud investigation', 'Legal claims'],
  },
  {
    category: 'profile',
    storedFields: ['displayName', 'bio', 'avatarUrl', 'travelPreferences', 'emailEnabled', 'smsEnabled', 'pushEnabled'],
    purpose: 'Personalize the traveler experience and control notification channels.',
    lawfulBasis: 'consent',
    retention: {
      active: 'Until the traveler updates the profile or the account is erased.',
      archiveAfter: null,
      deleteAfter: 'With the account after a verified deletion request is executed.',
      source: 'src/api/routes/users.ts, src/db/entities/UserProfile.ts, src/db/entities/UserPreference.ts',
    },
    deletionBehavior: 'Removed with the account record. Notification preferences stop future messages immediately.',
    legalExceptions: ['Consent evidence records', 'Legal claims'],
  },
  {
    category: 'passenger',
    storedFields: ['email', 'firstName', 'lastName', 'phone', 'sorobanAddress'],
    purpose: 'Issue and manage tickets, contact the traveler, and link the booking to a wallet.',
    lawfulBasis: 'contract',
    retention: {
      active: 'For the booking lifecycle and any related refund or dispute window.',
      archiveAfter: null,
      deleteAfter: 'After verified erasure, subject to active booking and legal holds.',
      source: 'src/db/entities/Passenger.ts, src/api/routes/users.ts',
    },
    deletionBehavior:
      'Not included in the wallet data export in v1 because passenger rows have no wallet foreign key. Erasure is performed by the verified deletion request workflow and matched by passenger.sorobanAddress.',
    legalExceptions: ['Active or recent bookings', 'Refunds and chargebacks', 'Fraud investigation', 'Legal claims'],
  },
  {
    category: 'travel_documents',
    storedFields: [
      'documentType',
      'documentNumber',
      'fullName',
      'issuingCountry',
      'nationality',
      'dateOfBirth',
      'expiryDate',
      'verificationStatus',
    ],
    purpose: 'Verify traveler identity and support travel-document requirements.',
    lawfulBasis: 'legal_obligation',
    retention: {
      active: 'Until the traveler deletes the document or the account is erased.',
      archiveAfter: null,
      deleteAfter: 'Encrypted fields are scrubbed by the documented erasure job after soft deletion.',
      source: 'src/db/entities/TravelDocument.ts, src/services/document-management.ts',
    },
    deletionBehavior:
      'deleteDocument() sets isDeleted and deletedAt immediately, and non-deleted reads exclude the record. The encrypted field purge is an operational follow-up in v1.',
    legalExceptions: ['Identity verification disputes', 'Regulatory KYC checks', 'Legal claims'],
  },
  {
    category: 'search_history',
    storedFields: ['fromAirport', 'toAirport', 'departureDate', 'passengers', 'cabinClass', 'createdAt'],
    purpose: 'Let the traveler revisit and clear recent searches and saved searches.',
    lawfulBasis: 'legitimate_interests',
    retention: {
      active: 'Until the traveler removes an entry or clears the stored searches.',
      archiveAfter: null,
      deleteAfter: 'Immediately on entry deletion or history clear.',
      source: 'src/services/searchMemoryService.ts, src/api/routes/flights.ts',
    },
    deletionBehavior: 'deleteSearchHistoryEntry(), clearSearchHistory(), and clearSavedSearches() remove wallet-scoped rows.',
    legalExceptions: ['Security investigation records derived from the search'],
  },
  {
    category: 'booking',
    storedFields: ['id', 'status', 'amountCents', 'idempotencyKey', 'stripePaymentIntentId', 'sorobanTxHash'],
    purpose: 'Fulfill the flight booking, process payment, and provide itinerary support.',
    lawfulBasis: 'contract',
    retention: {
      active: 'For the booking lifecycle.',
      archiveAfter: 'Audit copies move to cold storage after 2 years.',
      deleteAfter: 'Audit copies are deleted after 7 years.',
      source: 'src/db/entities/Booking.ts, src/services/DataRetentionService.ts',
    },
    deletionBehavior:
      'The booking record is retained while active or under a financial hold. Personal fields are erased through the verified deletion workflow where lawful; public chain hashes cannot be erased.',
    legalExceptions: ['Payment and tax records', 'Refunds and chargebacks', 'Fraud investigation', 'On-chain immutability'],
  },
  {
    category: 'refund',
    storedFields: ['id', 'bookingId', 'status', 'reason', 'reasonDetails', 'approvedAmountCents', 'stripeRefundId', 'sorobanTxHash'],
    purpose: 'Process refund requests, record review decisions, and support disputes.',
    lawfulBasis: 'contract',
    retention: {
      active: 'While the refund is open.',
      archiveAfter: 'Audit copies move to cold storage after 2 years.',
      deleteAfter: 'Audit copies are deleted after 7 years.',
      source: 'src/api/routes/refunds.ts, src/services/DataRetentionService.ts',
    },
    deletionBehavior:
      'Personal details in free-text reason fields are excluded or minimized during erasure where lawful. Financial identifiers are retained under the audit exception.',
    legalExceptions: ['Payment and tax records', 'Chargebacks', 'Fraud investigation', 'Legal claims'],
  },
  {
    category: 'notification',
    storedFields: ['recipient', 'channel', 'template', 'deliveryStatus', 'createdAt'],
    purpose: 'Deliver booking, payment, refund, and security notifications.',
    lawfulBasis: 'contract',
    retention: {
      active: 'Until delivery is recorded.',
      archiveAfter: 'Audit copies move to cold storage after 2 years.',
      deleteAfter: 'Audit copies are deleted after 7 years.',
      source: 'src/services/NotificationService.ts, src/services/DataRetentionService.ts',
    },
    deletionBehavior: 'Notification preferences stop future messages. Historical delivery logs follow the audit retention policy.',
    legalExceptions: ['Security notifications', 'Fraud investigation', 'Legal claims'],
  },
  {
    category: 'consent',
    storedFields: ['consentType', 'status', 'consentDetails', 'ipAddress', 'userAgent', 'withdrawnAt'],
    purpose: 'Record consent grants and withdrawals as evidence of lawful processing.',
    lawfulBasis: 'legal_obligation',
    retention: {
      active: 'For the lifetime of the consent.',
      archiveAfter: 'Audit copies move to cold storage after 2 years.',
      deleteAfter: 'Audit copies are deleted after 7 years.',
      source: 'src/db/entities/ConsentRecord.ts, src/services/governance/consentService.ts',
    },
    deletionBehavior: 'Withdrawal updates the record instead of deleting it, so the evidence of withdrawal remains available.',
    legalExceptions: ['Proof of consent', 'Legal claims'],
  },
  {
    category: 'deletion_request',
    storedFields: ['userId', 'status', 'reason', 'requestedAt'],
    purpose: 'Administer and evidence right-to-erasure requests.',
    lawfulBasis: 'legal_obligation',
    retention: {
      active: '30 day identity verification window.',
      archiveAfter: '90 day audit window after completion or cancellation.',
      deleteAfter: 'At most 120 days after the request.',
      source: 'src/services/DataRetentionService.ts (DELETION_VERIFICATION_WINDOW_DAYS, DELETION_REQUEST_RETENTION_DAYS)',
    },
    deletionBehavior:
      'processDeletionRequests() marks verified pending requests completed after 30 days and removes the request row after the full 120 day window.',
    legalExceptions: ['Open legal dispute', 'Regulatory hold'],
  },
  {
    category: 'audit',
    storedFields: ['actor', 'action', 'resource', 'resourceId', 'createdAt'],
    purpose: 'Detect abuse, record privileged actions, and support incident investigation.',
    lawfulBasis: 'legitimate_interests',
    retention: {
      active: '2 years in active storage.',
      archiveAfter: 'After 2 years.',
      deleteAfter: 'After 7 years.',
      source: 'src/services/DataRetentionService.ts (security, admin, approvals policies)',
    },
    deletionBehavior: 'DataRetentionService archives expired log types and later removes them. Logged PII is minimized by redaction.',
    legalExceptions: ['Security investigations', 'Regulatory audits', 'Legal claims'],
  },
];

export function getTravelerDataPolicy(category: TravelerDataCategory): TravelerDataRetentionPolicy {
  const policy = TRAVELER_DATA_POLICIES.find((entry) => entry.category === category);
  if (!policy) {
    throw new Error(`Unknown traveler data category: ${category}`);
  }
  return policy;
}

export function listTravelerDataCategories(): TravelerDataCategory[] {
  return TRAVELER_DATA_POLICIES.map((policy) => policy.category);
}
