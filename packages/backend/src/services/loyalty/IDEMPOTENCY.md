# Loyalty Tier Recalculation Idempotency

## Overview

The loyalty tier recalculation system is designed to be idempotent, ensuring that repeated recalculation operations with the same inputs produce consistent results without unintended side effects. This is critical for:

- **Retry-safe scheduled jobs**: Batch recalculation jobs can be retried without creating duplicate tier changes
- **Order-independent processing**: The final tier state is deterministic regardless of account processing order
- **Idempotent single-account evaluation**: Calling `evaluateTier` multiple times for the same account settles to a stable state

## Architecture

### Core Components

1. **TierManager** (`tierManager.ts`): Main service for tier evaluation and recalculation
2. **LoyaltyStore** (`store.ts`): In-memory data store for accounts and tier history
3. **TierConfig** (`tierConfig.ts`): Tier threshold configurations matching on-chain logic

### Idempotency Mechanisms

The system implements **two levels of idempotency**:

#### 1. Functional Idempotency (No runId)

Even without a `runId`, the system is idempotent in the "same input → same output" sense:

```typescript
// If the account already has the correct tier, no changes are made
const result = manager.evaluateTier(userId);
// result.changed === false when tier is already correct
```

**How it works:**
- `determineTier()` is a pure function: same inputs always produce the same output
- Store mutations only occur when `newTier !== previousTier`
- If the tier is already correct, the store is not touched

**Use case:** Single-account evaluations where you don't need memoisation across calls.

#### 2. RunId-Based Memoisation (With runId)

When a `runId` is provided, results are memoised for the duration of the `TierManager` instance:

```typescript
// First call: performs evaluation and caches result
const r1 = manager.evaluateTier(userId, "batch-2024-10-16");
// r1.skipped === undefined

// Second call with same runId: returns cached result
const r2 = manager.evaluateTier(userId, "batch-2024-10-16");
// r2.skipped === true, r2.newTier === r1.newTier
```

**How it works:**
- A `Map<string, TierChangeResult>` tracks processed `(runId, userId)` pairs
- Cache key format: `"<runId>:<userId>"`
- Cached results return with `skipped: true` to indicate memoisation
- Store is not re-read or re-written for cached results

**Use case:** Batch recalculation jobs where you need to avoid re-processing accounts within the same run.

## API Reference

### evaluateTier(userId: string, runId?: string): TierChangeResult

Evaluate and persist a tier change for a single user.

**Parameters:**
- `userId`: The user's unique identifier
- `runId`: Optional identifier for the recalculation run (enables memoisation)

**Returns:** `TierChangeResult`
```typescript
{
  userId: string;
  previousTier: LoyaltyTier;
  newTier: LoyaltyTier;
  changed: boolean;
  skipped?: boolean;  // Set to true if result was memoised
}
```

**Behavior:**
- Without `runId`: Always evaluates, but only mutates store if tier changes
- With `runId`: Returns cached result if already processed in this run
- Throws if account does not exist

**Example:**
```typescript
// Evaluate a single account (no memoisation)
const result = manager.evaluateTier("user-123");
if (result.changed) {
  console.log(`User upgraded from ${result.previousTier} to ${result.newTier}`);
}

// Evaluate with memoisation (batch job)
const batchResult = manager.evaluateTier("user-123", "batch-2024-10-16");
if (batchResult.skipped) {
  console.log("Already processed in this batch run");
}
```

### recalculateAllTiers(runId: string): TierChangeResult[]

Batch-evaluate all accounts under a single runId.

**Parameters:**
- `runId`: Required identifier for the recalculation run

**Returns:** Array of `TierChangeResult` for accounts that actually changed (filtered out unchanged and skipped results)

**Behavior:**
- First call with a `runId`: Evaluates all accounts, returns changes
- Subsequent calls with same `runId`: Returns empty array (all memoised)
- Different `runId`: Fresh evaluation for all accounts

**Example:**
```typescript
// First run: processes all accounts
const changes1 = manager.recalculateAllTiers("batch-2024-10-16-001");
console.log(`Changed ${changes1.length} accounts`);

// Retry with same runId: no-op
const changes2 = manager.recalculateAllTiers("batch-2024-10-16-001");
console.log(`Changed ${changes2.length} accounts`); // 0

// New run: fresh evaluation
const changes3 = manager.recalculateAllTiers("batch-2024-10-16-002");
```

### clearRunCache(runId: string): void

Discard memoisation cache for a given runId.

**Use case:** Tests or when starting a fresh recalculation batch.

**Example:**
```typescript
manager.evaluateTier("user-123", "run-1");
manager.clearRunCache("run-1");
const result = manager.evaluateTier("user-123", "run-1");
// result.skipped === undefined (re-evaluated)
```

### evaluateAllTiers(runId?: string): TierChangeResult[]

Lower-level batch evaluation (used internally by `recalculateAllTiers`).

**Behavior:**
- Similar to `recalculateAllTiers` but allows optional `runId`
- Filters out both unchanged and skipped results

## Usage Patterns

### Pattern 1: Scheduled Batch Recalculation

For cron jobs or scheduled tasks that need to recalculate all tiers:

```typescript
// Generate a unique runId for each scheduled execution
const runId = `scheduled-${new Date().toISOString()}`;

try {
  const changes = manager.recalculateAllTiers(runId);
  logger.info(`Recalculation complete: ${changes.length} tier changes`);

  // If the job fails and you retry with the same runId,
  // it will be a no-op (safe for retries)
} catch (error) {
  logger.error({ msg: 'Recalculation failed', runId, error });
  // Retry with the same runId - idempotent
  throw error;
}
```

### Pattern 2: Post-Expiration Batch Processing

After bulk points expiration, recalculate tiers for affected users:

```typescript
const runId = `expiration-batch-${expirationDate}`;

// First, expire points
expirationHandler.processExpirations(beforeDate);

// Then recalculate tiers (accounts may have downgraded)
const tierChanges = manager.recalculateAllTiers(runId);
logger.info(`Post-expiration tier changes: ${tierChanges.length}`);
```

### Pattern 3: Single-Account On-Demand Evaluation

When a user's points change (e.g., after a booking), evaluate their tier:

```typescript
// No runId needed for single-account evaluation
const result = manager.evaluateTier(userId);

if (result.changed) {
  // Notify user of tier change
  notificationService.sendTierChangeEmail(userId, result);
}
```

### Pattern 4: Testing with Cache Control

In tests, you may want to verify re-evaluation behavior:

```typescript
it('re-evaluates after cache clear', () => {
  manager.evaluateTier('user-1', 'run-test');
  manager.clearRunCache('run-test');
  const result = manager.evaluateTier('user-1', 'run-test');
  expect(result.skipped).toBeUndefined();
});
```

## Properties and Guarantees

### 1. Order Independence

The final tier state is deterministic regardless of account processing order:

```typescript
// Process accounts in forward order
accounts.forEach(a => manager.evaluateTier(a.userId));

// Process accounts in reverse order
[...accounts].reverse().forEach(a => manager.evaluateTier(a.userId));

// Both produce the same final tier state
```

**Why:** `determineTier()` is a pure function that only depends on the account's current points and bookings, not on any other accounts.

### 2. Stable State Convergence

Repeated calls to `evaluateTier` (without runId) converge to a stable state:

```typescript
// First call: BRONZE → GOLD (changed: true)
const r1 = manager.evaluateTier(userId);

// Second call: GOLD → GOLD (changed: false)
const r2 = manager.evaluateTier(userId);

// Third call: GOLD → GOLD (changed: false)
const r3 = manager.evaluateTier(userId);
```

### 3. No Duplicate Tier History

Multiple evaluations don't create duplicate tier-history entries:

```typescript
manager.evaluateTier(userId);
manager.evaluateTier(userId);
manager.evaluateTier(userId);

const history = store.getTierHistory(userId);
// Only one entry for the actual tier change
```

### 4. Retry Safety

Batch recalculation with a runId is safe to retry:

```typescript
// First attempt
const changes1 = manager.recalculateAllTiers('run-abc');
// 5 accounts changed

// Job fails, retry with same runId
const changes2 = manager.recalculateAllTiers('run-abc');
// 0 accounts changed (all memoised)
```

## Current Limitations

### In-Memory Memoisation

The current implementation uses **in-memory memoisation** via a JavaScript `Map`. This has important implications:

**Scope:**
- Memoisation only persists within a single `TierManager` instance lifecycle
- If the instance is recreated (new HTTP request, worker restart, etc.), the cache is lost
- Not suitable for distributed systems or multi-process deployments

**Suitable for:**
- Single-process applications
- Monolithic deployments with one instance
- Testing environments
- Short-lived batch jobs

**Not suitable for:**
- Multi-instance deployments (e.g., Kubernetes pods, serverless functions)
- Long-running processes that may restart
- Horizontal scaling scenarios

### Data Store Limitations

The `LoyaltyStore` is currently an in-memory implementation:

```typescript
/**
 * In-memory event store for loyalty data.
 * Swap this implementation with a database-backed store for production use.
 */
export class LoyaltyStore { ... }
```

For production, you would need to:
1. Replace `LoyaltyStore` with a database-backed implementation
2. Add persistent idempotency (e.g., database idempotency keys, Redis, etc.)
3. Implement proper transaction handling

## Migration Path for Production

To make the idempotency robust for production deployments:

### Option 1: Database-Backed Idempotency Keys

Store processed `(runId, userId)` pairs in the database:

```sql
CREATE TABLE tier_recalculation_runs (
  run_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP NOT NULL,
  result_tier VARCHAR(50) NOT NULL,
  PRIMARY KEY (run_id, user_id)
);
```

**Implementation sketch:**
```typescript
class TierManager {
  async evaluateTier(userId: string, runId?: string): Promise<TierChangeResult> {
    if (runId) {
      const cached = await db.getProcessedResult(runId, userId);
      if (cached) {
        return { ...cached, skipped: true };
      }
    }

    // ... evaluation logic ...

    if (runId) {
      await db.markProcessed(runId, userId, result);
    }

    return result;
  }
}
```

### Option 2: Distributed Cache

Use Redis or another distributed cache for memoisation:

```typescript
class TierManager {
  private cache: RedisClient;

  async evaluateTier(userId: string, runId?: string): Promise<TierChangeResult> {
    if (runId) {
      const cacheKey = `tier-recalc:${runId}:${userId}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return { ...JSON.parse(cached), skipped: true };
      }
    }

    // ... evaluation logic ...

    if (runId) {
      const cacheKey = `tier-recalc:${runId}:${userId}`;
      await this.cache.setex(cacheKey, 86400, JSON.stringify(result)); // 24h TTL
    }

    return result;
  }
}
```

### Option 3: Idempotency Keys Pattern

Use a deterministic idempotency key based on account state:

```typescript
class TierManager {
  private getIdempotencyKey(userId: string, accountState: LoyaltyAccount): string {
    // Hash of the account's points, bookings, and current tier
    return crypto
      .createHash('sha256')
      .update(`${userId}:${accountState.totalPoints}:${accountState.lifetimeBookings}:${accountState.tier}`)
      .digest('hex');
  }

  async evaluateTier(userId: string): Promise<TierChangeResult> {
    const account = this.store.getAccount(userId);
    const idempotencyKey = this.getIdempotencyKey(userId, account);

    // Check if this exact state has already been processed
    const alreadyProcessed = await db.checkIdempotencyKey(idempotencyKey);
    if (alreadyProcessed) {
      return { ...alreadyProcessed, skipped: true };
    }

    // ... evaluation logic ...

    await db.recordIdempotencyKey(idempotencyKey, result);
    return result;
  }
}
```

## Testing

The test suite (`tierManager.test.ts`) comprehensively verifies idempotency:

### Test Coverage

1. **Pure function behavior**: `determineTier` is deterministic and order-independent
2. **Single-account idempotency**: `evaluateTier` converges to stable state
3. **No duplicate history**: Multiple calls don't create duplicate tier-history entries
4. **RunId memoisation**: Cached results return with `skipped: true`
5. **Batch idempotency**: `recalculateAllTiers` with same runId is a no-op
6. **Cache clearing**: `clearRunCache` allows re-evaluation
7. **Stable convergence**: Repeated runs settle to the same final state

### Running Tests

```bash
# Run loyalty tier manager tests
npm test -- tierManager.test.ts

# Run with coverage
npm test -- --coverage tierManager.test.ts
```

## Best Practices

### 1. Always Use Unique RunIds for Scheduled Jobs

```typescript
// Good: unique per execution
const runId = `scheduled-${new Date().toISOString()}`;

// Bad: static runId (never changes)
const runId = 'scheduled-job'; // ❌ Never changes, memoisation persists
```

### 2. Use clearRunCache in Tests

```typescript
beforeEach(() => {
  manager.clearRunCache('test-run');
});
```

### 3. Handle the `skipped` Flag

```typescript
const result = manager.evaluateTier(userId, runId);
if (result.skipped) {
  // Don't send notifications or side effects for memoised results
  return;
}
if (result.changed) {
  // Send notification for actual changes
  sendTierChangeNotification(result);
}
```

### 4. Log RunIds for Debugging

```typescript
logger.info({
  msg: 'Starting tier recalculation',
  runId,
  timestamp: new Date().toISOString(),
});
```

### 5. Set TTL on Persistent Cache

If using distributed cache, set a reasonable TTL:

```typescript
// Cache for 24 hours
await cache.setex(cacheKey, 86400, JSON.stringify(result));
```

## Monitoring and Observability

### Key Metrics to Track

1. **Recalculation duration**: How long batch jobs take
2. **Accounts processed**: Total accounts in each run
3. **Tier changes**: Number of actual tier changes per run
4. **Cache hit rate**: Percentage of memoised results (indicates retries)
5. **Failed evaluations**: Accounts that couldn't be processed

### Example Logging

```typescript
logger.info({
  msg: 'Tier recalculation complete',
  runId,
  accountsProcessed: allAccounts.length,
  tierChanges: changes.length,
  skipped: cachedCount,
  durationMs: Date.now() - startTime,
});
```

## Troubleshooting

### Issue: Recalculation Creates Duplicate Tier Changes

**Cause:** Not using a `runId` or reusing the same `runId` across different logical runs.

**Solution:** Generate a unique `runId` for each logical recalculation:

```typescript
const runId = `recalc-${Date.now()}-${randomUUID()}`;
```

### Issue: Cached Results Stale After Data Changes

**Cause:** In-memory cache not cleared after manual data changes.

**Solution:** Use `clearRunCache` when needed:

```typescript
manager.clearRunCache(runId);
```

### Issue: Memoisation Lost After Process Restart

**Cause:** In-memory cache doesn't persist across restarts (expected behavior).

**Solution:** Implement persistent idempotency (see Migration Path above).

## Related Documentation

- [Tier Configuration](./tierConfig.ts) - Tier thresholds and multipliers
- [Loyalty Store](./store.ts) - Data storage implementation
- [Points Calculator](./pointsCalculator.ts) - Points earning and burning logic
- [Expiration Handler](./expirationHandler.ts) - Points expiration processing

## References

- Issue #532: Loyalty tier recalculation idempotency
- Test suite: `tierManager.test.ts`
