import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../utils/logger';

/**
 * Webhook replay protection (issue #599).
 *
 * Every outbound webhook carries a timestamp + nonce inside the payload and
 * an HMAC-SHA256 signature header covering both:
 *
 *   canonical = `${timestamp}.${nonce}.${rawBody}`
 *   X-Traqora-Signature: `t=${timestamp},v1=<hex hmac>`
 *
 * Consumers (and our own inbound verification middleware) reject requests
 * whose timestamp is stale, whose HMAC does not match (tampering), or whose
 * nonce has already been seen within the TTL window (replay).
 */

export const SIGNATURE_HEADER = 'x-traqora-signature';

/** Maximum age of a signed payload before it is rejected as expired. */
export const DEFAULT_MAX_AGE_SECONDS = 5 * 60;
/** How long a nonce is remembered; should exceed the max age window. */
export const DEFAULT_NONCE_TTL_MS = 15 * 60 * 1000;

export interface VerifyOptions {
  maxAgeSeconds?: number;
  nonceStore?: NonceStore;
  now?: number;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * In-memory TTL store for seen nonces. Suitable for single-instance
 * deployments; multi-instance deployments should back this with Redis.
 */
export class NonceStore {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number = DEFAULT_NONCE_TTL_MS) {}

  /** Returns true if the key was fresh; false if it was a replay. */
  checkAndRecord(key: string, now: number = Date.now()): boolean {
    this.prune(now);
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.set(key, now);
    return true;
  }

  has(key: string): boolean {
    return this.seen.has(key);
  }

  get size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    for (const [key, ts] of this.seen) {
      if (now - ts > this.ttlMs) {
        this.seen.delete(key);
      }
    }
  }
}

function hmacHex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function rawBodyString(rawBody: unknown, parsedBody: unknown): string {
  if (typeof rawBody === 'string') return rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  return JSON.stringify(parsedBody ?? {});
}

/**
 * Build the signature header + canonical parts for a payload.
 * Shared by WebhookService (signing side) and useful in tests.
 */
export function signWebhook(
  rawBody: string,
  secret: string,
  opts: { timestamp?: string; nonce?: string; now?: number } = {}
): { header: string; timestamp: string; nonce: string } {
  const timestamp =
    opts.timestamp ?? new Date(opts.now ?? Date.now()).toISOString();
  const nonce = opts.nonce ?? crypto.randomUUID();
  const canonical = `${timestamp}.${nonce}.${rawBody}`;
  const header = `t=${timestamp},v1=${hmacHex(secret, canonical)}`;
  return { header, timestamp, nonce };
}

/**
 * Verify a signed webhook request. Checks, in order:
 *  1. signature header present and parseable
 *  2. timestamp is fresh (not expired, not unreasonably far in the future)
 *  3. HMAC matches the canonical string (tamper detection)
 *  4. nonce has not been seen before (replay detection)
 */
export function verifyWebhook(
  rawBody: unknown,
  headers: Record<string, unknown>,
  secret: string,
  opts: VerifyOptions = {}
): VerifyResult {
  const maxAgeSeconds = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const nonceStore = opts.nonceStore ?? new NonceStore();

  const headerValue = headers[SIGNATURE_HEADER];
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return { valid: false, reason: 'missing_signature' };
  }

  const match = /^t=([^,]+),v1=([a-f0-9]{64})$/.exec(headerValue.trim());
  if (!match) {
    return { valid: false, reason: 'malformed_signature' };
  }
  const [, timestamp, signature] = match;

  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt)) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  const now = opts.now ?? Date.now();
  const ageSeconds = (now - sentAt) / 1000;
  if (ageSeconds > maxAgeSeconds) {
    return { valid: false, reason: 'expired_timestamp' };
  }
  if (ageSeconds < -maxAgeSeconds) {
    return { valid: false, reason: 'future_timestamp' };
  }

  const body = rawBodyString(rawBody, null);

  // The nonce lives inside the JSON body; extract it so we can rebuild the
  // exact canonical string that was signed.
  let nonce: string | undefined;
  try {
    const parsed: unknown =
      typeof rawBody === 'string'
        ? JSON.parse(rawBody)
        : Buffer.isBuffer(rawBody)
          ? JSON.parse(rawBody.toString('utf8'))
          : rawBody;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).nonce === 'string'
    ) {
      nonce = (parsed as Record<string, unknown>).nonce as string;
    }
  } catch {
    return { valid: false, reason: 'unparseable_body' };
  }
  if (!nonce) {
    return { valid: false, reason: 'missing_nonce' };
  }

  const canonical = `${timestamp}.${nonce}.${body}`;
  if (!timingSafeEqualHex(hmacHex(secret, canonical), signature)) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  if (!nonceStore.checkAndRecord(`${timestamp}:${nonce}`, now)) {
    return { valid: false, reason: 'replayed_nonce' };
  }

  return { valid: true };
}

/**
 * Resolve the signing secret. Uses WEBHOOK_SIGNING_SECRET when set,
 * falling back to JWT_SECRET so local development works out of the box.
 * Returns null when no secret is configured (signing/verification skipped).
 */
export function getWebhookSecret(): string | null {
  const secret = process.env.WEBHOOK_SIGNING_SECRET || process.env.JWT_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

interface WebhookVerificationOptions extends VerifyOptions {
  /** Override the signing secret (defaults to getWebhookSecret()). */
  secret?: string;
  /** Called with the failure reason before the 401 response is sent. */
  onFailure?: (reason: string) => void;
}

/**
 * Express middleware verifying inbound webhooks signed by WebhookService.
 * Configure express.json with a `verify` callback that stores the raw body
 * on `req.rawBody` for exact-byte verification; falls back to re-serializing
 * the parsed body when unavailable.
 */
export function webhookVerificationMiddleware(
  options: WebhookVerificationOptions = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret: string | null = options.secret ?? getWebhookSecret();
    if (!secret) {
      logger.warn('webhook: no signing secret configured; skipping verification');
      next();
      return;
    }

    const result = verifyWebhook(
      (req as Request & { rawBody?: Buffer }).rawBody ?? req.body,
      req.headers as Record<string, unknown>,
      secret,
      options
    );

    if (!result.valid) {
      options.onFailure?.(result.reason);
      logger.warn(`webhook: verification failed (${result.reason})`, {
        path: req.path,
      });
      res.status(401).json({ success: false, error: result.reason });
      return;
    }

    next();
  };
}
