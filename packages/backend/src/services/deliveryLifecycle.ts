/**
 * Delivery lifecycle for v1 notifications.
 *
 * Records the four states the v1 scope calls out: provider acceptance,
 * delivery failure, retry, and terminal state. The state is stored inside the
 * existing `notification_logs.payload` JSON column so no migration is needed.
 *
 * Metadata written alongside a delivery is sanitized: keys that look like
 * credentials or contact secrets are replaced with `[REDACTED]`. Message body
 * content is never copied into metadata.
 */

export type DeliveryLifecycleState =
  | 'accepted'
  | 'delivered'
  | 'failed'
  | 'retrying'
  | 'terminal';

const ALLOWED_TRANSITIONS: Readonly<Record<DeliveryLifecycleState, readonly DeliveryLifecycleState[]>> = {
  accepted: ['delivered', 'failed', 'terminal'],
  failed: ['retrying', 'terminal'],
  retrying: ['accepted', 'failed', 'terminal'],
  delivered: ['terminal'],
  terminal: [],
};

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|authorization|apikey|api_key|privatekey|private_key|credential|webhook|signature|auth)/i;

/** True when `next` is a valid transition from `current`. */
export function isValidDeliveryTransition(
  current: DeliveryLifecycleState | undefined,
  next: DeliveryLifecycleState
): boolean {
  if (current === undefined) return next === 'accepted' || next === 'failed';
  if (current === next) return true;
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
}

/** Return a copy of metadata with sensitive values redacted. */
export function sanitizeDeliveryMetadata(
  metadata: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeDeliveryMetadata(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === 'object'
          ? sanitizeDeliveryMetadata(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
