import crypto from 'crypto';
import type { DataSource } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { ConflictError } from '../utils/errors';

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export const hashObject = (value: unknown): string => {
  const json = JSON.stringify(canonicalize(value)) ?? 'null';
  return crypto.createHash('sha256').update(json).digest('hex');
};

interface IdempotencyParams {
  key: string;
  method: string;
  path: string;
  requestHash: string;
}

export const getOrCreateIdempotencyKey = async (
  params: IdempotencyParams,
  dataSource: DataSource = AppDataSource,
): Promise<IdempotencyKey> => {
  const repo = dataSource.getRepository(IdempotencyKey);
  const existing = await repo.findOne({ where: { key: params.key } });
  if (existing) return existing;

  const created = repo.create(params);
  try {
    return await repo.save(created);
  } catch (error) {
    // The unique key index is the cross-process race guard. If another
    // request inserted first, return its row instead of failing the retry.
    const raced = await repo.findOne({ where: { key: params.key } });
    if (raced) return raced;
    throw error;
  }
};

type OperationResult<T> = { result: T; resourceId?: string | null };
type CachedOperationResult<T> = { result: T; isCached: boolean; record: IdempotencyKey };

const inFlightByDataSource = new WeakMap<object, Map<string, Promise<CachedOperationResult<unknown>>>>();
const resultByDataSource = new WeakMap<object, Map<string, CachedOperationResult<unknown>>>();
const pendingRequests = new WeakMap<Promise<CachedOperationResult<unknown>>, string>();

function requestSignature(params: IdempotencyParams): string {
  return `${params.method}\0${params.path}\0${params.requestHash}`;
}

export async function executeIdempotentOperation<T>(
  params: IdempotencyParams & { execute: () => Promise<OperationResult<T>> },
  dataSource: DataSource = AppDataSource,
): Promise<CachedOperationResult<T>> {
  let inFlight = inFlightByDataSource.get(dataSource);
  if (!inFlight) {
    inFlight = new Map();
    inFlightByDataSource.set(dataSource, inFlight);
  }
  const pending = inFlight.get(params.key) as Promise<CachedOperationResult<T>> | undefined;
  if (pending) {
    // A reused key must not join an operation for different request data.
    const pendingRequest = pendingRequests.get(pending as Promise<CachedOperationResult<unknown>>);
    if (pendingRequest !== requestSignature(params)) {
      throw new ConflictError('Idempotency key reuse with different request');
    }
    const completed = await pending;
    return { ...completed, isCached: true };
  }

  const execution = (async (): Promise<CachedOperationResult<T>> => {
    const record = await getOrCreateIdempotencyKey(params, dataSource);
    if (
      record.method !== params.method ||
      record.path !== params.path ||
      record.requestHash !== params.requestHash
    ) {
      throw new ConflictError('Idempotency key reuse with different request');
    }

    let results = resultByDataSource.get(dataSource);
    if (!results) {
      results = new Map();
      resultByDataSource.set(dataSource, results);
    }
    const cached = results.get(params.key) as CachedOperationResult<T> | undefined;
    if (cached) return { ...cached, isCached: true };

    const operation = await params.execute();
    record.resourceId = operation.resourceId ?? null;
    const savedRecord = await dataSource.getRepository(IdempotencyKey).save(record);
    const completed: CachedOperationResult<T> = {
      result: operation.result,
      isCached: false,
      record: savedRecord,
    };
    results!.set(params.key, completed as CachedOperationResult<unknown>);
    return completed;
  })();

  inFlight.set(params.key, execution as Promise<CachedOperationResult<unknown>>);
  pendingRequests.set(execution as Promise<CachedOperationResult<unknown>>, requestSignature(params));
  try {
    return await execution;
  } finally {
    if (inFlight.get(params.key) === execution) inFlight.delete(params.key);
    pendingRequests.delete(execution as Promise<CachedOperationResult<unknown>>);
  }
}

export class IdempotencyStore {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  getOrCreate(params: IdempotencyParams): Promise<IdempotencyKey> {
    return getOrCreateIdempotencyKey(params, this.dataSource);
  }

  get(key: string): Promise<IdempotencyKey | null> {
    return this.dataSource.getRepository(IdempotencyKey).findOne({ where: { key } });
  }

  async updateResourceId(key: string, resourceId: string): Promise<IdempotencyKey | null> {
    const record = await this.get(key);
    if (!record) return null;
    record.resourceId = resourceId;
    return this.dataSource.getRepository(IdempotencyKey).save(record);
  }
}
