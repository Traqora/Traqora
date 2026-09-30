/**
 * OpenTelemetry sampler names, kept dependency-free so configuration code can
 * import them without loading the OpenTelemetry runtime.
 *
 * These mirror the standard `OTEL_TRACES_SAMPLER` values.
 */

export const TRACING_SAMPLERS = [
  'always_on',
  'always_off',
  'traceidratio',
  'parentbased_always_on',
  'parentbased_always_off',
  'parentbased_traceidratio',
] as const;

export type TracingSamplerName = (typeof TRACING_SAMPLERS)[number];

export const DEFAULT_TRACING_SAMPLER: TracingSamplerName = 'parentbased_traceidratio';
