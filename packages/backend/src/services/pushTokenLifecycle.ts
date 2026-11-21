import type { UserPreference } from '../db/entities/UserPreference';

export type PushFailureKind = 'permanent' | 'transient';

/**
 * Provider errors that identify a token which must not be retried.
 * Everything else remains retryable because network/provider outages are
 * expected to recover.
 */
export function classifyPushFailure(error: unknown): PushFailureKind {
  const value = error instanceof Error ? error.message : String(error ?? '');
  const normalized = value.toLowerCase();

  if (
    /\b(400|404|410|422)\b/.test(normalized) &&
    /(token|registration|subscription|device|endpoint|unregistered|invalid)/.test(normalized)
  ) {
    return 'permanent';
  }

  if (
    /(unregistered|registration-token-not-registered|invalid.?registration|not.?registered|invalid.?token|subscription.*gone|endpoint.*gone)/.test(normalized)
  ) {
    return 'permanent';
  }

  return 'transient';
}

export function isPermanentPushFailure(error: unknown): boolean {
  return classifyPushFailure(error) === 'permanent';
}

/** Remove a rejected token while preserving every other device registration. */
export function purgePushToken(preferences: UserPreference, token: string): boolean {
  const before = preferences.pushDeviceTokens ?? [];
  const after = before.filter((device) => device.token !== token);
  const removed = after.length !== before.length;

  preferences.pushDeviceTokens = after;
  if (preferences.fcmToken === token) {
    preferences.fcmToken = after[0]?.token ?? null;
  }

  return removed;
}
