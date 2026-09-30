import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { adminRoutes } from '../src/api/routes/admin';
import { adminRefundRoutes } from '../src/api/routes/admin/refunds';
import * as repoModule from '../src/repositories/refundDisputeRepository';
import { config } from '../src/config';
import { errorHandler } from '../src/utils/errorHandler';

describe('Admin Overview Integration Tests', () => {
  let app: express.Application;
  let mockRepository: any;

  const getAdminHeader = () => ({
    'X-Admin-Api-Key': config.adminApiKey,
  });

  const getValidAdminToken = () =>
    jwt.sign(
      { adminId: 'admin-test-id', email: 'admin@traqora.io', role: 'admin' },
      config.jwtSecret,
    );

  beforeEach(() => {
    mockRepository = {
      getOverview: jest.fn().mockResolvedValue({
        metrics: {
          totalRefunds: 4,
          totalDisputes: 2,
          totalRequestedAmountCents: 100000,
          totalApprovedAmountCents: 45000,
          pendingRefundsCount: 2,
          manualReviewRefundsCount: 1,
          openDisputesCount: 1,
          activeDisputesCount: 2,
        },
        refunds: {
          total: 4,
          totalRequestedAmountCents: 100000,
          totalApprovedAmountCents: 45000,
          byStatus: repoModule.ALL_REFUND_STATUSES.reduce((acc, status) => {
            acc[status] = {
              status,
              count: status === 'pending' ? 2 : status === 'approved' ? 1 : status === 'manual_review' ? 1 : 0,
              totalRequestedAmountCents: status === 'pending' ? 40000 : status === 'approved' ? 45000 : status === 'manual_review' ? 15000 : 0,
              totalApprovedAmountCents: status === 'approved' ? 45000 : 0,
              recentItems: status === 'pending' ? [
                {
                  id: 'ref-1',
                  status: 'pending',
                  reason: 'flight_cancelled',
                  requestedAmountCents: 20000,
                  approvedAmountCents: null,
                  processingFeeCents: 0,
                  isEligible: true,
                  requiresManualReview: false,
                  isDelayed: false,
                  emergencyOverride: false,
                  createdAt: '2026-08-30T10:00:00.000Z',
                  updatedAt: '2026-08-30T10:00:00.000Z',
                },
              ] : [],
            };
            return acc;
          }, {} as any),
          recent: [
            {
              id: 'ref-1',
              status: 'pending',
              reason: 'flight_cancelled',
              requestedAmountCents: 20000,
              approvedAmountCents: null,
              processingFeeCents: 0,
              isEligible: true,
              requiresManualReview: false,
              isDelayed: false,
              emergencyOverride: false,
              createdAt: '2026-08-30T10:00:00.000Z',
              updatedAt: '2026-08-30T10:00:00.000Z',
            },
          ],
        },
        disputes: {
          total: 2,
          byStatus: repoModule.ALL_DISPUTE_STATUSES.reduce((acc, status) => {
            acc[status] = {
              status,
              count: status === 'open' ? 1 : status === 'under_review' ? 1 : 0,
              recentItems: status === 'open' ? [
                {
                  id: 'disp-1',
                  claimantAddress: 'GA111',
                  respondentAddress: 'GA222',
                  disputeType: 'refund_denied',
                  description: 'Dispute description for testing',
                  status: 'open',
                  createdAt: '2026-08-31T08:00:00.000Z',
                  updatedAt: '2026-08-31T08:00:00.000Z',
                },
              ] : [],
            };
            return acc;
          }, {} as any),
          recent: [
            {
              id: 'disp-1',
              claimantAddress: 'GA111',
              respondentAddress: 'GA222',
              disputeType: 'refund_denied',
              description: 'Dispute description for testing',
              status: 'open',
              createdAt: '2026-08-31T08:00:00.000Z',
              updatedAt: '2026-08-31T08:00:00.000Z',
            },
          ],
        },
        timestamp: new Date().toISOString(),
      }),
      getRefundOverview: jest.fn().mockResolvedValue({
        total: 4,
        totalRequestedAmountCents: 100000,
        totalApprovedAmountCents: 45000,
        byStatus: {},
        recent: [],
      }),
      getDisputeOverview: jest.fn().mockResolvedValue({
        total: 2,
        byStatus: {},
        recent: [],
      }),
    };

    jest.spyOn(repoModule, 'getRefundDisputeRepository').mockReturnValue(mockRepository);

    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/refunds', adminRefundRoutes);
    app.use('/api/v1/admin', adminRoutes);
    app.use('/admin', adminRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when no admin credentials are provided', async () => {
      const res = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes')
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('returns 401 when invalid admin API key is provided', async () => {
      const res = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes')
        .set('X-Admin-Api-Key', 'invalid-key-that-does-not-match')
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('authenticates successfully via Bearer JWT token', async () => {
      const res = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes')
        .set('Authorization', `Bearer ${getValidAdminToken()}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/admin/overview/refunds-disputes', () => {
    it('returns aggregated refund and dispute status overview with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes')
        .set(getAdminHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.metrics).toBeDefined();
      expect(res.body.data.metrics.totalRefunds).toBe(4);
      expect(res.body.data.metrics.totalDisputes).toBe(2);
      expect(res.body.data.refunds.byStatus).toBeDefined();
      expect(res.body.data.disputes.byStatus).toBeDefined();
      expect(res.body.data.refunds.recent).toHaveLength(1);
      expect(res.body.data.disputes.recent).toHaveLength(1);
    });

    it('supports alternate route /api/v1/admin/refunds-disputes/overview', async () => {
      const res = await request(app)
        .get('/api/v1/admin/refunds-disputes/overview')
        .set(getAdminHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics.totalRefunds).toBe(4);
    });

    it('supports query parameters for recentLimit and date filters', async () => {
      await request(app)
        .get('/api/v1/admin/overview/refunds-disputes?recentLimit=10&startDate=2026-08-01T00:00:00.000Z&endDate=2026-08-31T23:59:59.999Z')
        .set(getAdminHeader())
        .expect(200);

      expect(mockRepository.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({
          recentLimit: 10,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-31T23:59:59.999Z'),
        }),
      );
    });

    it('returns 400 Bad Request when recentLimit is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes?recentLimit=invalid')
        .set(getAdminHeader())
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('is idempotent across multiple calls', async () => {
      const res1 = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes')
        .set(getAdminHeader())
        .expect(200);

      const res2 = await request(app)
        .get('/api/v1/admin/overview/refunds-disputes')
        .set(getAdminHeader())
        .expect(200);

      expect(res1.body.data.metrics).toEqual(res2.body.data.metrics);
    });
  });

  describe('GET /api/v1/admin/refunds/overview', () => {
    it('returns refund status overview', async () => {
      const res = await request(app)
        .get('/api/v1/admin/refunds/overview')
        .set(getAdminHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(4);
      expect(mockRepository.getRefundOverview).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/admin/disputes/overview', () => {
    it('returns dispute status overview', async () => {
      const res = await request(app)
        .get('/api/v1/admin/disputes/overview')
        .set(getAdminHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(2);
      expect(mockRepository.getDisputeOverview).toHaveBeenCalled();
    });
  });
});
