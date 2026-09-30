/**
 * OpenTelemetry tracing sampler selection.
 *
 * Maps the standard `OTEL_TRACES_SAMPLER` values to concrete `Sampler`
 * instances so operators can choose a sampling strategy without a code change.
 * The ratio-based strategies reuse `tracingSampleRate`
 * (`OTEL_TRACES_SAMPLER_ARG` / `TRACING_SAMPLE_RATE`).
 *
 * Contract:
 *   input  - `samplerName`: one of `TRACING_SAMPLERS`; `sampleRate`: 0..1
 *   output - an OpenTelemetry `Sampler`
 *   error  - unknown `samplerName` throws `Error` (callers fail fast at boot)
 */

import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type Sampler,
} from '@opentelemetry/sdk-trace-base';
import { TRACING_SAMPLERS } from './config/tracing-samplers';

/**
 * Build the sampler described by `samplerName` and `sampleRate`.
 *
 * @throws if `samplerName` is not a recognised `OTEL_TRACES_SAMPLER` value.
 */
export const createSampler = (samplerName: string, sampleRate: number): Sampler => {
  switch (samplerName) {
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'traceidratio':
      return new TraceIdRatioBasedSampler(sampleRate);
    case 'parentbased_always_on':
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
    case 'parentbased_always_off':
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    case 'parentbased_traceidratio':
      return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(sampleRate) });
    default:
      throw new Error(
        `Unknown OpenTelemetry sampler "${samplerName}". Supported values: ${TRACING_SAMPLERS.join(', ')}`,
      );
  }
};
