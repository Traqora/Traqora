import express from 'express';
import request from 'supertest';
import { AppDataSource } from '../src/db/dataSource';
import { errorHandler } from '../src/utils/errorHandler';
import { adminAnalyticsRoutes } from '../src/api/routes/admin/analytics';

jest.mock('../src/middleware/adminAuth', () => ({
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

describe('Admin analytics distribution graph validation', () => {
  const app = express();
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const repository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  beforeAll(() => {
    app.use(express.json());
    app.use('/api/v1/admin/analytics', adminAnalyticsRoutes);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.spyOn(AppDataSource, 'getRepository').mockReturnValue(repository as any);
    queryBuilder.getMany.mockResolvedValue([]);
    queryBuilder.andWhere.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns distribution graph payload for valid query filters', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/distributions?interval=hour&limit=10')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.filters).toMatchObject({
      interval: 'hour',
      limit: 10,
    });
    expect(Array.isArray(res.body.data.volumeByPeriod)).toBe(true);
  });

  it('rejects unsupported graph interval', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/distributions?interval=week')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects graph query when limit exceeds max', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/distributions?limit=100001')
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('rejects graph query when startDate is after endDate', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/distributions?startDate=2026-07-02&endDate=2026-07-01')
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
