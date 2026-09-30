import crypto from 'crypto';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { ConflictError } from '../utils/errors';

export const hashObject = (obj: unknown): string => {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj ?? {});
  return crypto.createHash('sha256').update(json).digest('hex');
};

export interface IdempotencyParams {
  key: string;
  method: string;
  path: string;
  requestHash: string;
  resourceId?: string | null;
}

export class IdempotencyStore {
  private dataSource: DataSource;
  private static inFlightLocks: Map<string, Promise<any>> = new Map();

  constructor(dataSource: DataSource = AppDataSource) {
    this.dataSource = dataSource;
  }

  public async getOrCreate(params: IdempotencyParams): Promise<IdempotencyKey> {
    const repo = this.dataSource.getRepository(IdempotencyKey);
    const existing = await repo.findOne({ where: { key: params.key } });
    if (existing) return existing;

    try {
      const created = repo.create({
        key: params.key,
        method: params.method,
        path: params.path,
        requestHash: params.requestHash,
        resourceId: params.resourceId ?? null,
      });
      return await repo.save(created);
    } catch (error: any) {
      // Handle race condition: another concurrent request inserted the same key
      const concurrentExisting = await repo.findOne({ where: { key: params.key } });
      if (concurrentExisting) {
        return concurrentExisting;
      }
      throw error;
    }
  }

  public async executeOnce<T>(params: {
    key: string;
    method: string;
    path: string;
    requestHash: string;
    execute: () => Promise<{ result: T; resourceId?: string }>;
  }): Promise<{ result: T; isCached: boolean; record: IdempotencyKey }> {
    const record = await this.getOrCreate({
      key: params.key,
      method: params.method,
      path: params.path,
      requestHash: params.requestHash,
    });

    if (record.requestHash !== params.requestHash) {
      throw new ConflictError('Idempotency key reuse with different payload');
    }

    // If an execution for this key is already in flight, join the existing promise
    if (IdempotencyStore.inFlightLocks.has(params.key)) {
      const executionResult = await IdempotencyStore.inFlightLocks.get(params.key);
      const updatedRecord = (await this.get(params.key)) || record;
      return { result: executionResult, isCached: true, record: updatedRecord };
    }

    if (record.resourceId) {
      return { result: record.resourceId as unknown as T, isCached: true, record };
    }

    const executionPromise = (async () => {
      try {
        const { result, resourceId } = await params.execute();
        if (resourceId) {
          record.resourceId = resourceId;
          const repo = this.dataSource.getRepository(IdempotencyKey);
          await repo.save(record);
        }
        return result;
      } finally {
        IdempotencyStore.inFlightLocks.delete(params.key);
      }
    })();

    IdempotencyStore.inFlightLocks.set(params.key, executionPromise);
    const result = await executionPromise;
    return { result, isCached: false, record };
  }

  public async get(key: string): Promise<IdempotencyKey | null> {
    const repo = this.dataSource.getRepository(IdempotencyKey);
    return repo.findOne({ where: { key } });
  }

  public async updateResourceId(key: string, resourceId: string): Promise<IdempotencyKey | null> {
    const repo = this.dataSource.getRepository(IdempotencyKey);
    const record = await repo.findOne({ where: { key } });
    if (!record) return null;
    record.resourceId = resourceId;
    return repo.save(record);
  }
}

export const getOrCreateIdempotencyKey = async (
  params: {
    key: string;
    method: string;
    path: string;
    requestHash: string;
    resourceId?: string | null;
  },
  dataSource?: DataSource
): Promise<IdempotencyKey> => {
  const store = new IdempotencyStore(dataSource || AppDataSource);
  return store.getOrCreate(params);
};

export const executeIdempotentOperation = async <T>(
  params: {
    key: string;
    method: string;
    path: string;
    requestHash: string;
    execute: () => Promise<{ result: T; resourceId?: string }>;
  },
  dataSource?: DataSource
): Promise<{ result: T; isCached: boolean; record: IdempotencyKey }> => {
  const store = new IdempotencyStore(dataSource || AppDataSource);
  return store.executeOnce(params);
};
