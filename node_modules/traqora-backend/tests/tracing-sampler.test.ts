/**
 * Regression tests for OpenTelemetry sampler selection (issue #739).
 *
 * Verifies every supported OTEL_TRACES_SAMPLER value maps to the expected
 * Sampler, that the ratio-based strategies receive the configured sample rate,
 * and that an unknown sampler name fails fast.
 */

import { describe, it, expect } from '@jest/globals';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';

import { createSampler } from '../src/tracing-sampler';
import {
  DEFAULT_TRACING_SAMPLER,
  TRACING_SAMPLERS,
} from '../src/config/tracing-samplers';

describe('createSampler', () => {
  it('defaults to a parent-based ratio sampler', () => {
    expect(DEFAULT_TRACING_SAMPLER).toBe('parentbased_traceidratio');
    expect([...TRACING_SAMPLERS]).toContain(DEFAULT_TRACING_SAMPLER);
  });

  it('returns an AlwaysOnSampler for always_on', () => {
    expect(createSampler('always_on', 1)).toBeInstanceOf(AlwaysOnSampler);
  });

  it('returns an AlwaysOffSampler for always_off', () => {
    expect(createSampler('always_off', 1)).toBeInstanceOf(AlwaysOffSampler);
  });

  it('returns a TraceIdRatioBasedSampler for traceidratio', () => {
    expect(createSampler('traceidratio', 0.25)).toBeInstanceOf(
      TraceIdRatioBasedSampler,
    );
  });

  it('wraps the configured root sampler for parentbased_* strategies', () => {
    expect(createSampler('parentbased_always_on', 1)).toBeInstanceOf(
      ParentBasedSampler,
    );
    expect(createSampler('parentbased_always_off', 1)).toBeInstanceOf(
      ParentBasedSampler,
    );
    expect(createSampler('parentbased_traceidratio', 0.5)).toBeInstanceOf(
      ParentBasedSampler,
    );
  });

  it('honours the configured sample rate for ratio strategies', () => {
    const low = createSampler('traceidratio', 0.25);
    const high = createSampler('traceidratio', 0.75);
    expect(low.toString()).not.toBe(high.toString());

    const parentLow = createSampler('parentbased_traceidratio', 0.25);
    const parentHigh = createSampler('parentbased_traceidratio', 0.75);
    expect(parentLow.toString()).not.toBe(parentHigh.toString());
  });

  it.each(TRACING_SAMPLERS)('builds a sampler for %s', (name) => {
    expect(() => createSampler(name, 1)).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // Failure mode
  // ---------------------------------------------------------------------

  it('throws on an unknown sampler name instead of silently sampling', () => {
    expect(() => createSampler('definitely_not_a_sampler', 1)).toThrow(
      /Unknown OpenTelemetry sampler "definitely_not_a_sampler"/,
    );
  });
});
