/**
 * Regression tests for the push notification copy audit (issue #747).
 *
 * Covers the happy path, each failure mode the audit detects, and the real
 * interpolation bug in PushNotificationService where a missing data field ships
 * "undefined" copy to the device.
 */

import { describe, it, expect } from '@jest/globals';

import {
  PUSH_COPY_LIMITS,
  auditPushCopy,
  formatPushCopyFindings,
} from '../../src/services/pushCopyAudit';
import { PushNotificationService } from '../../src/services/PushNotificationService';

describe('auditPushCopy', () => {
  it('passes clean title and body copy', () => {
    const result = auditPushCopy({
      title: 'Booking Confirmed',
      body: 'Your flight TQ101 is confirmed! Ref: REF001',
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('allows a title-only push (no body)', () => {
    const result = auditPushCopy({ title: 'Gate Change: TQ400' });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Failure modes
  // -------------------------------------------------------------------------

  it('flags an interpolated undefined value in the body', () => {
    const result = auditPushCopy({
      title: 'Booking Confirmed',
      body: 'Your flight undefined is confirmed! Ref: REF001',
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'UNRESOLVED_PLACEHOLDER',
        field: 'body',
      }),
    );
  });

  it('flags an unrendered template token in the title', () => {
    const result = auditPushCopy({
      title: 'Booking {{bookingRef}}',
      body: 'See you soon.',
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'UNRESOLVED_PLACEHOLDER',
        field: 'title',
      }),
    );
  });

  it('flags an empty title', () => {
    const result = auditPushCopy({ title: '   ', body: 'Body copy.' });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'TITLE_EMPTY', field: 'title' }),
    );
  });

  it('flags an empty body when one is provided', () => {
    const result = auditPushCopy({ title: 'Notice', body: '' });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'BODY_EMPTY', field: 'body' }),
    );
  });

  it('flags a title longer than the display limit', () => {
    const result = auditPushCopy({
      title: 'T'.repeat(PUSH_COPY_LIMITS.titleMaxLength + 1),
      body: 'Body copy.',
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'TITLE_TOO_LONG', field: 'title' }),
    );
  });

  it('flags a body longer than the display limit', () => {
    const result = auditPushCopy({
      title: 'Notice',
      body: 'B'.repeat(PUSH_COPY_LIMITS.bodyMaxLength + 1),
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'BODY_TOO_LONG', field: 'body' }),
    );
  });

  it('accepts copy exactly at the length limit', () => {
    const result = auditPushCopy({
      title: 'T'.repeat(PUSH_COPY_LIMITS.titleMaxLength),
      body: 'B'.repeat(PUSH_COPY_LIMITS.bodyMaxLength),
    });

    expect(result.ok).toBe(true);
  });

  it('formats findings for logging', () => {
    const { findings } = auditPushCopy({ title: '', body: 'Body copy.' });
    expect(formatPushCopyFindings(findings)).toBe('TITLE_EMPTY(title)');
  });
});

describe('PushNotificationService.auditTypedPush', () => {
  const service = new PushNotificationService();

  it('passes a fully populated booking push', () => {
    const result = service.auditTypedPush('booking', {
      flightNumber: 'TQ101',
      bookingReference: 'REF001',
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('flags the undefined copy produced by missing template data', () => {
    // Regression: buildTypedMessage interpolates raw values, so an empty data
    // object yields "Your flight undefined is confirmed! Ref: undefined".
    const result = service.auditTypedPush('booking', {});

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'UNRESOLVED_PLACEHOLDER' }),
    );
  });
});
