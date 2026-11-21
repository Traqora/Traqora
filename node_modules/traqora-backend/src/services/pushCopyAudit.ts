/**
 * Push notification copy audit
 *
 * Notification templates are built by string interpolation, so a missing data
 * field silently ships copy like "Your flight undefined is confirmed!" to the
 * device. This module defines the copy contract and flags the two failure modes
 * we can detect before delivery: unresolved placeholders and length overflow.
 *
 * Contract:
 *   input  - `{ title: string; body?: string }` (body may be omitted for
 *            title-only pushes)
 *   output - `{ ok: boolean; findings: PushCopyFinding[] }`; `ok` is true only
 *            when there are no findings
 *   errors - findings are returned, not thrown, so callers can log and still
 *            deliver (or reject) at their discretion
 */

import { logger } from '../utils/logger';

/** Practical display limits used by APNs/FCM notification surfaces. */
export const PUSH_COPY_LIMITS = {
  titleMaxLength: 65,
  bodyMaxLength: 240,
} as const;

export type PushCopyFindingCode =
  | 'TITLE_EMPTY'
  | 'BODY_EMPTY'
  | 'TITLE_TOO_LONG'
  | 'BODY_TOO_LONG'
  | 'UNRESOLVED_PLACEHOLDER';

export type PushCopyField = 'title' | 'body';

export interface PushCopyFinding {
  code: PushCopyFindingCode;
  field: PushCopyField;
  severity: 'error';
  message: string;
}

export interface PushCopy {
  title: string;
  body?: string;
}

export interface PushCopyAuditResult {
  ok: boolean;
  findings: PushCopyFinding[];
}

/**
 * Substrings that indicate a template token was never rendered. Kept narrow so
 * ordinary copy does not trip the audit.
 */
const UNRESOLVED_PLACEHOLDER_PATTERNS: RegExp[] = [
  /\bundefined\b/,
  /\bnull\b/,
  /\bNaN\b/,
  /\[object Object\]/,
  /\{\{[^}]+\}\}/,
  /%[sd]/,
];

const findUnresolvedPlaceholder = (text: string): string | undefined => {
  for (const pattern of UNRESOLVED_PLACEHOLDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return undefined;
};

const auditField = (
  field: PushCopyField,
  text: string,
  maxLength: number,
  emptyCode: PushCopyFindingCode,
  tooLongCode: PushCopyFindingCode,
  findings: PushCopyFinding[],
): void => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    findings.push({
      code: emptyCode,
      field,
      severity: 'error',
      message: `Push ${field} must not be empty`,
    });
  } else if (trimmed.length > maxLength) {
    findings.push({
      code: tooLongCode,
      field,
      severity: 'error',
      message: `Push ${field} is ${trimmed.length} characters, exceeding the ${maxLength} character limit`,
    });
  }

  const placeholder = findUnresolvedPlaceholder(text);
  if (placeholder) {
    findings.push({
      code: 'UNRESOLVED_PLACEHOLDER',
      field,
      severity: 'error',
      message: `Push ${field} contains an unresolved placeholder: "${placeholder}"`,
    });
  }
};

/**
 * Audit push copy and return every finding. Never throws for malformed copy.
 */
export const auditPushCopy = (copy: PushCopy): PushCopyAuditResult => {
  const findings: PushCopyFinding[] = [];

  auditField(
    'title',
    copy.title,
    PUSH_COPY_LIMITS.titleMaxLength,
    'TITLE_EMPTY',
    'TITLE_TOO_LONG',
    findings,
  );

  // A title-only push is valid, so only audit the body when one was provided.
  if (copy.body !== undefined) {
    auditField(
      'body',
      copy.body,
      PUSH_COPY_LIMITS.bodyMaxLength,
      'BODY_EMPTY',
      'BODY_TOO_LONG',
      findings,
    );
  }

  return { ok: findings.length === 0, findings };
};

/** Render findings as a single log-friendly string. */
export const formatPushCopyFindings = (findings: PushCopyFinding[]): string =>
  findings.map((finding) => `${finding.code}(${finding.field})`).join(', ');

/** Audit, log a warning for each finding, and return the result. */
export const auditAndLogPushCopy = (
  copy: PushCopy,
  context: Record<string, unknown> = {},
): PushCopyAuditResult => {
  const result = auditPushCopy(copy);

  if (!result.ok) {
    logger.warn('Push notification copy failed audit', {
      ...context,
      findings: formatPushCopyFindings(result.findings),
      codes: result.findings.map((finding) => finding.code),
    });
  }

  return result;
};
