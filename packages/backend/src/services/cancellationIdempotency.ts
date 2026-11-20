/**
 * Idempotent cancellation handling (issue #1151).
 *
 * A repeated cancel request with the same Idempotency-Key must not trigger a
 * second supplier cancellation or refund. The first response is stored with
 * the key and replayed verbatim. Reusing a key with a different payload is a
 * conflict, which prevents an accidental key collision from silently
 * changing what gets cancelled.
 *
 * The repository is injected so the behaviour can be tested without a
 * database; the route supplies the real TypeORM repository.
 */
import type { Repository } from 'typeorm';
import { ConflictError } from '../utils/errors';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';

export interface IdempotencyParams {
  key: string;
  method: string;
  path: string;
  requestHash: string;
}

export type IdempotencyRepo = Pick<Repository<IdempotencyKey>, 'findOne' | 'create' | 'save'>;

export interface IdempotentResult<T> {
  result: T;
  idempotent: boolean;
}

/**
 * Run `execute` at most once per idempotency key and return the stored result
 * for every later request with the same key and payload.
 */
export async function runOnceByIdempotencyKey<T>(
  repo: IdempotencyRepo,
  params: IdempotencyParams,
  execute: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const existing = await repo.findOne({ where: { key: params.key } });

  if (existing && existing.requestHash !== params.requestHash) {
    throw new ConflictError('Idempotency key reuse with different payload');
  }

  if (existing?.responseBody) {
    return { result: JSON.parse(existing.responseBody) as T, idempotent: true };
  }

  const idem =
    existing ??
    repo.create({
      key: params.key,
      method: params.method,
      path: params.path,
      requestHash: params.requestHash,
    });

  const result = await execute();

  idem.responseBody = JSON.stringify(result);
  await repo.save(idem);

  return { result, idempotent: false };
}
