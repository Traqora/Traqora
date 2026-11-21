import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

// Mock governance data
const mockProposals = [
  {
    id: 1,
    proposer: 'GBXYZ...ADMIN1',
    title: 'Reduce Platform Fee to 0%',
    description: 'Proposal to eliminate all platform fees for the first year to drive adoption and onboard more airlines and travelers to the Traqora ecosystem.',
    proposalType: 'fee_change',
    votingStart: '2026-02-01T00:00:00Z',
    votingEnd: '2026-02-15T00:00:00Z',
    yesVotes: 12500,
    noVotes: 3200,
    status: 'active',
    executed: false,
    quorum: 10000,
    totalVoters: 47,
  },
  {
    id: 2,
    proposer: 'GBXYZ...ADMIN2',
    title: 'Add Multi-City Booking Support',
    description: 'Enable users to book multi-city itineraries in a single transaction, with smart contract support for linked bookings and combined refund logic.',
    proposalType: 'feature',
    votingStart: '2026-01-20T00:00:00Z',
    votingEnd: '2026-02-03T00:00:00Z',
    yesVotes: 18700,
    noVotes: 1100,
    status: 'passed',
    executed: true,
    quorum: 10000,
    totalVoters: 82,
  },
  {
    id: 3,
    proposer: 'GBXYZ...ADMIN1',
    title: 'Upgrade Soroban Contract to v2',
    description: 'Migrate all smart contracts to Soroban SDK v22 for improved performance, lower gas costs, and access to new storage primitives.',
    proposalType: 'upgrade',
    votingStart: '2026-01-10T00:00:00Z',
    votingEnd: '2026-01-24T00:00:00Z',
    yesVotes: 5200,
    noVotes: 8900,
    status: 'rejected',
    executed: false,
    quorum: 10000,
    totalVoters: 63,
  },
  {
    id: 4,
    proposer: 'GBXYZ...USER3',
    title: 'Increase Loyalty Rewards by 20%',
    description: 'Boost TRQ token rewards for all bookings by 20% to incentivize platform usage and reward loyal travelers.',
    proposalType: 'feature',
    votingStart: '2026-02-10T00:00:00Z',
    votingEnd: '2026-02-24T00:00:00Z',
    yesVotes: 7800,
    noVotes: 2100,
    status: 'active',
    executed: false,
    quorum: 10000,
    totalVoters: 35,
  },
  {
    id: 5,
    proposer: 'GBXYZ...ADMIN2',
    title: 'Partner with Regional Airlines',
    description: 'Allocate 50,000 TRQ from the treasury to fund onboarding partnerships with 10 regional airlines across Southeast Asia and Africa.',
    proposalType: 'feature',
    votingStart: '2026-02-15T00:00:00Z',
    votingEnd: '2026-03-01T00:00:00Z',
    yesVotes: 950,
    noVotes: 200,
    status: 'active',
    executed: false,
    quorum: 10000,
    totalVoters: 12,
  },
];

const mockVotes = [
  { voter: 'GBXYZ...USER1', proposalId: 1, support: true, votingPower: 850, timestamp: '2026-02-02T10:30:00Z' },
  { voter: 'GBXYZ...USER2', proposalId: 1, support: false, votingPower: 1200, timestamp: '2026-02-03T14:15:00Z' },
  { voter: 'GBXYZ...USER3', proposalId: 1, support: true, votingPower: 500, timestamp: '2026-02-04T09:00:00Z' },
  { voter: 'GBXYZ...USER1', proposalId: 2, support: true, votingPower: 850, timestamp: '2026-01-21T11:00:00Z' },
  { voter: 'GBXYZ...USER2', proposalId: 2, support: true, votingPower: 1200, timestamp: '2026-01-22T16:30:00Z' },
  { voter: 'GBXYZ...USER3', proposalId: 3, support: false, votingPower: 500, timestamp: '2026-01-12T08:45:00Z' },
  { voter: 'GBXYZ...USER1', proposalId: 4, support: true, votingPower: 850, timestamp: '2026-02-11T13:20:00Z' },
];

const mockDelegations = [
  { delegator: 'GBXYZ...USER4', delegate: 'GBXYZ...USER1', amount: 300, timestamp: '2026-01-15T10:00:00Z' },
  { delegator: 'GBXYZ...USER5', delegate: 'GBXYZ...USER2', amount: 500, timestamp: '2026-01-20T14:30:00Z' },
];

// GET /api/v1/governance/proposals - List all proposals
router.get('/proposals', asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;

  let filtered = mockProposals;
  if (status && typeof status === 'string') {
    filtered = mockProposals.filter(p => p.status === status);
  }

return res.json({
    success: true,
    data: filtered,
    total: filtered.length,
  });
}));

// GET /api/v1/governance/proposals/:id - Get proposal detail
router.get('/proposals/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const proposal = mockProposals.find(p => p.id === id);

  if (!proposal) {
    return res.status(404).json({
      success: false,
      error: { message: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND' },
    });
  }

return res.json({
    success: true,
    data: proposal,
  });
}));

// POST /api/v1/governance/proposals - Create a new proposal (admin)
router.post('/proposals', asyncHandler(async (req: Request, res: Response) => {
  const { proposer, title, description, proposalType, votingPeriodDays } = req.body;

  if (!proposer || !title || !description || !proposalType || !votingPeriodDays) {
    return res.status(400).json({
      success: false,
      error: { message: 'Missing required fields', code: 'VALIDATION_ERROR' },
    });
  }

  const now = new Date();
  const votingEnd = new Date(now.getTime() + votingPeriodDays * 24 * 60 * 60 * 1000);

  const newProposal = {
    id: mockProposals.length + 1,
    proposer,
    title,
    description,
    proposalType,
    votingStart: now.toISOString(),
    votingEnd: votingEnd.toISOString(),
    yesVotes: 0,
    noVotes: 0,
    status: 'active',
    executed: false,
    quorum: 10000,
    totalVoters: 0,
  };

return res.status(201).json({
    success: true,
    data: newProposal,
    message: 'Proposal created successfully',
  });
}));

// POST /api/v1/governance/proposals/:id/vote - Cast a vote
router.post('/proposals/:id/vote', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { voter, support, votingPower } = req.body;

  const proposal = mockProposals.find(p => p.id === id);
  if (!proposal) {
    return res.status(404).json({
      success: false,
      error: { message: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND' },
    });
  }

  if (proposal.status !== 'active') {
    return res.status(400).json({
      success: false,
      error: { message: 'Proposal is not active', code: 'PROPOSAL_NOT_ACTIVE' },
    });
  }

  const existingVote = mockVotes.find(v => v.voter === voter && v.proposalId === id);
  if (existingVote) {
    return res.status(400).json({
      success: false,
      error: { message: 'Already voted on this proposal', code: 'ALREADY_VOTED' },
    });
  }

  const vote = {
    voter,
    proposalId: id,
    support,
    votingPower,
    timestamp: new Date().toISOString(),
  };

return res.status(201).json({
    success: true,
    data: vote,
    message: 'Vote cast successfully',
  });
}));

// GET /api/v1/governance/proposals/:id/votes - Get voting history for a proposal
router.get('/proposals/:id/votes', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const votes = mockVotes.filter(v => v.proposalId === id);

  res.json({
    success: true,
    data: votes,
    total: votes.length,
  });
}));

// POST /api/v1/governance/delegate - Delegate voting power
router.post('/delegate', asyncHandler(async (req: Request, res: Response) => {
  const { delegator, delegate, amount } = req.body;

  if (!delegator || !delegate || !amount) {
    return res.status(400).json({
      success: false,
      error: { message: 'Missing required fields', code: 'VALIDATION_ERROR' },
    });
  }

  if (delegator === delegate) {
    return res.status(400).json({
      success: false,
      error: { message: 'Cannot delegate to self', code: 'SELF_DELEGATION' },
    });
  }

  const delegation = {
    delegator,
    delegate,
    amount,
    timestamp: new Date().toISOString(),
  };

return res.status(201).json({
    success: true,
    data: delegation,
    message: 'Voting power delegated successfully',
  });
}));

// DELETE /api/v1/governance/delegate - Revoke delegation
router.delete('/delegate', asyncHandler(async (req: Request, res: Response) => {
  const { delegator } = req.body;

  if (!delegator) {
    return res.status(400).json({
      success: false,
      error: { message: 'Missing delegator address', code: 'VALIDATION_ERROR' },
    });
  }

return res.json({
    success: true,
    message: 'Delegation revoked successfully',
  });
}));

// GET /api/v1/governance/voting-power/:address - Get voting power for an address
router.get('/voting-power/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  // Mock voting power calculation
  const baseBalance = 850;
  const delegatedToUser = mockDelegations
    .filter(d => d.delegate === address)
    .reduce((sum, d) => sum + d.amount, 0);
  const delegatedAway = mockDelegations
    .filter(d => d.delegator === address)
    .reduce((sum, d) => sum + d.amount, 0);

  res.json({
    success: true,
    data: {
      address,
      baseBalance,
      delegatedToUser,
      delegatedAway,
      totalVotingPower: baseBalance + delegatedToUser - delegatedAway,
    },
  });
}));

// GET /api/v1/governance/delegations/:address - Get delegations for an address
router.get('/delegations/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  const delegatedBy = mockDelegations.filter(d => d.delegator === address);
  const delegatedTo = mockDelegations.filter(d => d.delegate === address);

  res.json({
    success: true,
    data: {
      delegatedBy,
      delegatedTo,
    },
  });
}));

// GET /api/v1/governance/votes/:address - Get all votes by an address
router.get('/votes/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const userVotes = mockVotes.filter(v => v.voter === address);

  // Enrich with proposal info
  const enrichedVotes = userVotes.map(vote => {
    const proposal = mockProposals.find(p => p.id === vote.proposalId);
    return {
      ...vote,
      proposalTitle: proposal?.title || 'Unknown',
      proposalStatus: proposal?.status || 'unknown',
    };
  });

  res.json({
    success: true,
    data: enrichedVotes,
    total: enrichedVotes.length,
  });
}));

export const governanceRoutes = router;
