import {
  EscrowType,
  Flags,
  Roles,
  SingleReleaseMilestone,
  Trustline,
} from '@trustless-work/escrow';

interface CreatedAt {
  _seconds: number;
  _nanoseconds: number;
}

type UpdatedAt = CreatedAt;

export interface Escrow {
  signer?: string;
  contractId?: string;
  engagementId: string;
  title: string;
  roles: Roles;
  description: string;
  amount: number;
  platformFee: number;
  balance?: number;
  milestones: SingleReleaseMilestone[];
  flags?: Flags;
  trustline: Trustline & { name: string };
  receiverMemo?: number;
  disputeStartedBy?: string;
  fundedBy?: string;
  isActive?: boolean;
  approverFunds?: string;
  receiverFunds?: string;
  user: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  type: EscrowType;
}
