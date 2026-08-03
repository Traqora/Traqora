import { AppDataSource } from '../../src/db/dataSource';
import { Dispute } from '../../src/db/entities/Dispute';
import { DisputeEvidence } from '../../src/db/entities/DisputeEvidence';
import { Refund } from '../../src/db/entities/Refund';
import { disputeService } from '../../src/services/dispute/disputeService';

describe('DisputeService', () => {
  const claimantAddress = 'GCLAIMANTWALLET123456789';
  const airlineAddress = 'GAIRLINEWALLET123456789';
  const arbitrators = ['GARBITERONE123456789', 'GARBITERTWO123456789'];

  let refunds: any[];
  let disputes: any[];
  let evidenceItems: any[];
  let repoSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.DISPUTE_ARBITRATORS = arbitrators.join(',');

    refunds = [
      {
        id: 'refund-1',
        booking: {
          id: 'booking-1',
          flight: { airlineSorobanAddress: airlineAddress },
          passenger: { sorobanAddress: claimantAddress },
        },
      },
    ];

    disputes = [];
    evidenceItems = [];

    const refundRepo = {
      findOne: jest.fn(async ({ where }: any) => refunds.find((r) => r.id === where.id) || null),
    };

    const disputeRepo = {
      findOne: jest.fn(async ({ where, order }: any) => {
        if (where?.id) {
          const found = disputes.find((d) => d.id === where.id) || null;
          if (found) {
            found.evidenceItems = evidenceItems.filter((e) => e.dispute.id === found.id);
          }
          return found;
        }
        if (where?.refund?.id) {
          const list = disputes.filter((d) => d.refund.id === where.refund.id);
          if (!list.length) return null;
          const sorted = order?.createdAt === 'DESC' ? list.sort((a, b) => b.createdAt - a.createdAt) : list;
          const found = sorted[0];
          found.evidenceItems = evidenceItems.filter((e) => e.dispute.id === found.id);
          return found;
        }
        return null;
      }),
      create: jest.fn((data: any) => ({
        id: data.id || `dispute-${disputes.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        evidenceItems: [],
        ...data,
      })),
      save: jest.fn(async (entity: any) => {
        entity.updatedAt = new Date();
        const idx = disputes.findIndex((d) => d.id === entity.id);
        if (idx === -1) {
          disputes.push(entity);
        } else {
          disputes[idx] = entity;
        }
        return entity;
      }),
      createQueryBuilder: jest.fn(),
    };

    const evidenceRepo = {
      create: jest.fn((data: any) => ({
        id: `evidence-${evidenceItems.length + 1}`,
        submittedAt: new Date(),
        ...data,
      })),
      save: jest.fn(async (entityOrEntities: any) => {
        const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
        entities.forEach((entity) => evidenceItems.push(entity));
        return entityOrEntities;
      }),
    };

    repoSpy = jest.spyOn(AppDataSource, 'getRepository').mockImplementation((target: any) => {
      if (target === Refund) return refundRepo as any;
      if (target === Dispute) return disputeRepo as any;
      if (target === DisputeEvidence) return evidenceRepo as any;
      throw new Error(`Unexpected repository ${target?.name || target}`);
    });
  });

  afterEach(() => {
    repoSpy.mockRestore();
  });

  it('creates a dispute with arbitrator assignment and evidence', async () => {
    const dispute = await disputeService.createDispute({
      refundId: 'refund-1',
      claimantAddress,
      disputeType: 'refund_denied',
      description: 'Refund was denied despite airline cancellation and supporting receipts.',
      desiredOutcome: 'Full refund and fee reversal',
      evidence: [
        {
          description: 'Cancellation screenshot',
          fileUrl: 'QmYwAPJzv5CZsnAzt8auV2zEJjQ98q2TfGsDz3jAC5vVsx',
        },
      ],
    });

    expect(dispute.refundId).toBe('refund-1');
    expect(arbitrators).toContain(dispute.arbitratorAddress);
    expect(dispute.status).toBe('evidence_submission');
    expect(dispute.evidence[0].fileUrl).toBe('ipfs://QmYwAPJzv5CZsnAzt8auV2zEJjQ98q2TfGsDz3jAC5vVsx');
  });

  it('allows participants to submit evidence and move dispute under review', async () => {
    const created = await disputeService.createDispute({
      refundId: 'refund-1',
      claimantAddress,
      disputeType: 'service_quality',
      description: 'Service issue details and missing compensation response from airline.',
      desiredOutcome: 'Partial refund aligned with policy',
    });

    const updated = await disputeService.submitEvidence({
      disputeId: created.id,
      submittedBy: airlineAddress,
      description: 'Airline incident log export',
      fileUrl: 'ipfs://bafybeigdyrzt5x7g2kqdnmxz2d72nk44w63v3x4jtclq6ln6ai3n6gy2he',
    });

    expect(updated.status).toBe('under_review');
    expect(updated.evidence).toHaveLength(1);
  });

  it('enforces assigned arbitrator for resolution and supports appeal', async () => {
    const created = await disputeService.createDispute({
      refundId: 'refund-1',
      claimantAddress,
      disputeType: 'refund_amount',
      description: 'The approved amount omitted taxes and mandatory charges.',
      desiredOutcome: 'Increase approved amount to full value',
    });

    await expect(
      disputeService.resolveDispute({
        disputeId: created.id,
        arbitratorAddress: 'GUNAUTHORIZEDARBITER111111111',
        outcome: 'claimant_wins',
      }),
    ).rejects.toThrow('Only the assigned arbitrator may resolve this dispute');

    const resolved = await disputeService.resolveDispute({
      disputeId: created.id,
      arbitratorAddress: created.arbitratorAddress!,
      outcome: 'partial',
      notes: 'Claim partially validated based on submitted records',
    });

    expect(resolved.status).toBe('resolved');
    expect(resolved.outcome).toBe('partial');

    const appealed = await disputeService.appealDispute({
      disputeId: created.id,
      appellantAddress: claimantAddress,
      reason: 'New payment proof shows full amount was eligible for refund.',
    });

    expect(appealed.status).toBe('appealed');
  });
});
