import crypto from 'crypto';
import { AppDataSource } from '../db/dataSource';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';

export const hashObject = (obj: unknown) => {
  const json = JSON.stringify(obj);
  return crypto.createHash('sha256').update(json).digest('hex');
};

export const getOrCreateIdempotencyKey = async (params: {
  key: string;
  method: string;
  path: string;
  requestHash: string;
}) => {
  const repo = AppDataSource.getRepository(IdempotencyKey);
  const existing = await repo.findOne({ where: { key: params.key } });
  if (existing) return existing;

  const created = repo.create({
    key: params.key,
    method: params.method,
    path: params.path,
    requestHash: params.requestHash,
  });
  return repo.save(created);
};
