/**
 * Shared performance test utilities for backend services.
 * Provides helpers to measure execution time, run warmup iterations,
 * and compute summary stats with configurable thresholds.
 */

export interface PerfStats {
  mean: number
  median: number
  p95: number
  p99: number
  min: number
  max: number
  durations: number[]
  iterations: number
}

export interface PerfThresholds {
  /** Max acceptable mean duration in ms */
  meanMaxMs?: number
  /** Max acceptable p95 duration in ms */
  p95MaxMs?: number
  /** Max acceptable single-sample in ms */
  maxMs?: number
}

/**
 * Run warmup iterations (JIT compilation, cache priming),
 * then measure `fn` across `iterations` samples.
 */
export async function measurePerf(
  fn: () => Promise<unknown> | unknown,
  iterations = 25,
  warmup = 5
): Promise<PerfStats> {
  for (let i = 0; i < warmup; i++) {
    await fn()
  }

  const durations: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint()
    await fn()
    const end = process.hrtime.bigint()
    durations.push(Number(end - start) / 1_000_000)
  }

  return computeStats(durations)
}

function computeStats(durations: number[]): PerfStats {
  const sorted = [...durations].sort((a, b) => a - b)
  const n = sorted.length
  const sum = durations.reduce((a, b) => a + b, 0)

  return {
    mean: sum / n,
    median: n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)],
    p95: sorted[Math.ceil(n * 0.95) - 1],
    p99: sorted[Math.ceil(n * 0.99) - 1],
    min: sorted[0],
    max: sorted[n - 1],
    durations: sorted,
    iterations: n,
  }
}

/**
 * Jest expectation helper.  Call inside an `it()` block after `measurePerf`.
 * Fails the test if any threshold is exceeded.
 */
export function assertPerfThresholds(stats: PerfStats, thresholds: PerfThresholds): void {
  if (thresholds.meanMaxMs !== undefined) {
    expect(stats.mean).toBeLessThanOrEqual(thresholds.meanMaxMs)
  }
  if (thresholds.p95MaxMs !== undefined) {
    expect(stats.p95).toBeLessThanOrEqual(thresholds.p95MaxMs)
  }
  if (thresholds.maxMs !== undefined) {
    expect(stats.max).toBeLessThanOrEqual(thresholds.maxMs)
  }
}

/**
 * Creates a sample array of `size` elements filled with `value`.
 */
export function createSampleArray(size: number, value: number): number[] {
  return Array.from({ length: size }, () => value)
}
