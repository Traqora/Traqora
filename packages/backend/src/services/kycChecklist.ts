import type { DocumentVerificationStatus } from '../db/entities/TravelDocument';

export type KycChecklistStatus = 'not_started' | 'pending' | 'verified' | 'rejected';

export interface KycChecklist {
  status: KycChecklistStatus;
  items: {
    identityDocument: boolean;
    identityVerified: boolean;
  };
}

/**
 * Produces the mobile-profile KYC summary without exposing document data.
 * A rejected document takes precedence so the client can direct the traveler
 * to replace it; otherwise any submitted document is pending until verified.
 */
export const buildKycChecklist = (
  documentStatuses: DocumentVerificationStatus[],
): KycChecklist => {
  const identityDocument = documentStatuses.length > 0;
  const identityVerified = documentStatuses.includes('verified');

  if (identityVerified) {
    return { status: 'verified', items: { identityDocument, identityVerified } };
  }

  if (documentStatuses.includes('rejected')) {
    return { status: 'rejected', items: { identityDocument, identityVerified } };
  }

  return {
    status: identityDocument ? 'pending' : 'not_started',
    items: { identityDocument, identityVerified },
  };
};
