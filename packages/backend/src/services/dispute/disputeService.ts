import { randomUUID } from 'crypto';
import { Dispute, DisputeOutcome, DisputeStatus } from '../../db/entities/Dispute';


export interface EvidenceInput {
  description: string;
  fileUrl?: string;
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function validateEvidenceFile(fileUrl: string, submittedBy: string): EvidenceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate file URL format (IPFS or HTTPS)
  if (!fileUrl.startsWith('ipfs://') && !fileUrl.startsWith('https://')) {
    errors.push('File URL must be an IPFS URI (ipfs://) or HTTPS URL');
  }

  // Extract file extension/type from URL for validation
  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname.toLowerCase();
    const extension = pathname.split('.').pop() || '';

    // Check file type based on extension (as a proxy since we don't have MIME type from IPFS)
    const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt']);
    if (extension && !allowedExtensions.has(extension)) {
      errors.push(`File type .${extension} is not allowed. Allowed types: PDF, JPEG, PNG, GIF, WebP, TXT`);
    }
  } catch {
    // If URL parsing fails, we can't validate extension
    warnings.push('Could not validate file type from URL');
  }

  // Note: Actual file size validation would require fetching the file headers
  // For IPFS, this is not straightforward without a gateway. We log a warning
  // and recommend checking file size before upload.
  if (fileUrl.startsWith('ipfs://')) {
    warnings.push('File size cannot be validated for IPFS URLs. Ensure file is under 10MB before upload.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateEvidenceOwnership(
  submittedBy: string,
  dispute: Dispute,
): { valid: boolean; error?: string } {
  const isClaimant = submittedBy === dispute.claimantAddress;
  const isRespondent = submittedBy === dispute.respondentAddress;

  if (!isClaimant && !isRespondent) {
    return {
      valid: false,
      error: 'Only dispute participants (claimant or respondent) may submit evidence',
    };
  }

  return { valid: true };
}

export interface DisputeTimelineEvent {
  type: 'dispute_opened' | 'arbitrator_assigned' | 'evidence_submitted' | 'dispute_resolved' | 'dispute_appealed';
  at: string;
  actor: string;
  notes?: string;
}

export interface DisputeDTO {
  id: string;
  refundId: string;
  bookingId: string;
  claimantAddress: string;
  respondentAddress: string;
  arbitratorAddress: string | null;
  disputeType: string;
  description: string;
  desiredOutcome: string | null;
  status: DisputeStatus;
  outcome: DisputeOutcome;
  resolutionNotes: string | null;
  evidence: Array<{
    id: string;
    submittedBy: string;
    description: string;
    fileUrl: string | null;
    submittedAt: string;
  }>;
  timeline: DisputeTimelineEvent[];
  createdAt: string;
  updatedAt: string;
  deadlineAt: string | null;
}

function toIso(date: Date): string {
  return date.toISOString();
}

function parseArbitrators(): string[] {
  const configured = (process.env.DISPUTE_ARBITRATORS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DISPUTE_ARBITRATORS must be configured in production');
  }
  return ['platform-arbiter'];
}

function buildTimeline(dispute: Dispute): DisputeTimelineEvent[] {
  const timeline: DisputeTimelineEvent[] = [
    {
      type: 'dispute_opened',
      at: toIso(dispute.createdAt),
      actor: dispute.claimantAddress,
      notes: dispute.description,
    },
  ];

  if (dispute.arbitratorAddress) {
    timeline.push({
      type: 'arbitrator_assigned',
      at: toIso(dispute.createdAt),
      actor: dispute.arbitratorAddress,
    });
  }

  for (const item of dispute.evidenceItems || []) {
    timeline.push({
      type: 'evidence_submitted',
      at: toIso(item.submittedAt),
      actor: item.submittedBy,
      notes: item.description,
    });
  }

  if (dispute.status === 'resolved') {
    timeline.push({
      type: 'dispute_resolved',
      at: toIso(dispute.updatedAt),
      actor: dispute.arbitratorAddress || 'system',
      notes: dispute.outcome || undefined,
    });
  }

  if (dispute.status === 'appealed') {
    timeline.push({
      type: 'dispute_appealed',
      at: toIso(dispute.updatedAt),
      actor: dispute.claimantAddress,
      notes: dispute.resolutionNotes || undefined,
    });
  }

  timeline.sort((a, b) => a.at.localeCompare(b.at));
  return timeline;
}

function toDTO(dispute: Dispute): DisputeDTO {
  return {
    id: dispute.id,
    refundId: dispute.refund.id,
    bookingId: dispute.refund.booking.id,
    claimantAddress: dispute.claimantAddress,
    respondentAddress: dispute.respondentAddress,
    arbitratorAddress: dispute.arbitratorAddress || null,
    disputeType: dispute.disputeType,
    description: dispute.description,
    desiredOutcome: dispute.desiredOutcome || null,
    status: dispute.status,
    outcome: (dispute.outcome ?? null) as DisputeOutcome,
    resolutionNotes: dispute.resolutionNotes || null,
    evidence: (dispute.evidenceItems || []).map((item) => ({
      id: item.id,
      submittedBy: item.submittedBy,
      description: item.description,
      fileUrl: item.fileUrl || null,
      submittedAt: toIso(item.submittedAt),
    })),
    timeline: buildTimeline(dispute),
    createdAt: toIso(dispute.createdAt),
    updatedAt: toIso(dispute.updatedAt),
    deadlineAt: dispute.deadlineAt ? toIso(dispute.deadlineAt) : null,
  };
}
export interface DisputeEvidence {
  id: string;
  submittedBy: string;
  description: string;
  fileUrl: string | null;
  submittedAt: string;
}

export interface DisputeTimelineEvent {
  type: 'dispute_opened' | 'arbitrator_assigned' | 'evidence_submitted' | 'dispute_resolved' | 'dispute_appealed';
  at: string;
  actor: string;
  notes?: string;
}

export interface DisputeRecord {
  id: string;
  bookingId: string;
  refundId: string;
  claimantAddress: string;
  respondentAddress: string;
  arbitratorAddress: string | null;
  status: string;
  disputeType: string;
  description: string;
  desiredOutcome: string;
  evidence: DisputeEvidence[];
  timeline: DisputeTimelineEvent[];
  createdAt: string;
}

export class DisputeService {
  private disputes: Map<string, DisputeRecord> = new Map();

  async createDispute(params: {
    refundId: string;
    bookingId?: string;
    claimantAddress: string;
    disputeType: string;
    description: string;
    desiredOutcome: string;
    evidence?: Array<{ description: string; fileUrl?: string }>;
  }): Promise<DisputeRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const evList: DisputeEvidence[] = (params.evidence || []).map((e) => ({
      id: randomUUID(),
      submittedBy: params.claimantAddress,
      description: e.description,
      fileUrl: e.fileUrl || null,
      submittedAt: now,
    }));

    const record: DisputeRecord = {
      id,
      bookingId: params.bookingId || params.refundId,
      refundId: params.refundId,
      claimantAddress: params.claimantAddress,
      respondentAddress: '0x0000000000000000000000000000000000000000',
      arbitratorAddress: '0xArbitrator11111111111111111111111111111111',
      status: 'arbitrator_assigned',
      disputeType: params.disputeType,
      description: params.description,
      desiredOutcome: params.desiredOutcome,
      evidence: evList,
      timeline: [
        { type: 'dispute_opened', at: now, actor: params.claimantAddress, notes: 'Dispute created' },
        { type: 'arbitrator_assigned', at: now, actor: 'System', notes: 'Arbitrator assigned automatically' },
      ],
      createdAt: now,
    };

    this.disputes.set(id, record);
    return record;
  }

  async listDisputesByAddress(walletAddress: string): Promise<DisputeRecord[]> {
    const results: DisputeRecord[] = [];
    for (const d of this.disputes.values()) {
      if (
        d.claimantAddress === walletAddress ||
        d.respondentAddress === walletAddress ||
        d.arbitratorAddress === walletAddress
      ) {
        results.push(d);
      }
    }
    return results;
  }

  async getDispute(id: string): Promise<DisputeRecord | null> {
    return this.disputes.get(id) || null;
  }

  async submitEvidence(params: {
    disputeId: string;
    submittedBy: string;
    description: string;
    fileUrl?: string;
  }): Promise<DisputeRecord> {
    const dispute = this.disputes.get(params.disputeId);
    if (!dispute) throw new Error('Dispute not found');
    const now = new Date().toISOString();
    const newEv: DisputeEvidence = {
      id: randomUUID(),

    // Validate evidence ownership
    const ownershipValidation = validateEvidenceOwnership(params.submittedBy, dispute);
    if (!ownershipValidation.valid) {
      throw new BadRequestError(ownershipValidation.error!);
    }

    if (!['open', 'evidence_submission', 'under_review', 'appealed'].includes(dispute.status)) {
      throw new Error('Evidence can no longer be submitted for this dispute');
    }

    const validated = validateEvidenceInput({ description: params.description, fileUrl: params.fileUrl });

    const item = evidenceRepo.create({
      dispute,
      submittedBy: params.submittedBy,
      description: params.description,
      fileUrl: params.fileUrl || null,
      submittedAt: now,
    };
    dispute.evidence.push(newEv);
    dispute.timeline.push({
      type: 'evidence_submitted',
      at: now,
      actor: params.submittedBy,
      notes: params.description,
    });
    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  async resolveDispute(params: {
    disputeId: string;
    arbitratorAddress: string;
    outcome: string;
    notes?: string;
  }): Promise<DisputeRecord> {
    const dispute = this.disputes.get(params.disputeId);
    if (!dispute) throw new Error('Dispute not found');
    const now = new Date().toISOString();
    dispute.status = 'resolved';
    dispute.timeline.push({
      type: 'dispute_resolved',
      at: now,
      actor: params.arbitratorAddress,
      notes: `Outcome: ${params.outcome}. ${params.notes || ''}`,
    });
    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  async appealDispute(params: {
    disputeId: string;
    appellantAddress: string;
    reason: string;
  }): Promise<DisputeRecord> {
    const dispute = this.disputes.get(params.disputeId);
    if (!dispute) throw new Error('Dispute not found');
    const now = new Date().toISOString();
    dispute.status = 'appealed';
    dispute.timeline.push({
      type: 'dispute_appealed',
      at: now,
      actor: params.appellantAddress,
      notes: params.reason,
    });
    this.disputes.set(dispute.id, dispute);
    return dispute;
  }
}

export const disputeService = new DisputeService();
