/**
 * Shared performance test utilities for client page rendering benchmarks.
 * Provides helpers to measure component render times and interaction latencies.
 */

export interface RenderStats {
  mean: number
  median: number
  p95: number
  min: number
  max: number
  durations: number[]
  iterations: number
}

export interface RenderThresholds {
  /** Max acceptable mean render time in ms */
  meanMaxMs?: number
  /** Max acceptable p95 render time in ms */
  p95MaxMs?: number
  /** Max acceptable single render time in ms */
  maxMs?: number
}

function computeStats(durations: number[]): RenderStats {
  const sorted = [...durations].sort((a, b) => a - b)
  const n = sorted.length
  const sum = durations.reduce((a, b) => a + b, 0)

  return {
    mean: sum / n,
    median: n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)],
    p95: sorted[Math.ceil(n * 0.95) - 1],
    min: sorted[0],
    max: sorted[n - 1],
    durations: sorted,
    iterations: n,
  }
}

/**
 * Measure render duration of a function that performs rendering.
 * Runs `warmup` iterations before collecting `iterations` samples.
 */
export async function measureRender(
  fn: () => Promise<unknown> | void,
  iterations = 10,
  warmup = 3
): Promise<RenderStats> {
  for (let i = 0; i < warmup; i++) {
    await fn()
  }

  const durations: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    const end = performance.now()
    durations.push(end - start)
  }

  return computeStats(durations)
}

/**
 * Assert render time thresholds. Fails the test if exceeded.
 */
export function assertRenderThresholds(stats: RenderStats, thresholds: RenderThresholds): void {
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
 * Create a mock for the auth store.
 */
export function createMockAuthStore(overrides?: Record<string, unknown>) {
  return {
    isAuthenticated: false,
    isConnected: false,
    address: 'GABCDEF1234567890123456789012345678901234567890123456',
    walletType: 'freighter',
    biometric: {
      enabled: false,
      preferOverWallet: false,
      requireForPayments: false,
    },
    ...overrides,
  }
}
