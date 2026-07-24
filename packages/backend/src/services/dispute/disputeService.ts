import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import { logger } from '../../utils/logger';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'awaiting_evidence'
  | 'voting'
  | 'resolved'
  | 'appealed'
  | 'closed';

export type DisputeOutcome = 'claimant_wins' | 'respondent_wins' | 'partial' | null;

export interface EvidenceItem {
  id: string;
  submittedBy: string;
  description: string;
  fileUrl?: string;
  submittedAt: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  claimantAddress: string;
  respondentAddress: string;
  description: string;
  status: DisputeStatus;
  outcome: DisputeOutcome;
  evidence: EvidenceItem[];
  arbitratorAddress: string | null;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string | null;
}

// In-memory store — replace with a TypeORM entity + migration in production.
const disputes = new Map<string, Dispute>();

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

export class DisputeService {
  async createDispute(params: {
    bookingId: string;
    claimantAddress: string;
    description: string;
  }): Promise<Dispute> {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({
      where: { id: params.bookingId },
      relations: ['passenger'],
    });

    if (!booking) throw new Error('Booking not found');

    // Derive respondent from booking (the airline side)
    const respondentAddress =
      booking.passenger?.sorobanAddress && booking.passenger.sorobanAddress !== params.claimantAddress
        ? booking.passenger.sorobanAddress
        : 'platform';

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14); // 14-day evidence window

    const dispute: Dispute = {
      id: uuid(),
      bookingId: params.bookingId,
      claimantAddress: params.claimantAddress,
      respondentAddress,
      description: params.description,
      status: 'open',
      outcome: null,
      evidence: [],
      arbitratorAddress: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deadlineAt: deadline.toISOString(),
    };

    disputes.set(dispute.id, dispute);
    logger.info('Dispute created', { disputeId: dispute.id, bookingId: params.bookingId });
    return dispute;
  }

  async getDispute(disputeId: string): Promise<Dispute | null> {
    return disputes.get(disputeId) ?? null;
  }

  async listDisputesByAddress(walletAddress: string): Promise<Dispute[]> {
    return Array.from(disputes.values()).filter(
      (d) => d.claimantAddress === walletAddress || d.respondentAddress === walletAddress,
    );
  }

  async submitEvidence(params: {
    disputeId: string;
    submittedBy: string;
    description: string;
    fileUrl?: string;
  }): Promise<Dispute> {
    const dispute = disputes.get(params.disputeId);
    if (!dispute) throw new Error('Dispute not found');

    if (!['open', 'under_review', 'awaiting_evidence'].includes(dispute.status)) {
      throw new Error('Evidence can only be submitted while the dispute is open or under review');
    }

    const item: EvidenceItem = {
      id: uuid(),
      submittedBy: params.submittedBy,
      description: params.description,
      fileUrl: params.fileUrl,
      submittedAt: nowIso(),
    };

    dispute.evidence.push(item);
    dispute.status = 'awaiting_evidence';
    dispute.updatedAt = nowIso();

    disputes.set(dispute.id, dispute);
    logger.info('Evidence submitted', { disputeId: dispute.id, evidenceId: item.id });
    return dispute;
  }

  async assignArbitrator(disputeId: string, arbitratorAddress: string): Promise<Dispute> {
    const dispute = disputes.get(disputeId);
    if (!dispute) throw new Error('Dispute not found');

    dispute.arbitratorAddress = arbitratorAddress;
    dispute.status = 'under_review';
    dispute.updatedAt = nowIso();

    disputes.set(dispute.id, dispute);
    logger.info('Arbitrator assigned', { disputeId, arbitratorAddress });
    return dispute;
  }

  async resolveDispute(params: {
    disputeId: string;
    arbitratorAddress: string;
    outcome: NonNullable<DisputeOutcome>;
    notes?: string;
  }): Promise<Dispute> {
    const dispute = disputes.get(params.disputeId);
    if (!dispute) throw new Error('Dispute not found');

    if (dispute.arbitratorAddress !== params.arbitratorAddress) {
      throw new Error('Only the assigned arbitrator may resolve this dispute');
    }

    dispute.outcome = params.outcome;
    dispute.status = 'resolved';
    dispute.updatedAt = nowIso();

    disputes.set(dispute.id, dispute);
    logger.info('Dispute resolved', { disputeId: dispute.id, outcome: params.outcome });
    return dispute;
  }
}

export const disputeService = new DisputeService();
