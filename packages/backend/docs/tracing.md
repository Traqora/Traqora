# OpenTelemetry Tracing and Sampling

The backend initializes OpenTelemetry in `packages/backend/src/tracing.ts` when
`ENABLE_TRACING=true` (or `OTEL_SDK_DISABLED=false`). Traces are exported to
`OTLP_TRACE_URL` and sampled by the strategy selected with
`OTEL_TRACES_SAMPLER`.

## Sampling contract

| Input | Meaning |
| --- | --- |
| `OTEL_TRACES_SAMPLER` | Sampler strategy. Defaults to `parentbased_traceidratio`. |
| `TRACING_SAMPLE_RATE` / `OTEL_TRACES_SAMPLER_ARG` | Ratio in `[0, 1]` used by the `traceidratio` strategies. Defaults to `1`. |

Output: a `Sampler` passed to the OpenTelemetry `NodeSDK`.

Error cases:

- An unknown `OTEL_TRACES_SAMPLER` value throws `Unknown OpenTelemetry sampler "<value>"`.
  Startup fails fast rather than silently falling back, so a typo cannot quietly
  drop all traces.
- A sample rate outside `[0, 1]` is rejected by the configuration schema.

## Supported strategies

| `OTEL_TRACES_SAMPLER` | Behavior |
| --- | --- |
| `always_on` | Sample every root span. |
| `always_off` | Never sample. |
| `traceidratio` | Sample root spans at `TRACING_SAMPLE_RATE`, ignoring parent decisions. |
| `parentbased_always_on` | Respect the parent span's decision; sample all roots. |
| `parentbased_always_off` | Respect the parent span's decision; never sample roots. |
| `parentbased_traceidratio` | Respect the parent span's decision; sample roots at `TRACING_SAMPLE_RATE`. Default. |

Parent-based strategies are the safe default because they keep a trace either
fully sampled or fully unsampled across services once a root decision is made.

## Recommended settings

| Environment | `OTEL_TRACES_SAMPLER` | `TRACING_SAMPLE_RATE` |
| --- | --- | --- |
| Local development | `parentbased_always_on` | `1` |
| Staging | `parentbased_traceidratio` | `1` |
| Production | `parentbased_traceidratio` | `0.05` – `0.2` |

When the tracing backend is unavailable, set `always_off` (or
`ENABLE_TRACING=false`) rather than lowering the ratio to `0`, so the intent is
explicit in configuration.

## Tests

`packages/backend/tests/tracing-sampler.test.ts` covers each supported value,
the sample-rate wiring, and the unknown-sampler failure mode.

```bash
npm test --workspace=packages/backend -- tracing-sampler
```
