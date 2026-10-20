import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  checkSentryReleaseHealth,
  getSentryRelease,
  initializeErrorTracking,
  captureException,
  isErrorTrackingInitialized,
} from '../../src/services/errorTracking';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  withScope: jest.fn((cb) => cb({ setTag: jest.fn(), setUser: jest.fn() })),
  captureException: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: jest.fn(() => ({ name: 'Profiling' })),
}));

describe('errorTracking (issue #740 sentry release health)', () => {
  let originalDsn: string | undefined;

  beforeEach(() => {
    originalDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = '';
    jest.resetModules();
  });

  afterEach(() => {
    process.env.SENTRY_DSN = originalDsn || '';
  });

  describe('checkSentryReleaseHealth', () => {
    it('returns unhealthy when SENTRY_DSN is not configured', () => {
      const result = checkSentryReleaseHealth({ sentryDsn: '', environment: 'development' } as any);
      expect(result.healthy).toBe(false);
      expect(result.error).toBe('SENTRY_DSN not configured');
    });

    it('returns healthy with release when SENTRY_DSN is configured', () => {
      const result = checkSentryReleaseHealth({ sentryDsn: 'https://example@sentry.io/1', environment: 'test' } as any);
      expect(result.healthy).toBe(true);
      expect(result.release).toBeDefined();
    });
  });

  describe('getSentryRelease', () => {
    it('returns a release string containing traqora-backend@', () => {
      const release = getSentryRelease();
      expect(release).toContain('traqora-backend@');
    });
  });

  describe('initializeErrorTracking', () => {
    it('returns false when sentryDsn is not configured', () => {
      const result = initializeErrorTracking({ sentryDsn: '', environment: 'development' } as any);
      expect(result).toBe(false);
      expect(isErrorTrackingInitialized()).toBe(false);
    });
  });

  describe('captureException', () => {
    it('does not throw when Sentry is not initialized', () => {
      expect(() => {
        captureException(new Error('test'), { requestId: 'req-1' });
      }).not.toThrow();
    });

    it('does not throw when Sentry is initialized', () => {
      initializeErrorTracking({ sentryDsn: 'https://example@sentry.io/1', environment: 'test' } as any);
      expect(() => {
        captureException(new Error('test'), { requestId: 'req-1' });
      }).not.toThrow();
    });
  });
});
