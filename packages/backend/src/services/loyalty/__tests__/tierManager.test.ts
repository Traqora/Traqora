/**
 * Unit / integration tests for TierManager – idempotent loyalty tier
 * recalculation (issue #532).
 *
 * Tests prove:
 *  1. determineTier is a pure function (order-independent, stable).
 *  2. evaluateTier produces the correct tier for any account state.
 *  3. evaluateTier is idempotent: calling it multiple times settles to a
 *     stable state without producing duplicate tier-history entries.
 *  4. runId-based memoisation skips already-processed accounts.
 *  5. evaluateAllTiers / recalculateAllTiers are independent of account order.
 *  6. Error handling is preserved when an account is not found.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { TierManager } from "../tierManager";
import { LoyaltyStore } from "../store";
import { LoyaltyTier } from "../../../types/loyalty";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAccount(
  userId: string,
  totalPoints: number,
  lifetimeBookings: number,
  tier: LoyaltyTier = LoyaltyTier.BRONZE,
) {
  const now = new Date();
  return {
    userId,
    tier,
    totalPoints,
    availablePoints: totalPoints,
    lifetimeBookings,
    lifetimeSpent: 0,
    tierUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

// Reload a fresh LoyaltyStore singleton before each test
function freshStore(): LoyaltyStore {
  LoyaltyStore.resetForTesting();
  return LoyaltyStore.getInstance();
}

// ---------------------------------------------------------------------------
// determineTier – pure function behaviour
// ---------------------------------------------------------------------------

describe("TierManager.determineTier", () => {
  let manager: TierManager;

  beforeEach(() => {
    manager = new TierManager(freshStore());
  });

  it("returns BRONZE when points and bookings are zero", () => {
    expect(manager.determineTier(0, 0)).toBe(LoyaltyTier.BRONZE);
  });

  it("returns SILVER when thresholds are exactly met", () => {
    // SILVER: minPoints=1000, minBookings=5
    expect(manager.determineTier(1000, 5)).toBe(LoyaltyTier.SILVER);
  });

  it("returns GOLD when thresholds are exactly met", () => {
    // GOLD: minPoints=5000, minBookings=20
    expect(manager.determineTier(5000, 20)).toBe(LoyaltyTier.GOLD);
  });

  it("returns PLATINUM when thresholds are exactly met", () => {
    // PLATINUM: minPoints=20000, minBookings=50
    expect(manager.determineTier(20000, 50)).toBe(LoyaltyTier.PLATINUM);
  });

  it("requires both points AND bookings to qualify for a higher tier", () => {
    // Points qualify for SILVER but bookings do not
    expect(manager.determineTier(1000, 4)).toBe(LoyaltyTier.BRONZE);
    // Bookings qualify for SILVER but points do not
    expect(manager.determineTier(999, 5)).toBe(LoyaltyTier.BRONZE);
  });

  it("is deterministic: same inputs always produce the same output", () => {
    for (let i = 0; i < 5; i++) {
      expect(manager.determineTier(5000, 20)).toBe(LoyaltyTier.GOLD);
    }
  });

  it("is order-independent: calling with different inputs in any sequence is stable", () => {
    const cases: [number, number, LoyaltyTier][] = [
      [25000, 60, LoyaltyTier.PLATINUM],
      [0, 0, LoyaltyTier.BRONZE],
      [5000, 20, LoyaltyTier.GOLD],
      [1000, 5, LoyaltyTier.SILVER],
    ];
    // Shuffle order and re-run
    for (const [points, bookings, expected] of [...cases].reverse()) {
      expect(manager.determineTier(points, bookings)).toBe(expected);
    }
    for (const [points, bookings, expected] of cases) {
      expect(manager.determineTier(points, bookings)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// evaluateTier – correctness & idempotency
// ---------------------------------------------------------------------------

describe("TierManager.evaluateTier", () => {
  let store: LoyaltyStore;
  let manager: TierManager;

  beforeEach(() => {
    store = freshStore();
    manager = new TierManager(store);
  });

  it("upgrades a BRONZE account that now qualifies for SILVER", () => {
    store.updateAccount(makeAccount("u1", 1000, 5));
    const result = manager.evaluateTier("u1");
    expect(result.newTier).toBe(LoyaltyTier.SILVER);
    expect(result.changed).toBe(true);
  });

  it("does not change an account that is already on the correct tier", () => {
    store.updateAccount(makeAccount("u1", 1000, 5, LoyaltyTier.SILVER));
    const result = manager.evaluateTier("u1");
    expect(result.changed).toBe(false);
    expect(result.newTier).toBe(LoyaltyTier.SILVER);
  });

  it("is idempotent: calling evaluateTier multiple times settles to a stable state", () => {
    store.updateAccount(makeAccount("u1", 5000, 20));

    const r1 = manager.evaluateTier("u1");
    const r2 = manager.evaluateTier("u1");
    const r3 = manager.evaluateTier("u1");

    // First call should record a change (BRONZE → GOLD)
    expect(r1.changed).toBe(true);
    expect(r1.newTier).toBe(LoyaltyTier.GOLD);

    // Subsequent calls: tier is already correct, no change
    expect(r2.changed).toBe(false);
    expect(r2.newTier).toBe(LoyaltyTier.GOLD);
    expect(r3.changed).toBe(false);
    expect(r3.newTier).toBe(LoyaltyTier.GOLD);
  });

  it("does not create duplicate tier-history entries when called multiple times", () => {
    store.updateAccount(makeAccount("u2", 5000, 20));

    manager.evaluateTier("u2");
    manager.evaluateTier("u2");
    manager.evaluateTier("u2");

    const history = store.getTierHistory("u2");
    // The upgrade BRONZE→GOLD is one history entry; the stable calls add none
    const goldEntries = history.filter((h) => h.tier === LoyaltyTier.GOLD);
    expect(goldEntries.length).toBe(1);
  });

  it("handles a downgrade correctly when points fall below the current tier", () => {
    // Start at GOLD
    store.updateAccount(makeAccount("u3", 1500, 8, LoyaltyTier.GOLD));
    const result = manager.evaluateTier("u3");
    // 1500 pts / 8 bookings → SILVER
    expect(result.newTier).toBe(LoyaltyTier.SILVER);
    expect(result.changed).toBe(true);
  });

  it("throws when the account does not exist", () => {
    expect(() => manager.evaluateTier("nonexistent")).toThrow(
      "Loyalty account not found: nonexistent",
    );
  });

  // runId-based memoisation ---------------------------------------------------

  it("returns a cached result (skipped=true) when called twice with the same runId", () => {
    store.updateAccount(makeAccount("u4", 1000, 5));

    const r1 = manager.evaluateTier("u4", "run-abc");
    const r2 = manager.evaluateTier("u4", "run-abc");

    expect(r1.skipped).toBeUndefined();
    expect(r2.skipped).toBe(true);
    expect(r2.newTier).toBe(r1.newTier);
  });

  it("re-evaluates when a different runId is used", () => {
    store.updateAccount(makeAccount("u5", 1000, 5));

    const r1 = manager.evaluateTier("u5", "run-1");
    const r2 = manager.evaluateTier("u5", "run-2");

    // Both should be genuine evaluations (not skipped)
    expect(r1.skipped).toBeUndefined();
    expect(r2.skipped).toBeUndefined();
  });

  it("clears the run cache and allows re-evaluation", () => {
    store.updateAccount(makeAccount("u6", 1000, 5));

    manager.evaluateTier("u6", "run-x");
    manager.clearRunCache("run-x");
    const r2 = manager.evaluateTier("u6", "run-x");

    expect(r2.skipped).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluateAllTiers – batch correctness & order-independence
// ---------------------------------------------------------------------------

describe("TierManager.evaluateAllTiers", () => {
  let store: LoyaltyStore;
  let manager: TierManager;

  beforeEach(() => {
    store = freshStore();
    manager = new TierManager(store);
  });

  it("upgrades all eligible accounts in a single batch call", () => {
    store.updateAccount(makeAccount("a", 1000, 5));   // → SILVER
    store.updateAccount(makeAccount("b", 5000, 20));  // → GOLD
    store.updateAccount(makeAccount("c", 0, 0));      // stays BRONZE

    const changes = manager.evaluateAllTiers();

    expect(changes.length).toBe(2);
    expect(changes.find((r) => r.userId === "a")?.newTier).toBe(LoyaltyTier.SILVER);
    expect(changes.find((r) => r.userId === "b")?.newTier).toBe(LoyaltyTier.GOLD);
    expect(changes.find((r) => r.userId === "c")).toBeUndefined();
  });

  it("returns an empty array on a second call when all tiers are already correct", () => {
    store.updateAccount(makeAccount("a", 1000, 5));
    store.updateAccount(makeAccount("b", 5000, 20));

    manager.evaluateAllTiers();            // first pass: upgrades a and b
    const second = manager.evaluateAllTiers(); // second pass: nothing to change

    expect(second.length).toBe(0);
  });

  it("produces the same final tier state regardless of account insertion order", () => {
    const accounts = [
      makeAccount("x1", 20000, 50),  // PLATINUM
      makeAccount("x2", 5000, 20),   // GOLD
      makeAccount("x3", 1000, 5),    // SILVER
      makeAccount("x4", 0, 0),       // BRONZE
    ];

    // Forward order
    store = freshStore();
    manager = new TierManager(store);
    accounts.forEach((a) => store.updateAccount(a));
    manager.evaluateAllTiers();
    const forwardState = accounts.map((a) => store.getAccount(a.userId)!.tier);

    // Reverse order
    store = freshStore();
    manager = new TierManager(store);
    [...accounts].reverse().forEach((a) => store.updateAccount(a));
    manager.evaluateAllTiers();
    const reverseState = accounts.map((a) => store.getAccount(a.userId)!.tier);

    expect(forwardState).toEqual(reverseState);
  });
});

// ---------------------------------------------------------------------------
// recalculateAllTiers – idempotent batch API
// ---------------------------------------------------------------------------

describe("TierManager.recalculateAllTiers", () => {
  let store: LoyaltyStore;
  let manager: TierManager;

  beforeEach(() => {
    store = freshStore();
    manager = new TierManager(store);
  });

  it("returns the same changed list when called twice with the same runId", () => {
    store.updateAccount(makeAccount("r1", 1000, 5));
    store.updateAccount(makeAccount("r2", 5000, 20));

    const first = manager.recalculateAllTiers("batch-1");
    const second = manager.recalculateAllTiers("batch-1");

    // First pass: both upgraded → 2 changes
    expect(first.length).toBe(2);
    // Second pass with same runId: all already processed → memoised / empty
    expect(second.length).toBe(0);
  });

  it("processes all accounts fresh when a new runId is used", () => {
    store.updateAccount(makeAccount("r1", 1000, 5));

    manager.recalculateAllTiers("batch-A");
    const second = manager.recalculateAllTiers("batch-B");

    // batch-B is a fresh run; the tier is now SILVER (stable) so no change
    expect(second.length).toBe(0);
  });

  it("settles tier transitions to a stable state across repeated runs", () => {
    store.updateAccount(makeAccount("r1", 1000, 5));

    const runIds = ["run-1", "run-2", "run-3"];
    for (const id of runIds) {
      manager.recalculateAllTiers(id);
    }

    // Regardless of how many runs, the account should be at SILVER
    const account = store.getAccount("r1");
    expect(account?.tier).toBe(LoyaltyTier.SILVER);

    // And the tier-history should only have one SILVER entry
    const history = store.getTierHistory("r1");
    const silverEntries = history.filter((h) => h.tier === LoyaltyTier.SILVER);
    expect(silverEntries.length).toBe(1);
  });
});
