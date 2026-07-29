import { randomUUID } from 'crypto';
import { AppDataSource } from '../../db/dataSource';
import { Dispute, DisputeOutcome, DisputeStatus } from '../../db/entities/Dispute';
import { DisputeEvidence } from '../../db/entities/DisputeEvidence';
import { Refund } from '../../db/entities/Refund';
import { logger } from '../../utils/logger';

export interface EvidenceInput {
  description: string;
  fileUrl?: string;
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

function normalizeIpfsUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;

  const cidPattern = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[1-9A-HJ-NP-Za-km-z]{20,})$/;
  if (cidPattern.test(value)) {
    return `ipfs://${value}`;
  }

  if (/^ipfs:\/\/[a-zA-Z0-9]+(?:\/.*)?$/.test(value)) {
    return value;
  }

  if (/^https?:\/\//.test(value)) {
    if (value.includes('/ipfs/')) {
      return value;
    }
    throw new Error('Evidence URL must be an IPFS CID, ipfs:// URI, or an IPFS gateway URL');
  }

  throw new Error('Invalid evidence URI format');
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

export class DisputeService {
  private selectArbitrator(disputeId: string): string {
    const arbiters = parseArbitrators();
    const score = disputeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return arbiters[score % arbiters.length];
  }

  async createDispute(params: {
    refundId: string;
    claimantAddress: string;
    disputeType: string;
    description: string;
    desiredOutcome?: string;
    evidence?: EvidenceInput[];
  }): Promise<DisputeDTO> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const disputeRepo = AppDataSource.getRepository(Dispute);

    const refund = await refundRepo.findOne({
      where: { id: params.refundId },
      relations: ['booking', 'booking.flight', 'booking.passenger'],
    });

    if (!refund) throw new Error('Refund not found');

    const passengerWallet = refund.booking.passenger?.sorobanAddress;
    if (passengerWallet && passengerWallet !== params.claimantAddress) {
      throw new Error('Only the booking passenger may create a dispute');
    }

    const existingOpen = await disputeRepo.findOne({
      where: {
        refund: { id: params.refundId },
      },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
      order: { createdAt: 'DESC' },
    });

    if (existingOpen && !['resolved', 'closed'].includes(existingOpen.status)) {
      throw new Error('An active dispute already exists for this refund');
    }

    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 14);

    const dispute = disputeRepo.create({
      refund,
      claimantAddress: params.claimantAddress,
      respondentAddress: refund.booking.flight.airlineSorobanAddress || 'platform',
      arbitratorAddress: this.selectArbitrator(randomUUID()),
      disputeType: params.disputeType,
      description: params.description,
      desiredOutcome: params.desiredOutcome,
      status: 'evidence_submission',
      outcome: null,
      deadlineAt,
    });

    const savedDispute = await disputeRepo.save(dispute);

    if (params.evidence?.length) {
      const evidenceRepo = AppDataSource.getRepository(DisputeEvidence);
      const evidenceRows = params.evidence.map((item) =>
        evidenceRepo.create({
          dispute: savedDispute,
          submittedBy: params.claimantAddress,
          description: item.description,
          fileUrl: normalizeIpfsUrl(item.fileUrl),
        }),
      );
      await evidenceRepo.save(evidenceRows);
    }

    const populated = await disputeRepo.findOne({
      where: { id: savedDispute.id },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
    });

    if (!populated) {
      throw new Error('Failed to load created dispute');
    }

    logger.info('Dispute created', {
      disputeId: populated.id,
      refundId: params.refundId,
      arbitrator: populated.arbitratorAddress,
    });

    return toDTO(populated);
  }

  async getDispute(disputeId: string): Promise<DisputeDTO | null> {
    const disputeRepo = AppDataSource.getRepository(Dispute);
    const dispute = await disputeRepo.findOne({
      where: { id: disputeId },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
    });
    return dispute ? toDTO(dispute) : null;
  }

  async listDisputesByAddress(walletAddress: string): Promise<DisputeDTO[]> {
    const disputeRepo = AppDataSource.getRepository(Dispute);
    const disputes = await disputeRepo
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.refund', 'refund')
      .leftJoinAndSelect('refund.booking', 'booking')
      .leftJoinAndSelect('dispute.evidenceItems', 'evidence')
      .where('dispute.claimantAddress = :walletAddress', { walletAddress })
      .orWhere('dispute.respondentAddress = :walletAddress', { walletAddress })
      .orWhere('dispute.arbitratorAddress = :walletAddress', { walletAddress })
      .orderBy('dispute.createdAt', 'DESC')
      .getMany();

    return disputes.map(toDTO);
  }

  async submitEvidence(params: {
    disputeId: string;
    submittedBy: string;
    description: string;
    fileUrl?: string;
  }): Promise<DisputeDTO> {
    const disputeRepo = AppDataSource.getRepository(Dispute);
    const evidenceRepo = AppDataSource.getRepository(DisputeEvidence);

    const dispute = await disputeRepo.findOne({
      where: { id: params.disputeId },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
    });

    if (!dispute) throw new Error('Dispute not found');

    const canSubmit =
      params.submittedBy === dispute.claimantAddress || params.submittedBy === dispute.respondentAddress;

    if (!canSubmit) {
      throw new Error('Only dispute participants may submit evidence');
    }

    if (!['open', 'evidence_submission', 'under_review', 'appealed'].includes(dispute.status)) {
      throw new Error('Evidence can no longer be submitted for this dispute');
    }

    const item = evidenceRepo.create({
      dispute,
      submittedBy: params.submittedBy,
      description: params.description,
      fileUrl: normalizeIpfsUrl(params.fileUrl),
    });

    await evidenceRepo.save(item);

    if (dispute.status !== 'under_review') {
      dispute.status = 'under_review';
      await disputeRepo.save(dispute);
    }

    const updated = await disputeRepo.findOne({
      where: { id: params.disputeId },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
    });

    if (!updated) throw new Error('Dispute not found after evidence submission');

    logger.info('Evidence submitted', { disputeId: params.disputeId, evidenceId: item.id });
    return toDTO(updated);
  }

  async resolveDispute(params: {
    disputeId: string;
    arbitratorAddress: string;
    outcome: NonNullable<DisputeOutcome>;
    notes?: string;
  }): Promise<DisputeDTO> {
    const disputeRepo = AppDataSource.getRepository(Dispute);
    const dispute = await disputeRepo.findOne({
      where: { id: params.disputeId },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
    });

    if (!dispute) throw new Error('Dispute not found');

    if (dispute.arbitratorAddress !== params.arbitratorAddress) {
      throw new Error('Only the assigned arbitrator may resolve this dispute');
    }

    if (['resolved', 'closed'].includes(dispute.status)) {
      throw new Error('Dispute is already finalized');
    }

    dispute.outcome = params.outcome;
    dispute.status = 'resolved';
    dispute.resolutionNotes = params.notes || null;
    await disputeRepo.save(dispute);

    logger.info('Dispute resolved', {
      disputeId: dispute.id,
      outcome: params.outcome,
      arbitrator: params.arbitratorAddress,
    });

    return toDTO(dispute);
  }

  async appealDispute(params: {
    disputeId: string;
    appellantAddress: string;
    reason: string;
  }): Promise<DisputeDTO> {
    const disputeRepo = AppDataSource.getRepository(Dispute);
    const dispute = await disputeRepo.findOne({
      where: { id: params.disputeId },
      relations: ['refund', 'refund.booking', 'evidenceItems'],
    });

    if (!dispute) throw new Error('Dispute not found');
    if (dispute.claimantAddress !== params.appellantAddress) {
      throw new Error('Only the claimant may file an appeal');
    }
    if (dispute.status !== 'resolved') {
      throw new Error('Only resolved disputes can be appealed');
    }

    dispute.status = 'appealed';
    dispute.resolutionNotes = params.reason;
    await disputeRepo.save(dispute);

    logger.info('Dispute appealed', { disputeId: dispute.id, appellant: params.appellantAddress });
    return toDTO(dispute);
  }
}

export const disputeService = new DisputeService();
