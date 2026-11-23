import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFlightRoutes } from '../../src/api/routes/flights';

jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { walletAddress: 'GSEARCHUSER123', walletType: 'freighter' };
    next();
  },
}));

type SearchHistoryRow = {
  id: string;
  userId: string;
  fromAirport: string;
  toAirport: string;
  departureDate: string;
  passengers: number;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  createdAt: Date;
};

type SavedSearchRow = {
  id: string;
  userId: string;
  name: string | null;
  fromAirport: string;
  toAirport: string;
  departureDate: string;
  passengers: number;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  createdAt: Date;
  updatedAt: Date;
};

const historyRows: SearchHistoryRow[] = [];
const savedRows: SavedSearchRow[] = [];

const historyRepo = {
  find: jest.fn(async (args?: any) => {
    const userId = args?.where?.userId;
    const rows = historyRows
      .filter((row) => (userId ? row.userId === userId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (args?.take) {
      return rows.slice(0, args.take);
    }
    return rows;
  }),
  findOne: jest.fn(async ({ where }: any) => {
    return historyRows.find((row) =>
      Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
    ) || null;
  }),
  create: jest.fn((payload: Omit<SearchHistoryRow, 'id' | 'createdAt'>) => ({
    id: `history-${historyRows.length + 1}`,
    createdAt: new Date(),
    ...payload,
  })),
  save: jest.fn(async (entry: SearchHistoryRow) => {
    historyRows.unshift(entry);
    return entry;
  }),
  remove: jest.fn(async (entry: SearchHistoryRow) => {
    const index = historyRows.findIndex((row) => row.id === entry.id);
    if (index >= 0) historyRows.splice(index, 1);
  }),
  delete: jest.fn(async (ids: string[]) => {
    for (const id of ids) {
      const index = historyRows.findIndex((row) => row.id === id);
      if (index >= 0) historyRows.splice(index, 1);
    }
  }),
};

const savedRepo = {
  find: jest.fn(async ({ where }: any) => {
    return savedRows
      .filter((row) => row.userId === where.userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }),
  findOne: jest.fn(async ({ where }: any) => {
    return savedRows.find((row) =>
      Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
    ) || null;
  }),
  count: jest.fn(async ({ where }: any) => savedRows.filter((row) => row.userId === where.userId).length),
  create: jest.fn((payload: Omit<SavedSearchRow, 'id' | 'createdAt' | 'updatedAt'>) => ({
    id: `saved-${savedRows.length + 1}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...payload,
  })),
  save: jest.fn(async (entry: SavedSearchRow) => {
    const existingIndex = savedRows.findIndex((row) => row.id === entry.id);
    const updated = { ...entry, updatedAt: new Date() };
    if (existingIndex >= 0) {
      savedRows[existingIndex] = updated;
    } else {
      savedRows.unshift(updated);
    }
    return updated;
  }),
  remove: jest.fn(async (entry: SavedSearchRow) => {
    const index = savedRows.findIndex((row) => row.id === entry.id);
    if (index >= 0) savedRows.splice(index, 1);
  }),
};

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: (entity: unknown) => {
      if ((entity as { name?: string })?.name === 'SearchHistoryEntry') return historyRepo;
      if ((entity as { name?: string })?.name === 'SavedSearch') return savedRepo;
      throw new Error('Unknown repository');
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/v1/flights', createFlightRoutes({ searchFlights: jest.fn() } as any));

describe('flight search memory routes', () => {
  beforeEach(() => {
    historyRows.splice(0);
    savedRows.splice(0);
    jest.clearAllMocks();
  });

  it('stores and returns search history entries', async () => {
    const createRes = await request(app).post('/api/v1/flights/search/history').send({
      from: 'jfk',
      to: 'lax',
      date: '2026-09-10',
      passengers: 2,
      class: 'economy',
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.fromAirport).toBe('JFK');

    const listRes = await request(app).get('/api/v1/flights/search/history');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('creates and removes saved searches', async () => {
    const createRes = await request(app).post('/api/v1/flights/saved-searches').send({
      name: 'Trip',
      from: 'JFK',
      to: 'SEA',
      date: '2026-10-01',
      passengers: 1,
      class: 'business',
    });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;

    const listRes = await request(app).get('/api/v1/flights/saved-searches');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const deleteRes = await request(app).delete(`/api/v1/flights/saved-searches/${id}`);
    expect(deleteRes.status).toBe(204);
  });
});
