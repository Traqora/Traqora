import { LoyaltyTier } from '../../types/loyalty';
import { LoyaltyStore } from './store';
import { TierManager } from './tierManager';

function accountAt(store: LoyaltyStore, userId: string, totalPoints: number, lifetimeBookings: number) {
  const account = store.getOrCreateAccount(userId);
  account.totalPoints = totalPoints;
  account.lifetimeBookings = lifetimeBookings;
  store.updateAccount(account);
}

describe('TierManager', () => {
  beforeEach(() => {
    LoyaltyStore.resetForTesting();
  });

  it('recomputes the same account idempotently', () => {
    const store = LoyaltyStore.getInstance();
    const manager = new TierManager(store);
    accountAt(store, 'user-1', 5_000, 20);

    const first = manager.evaluateTier('user-1');
    const second = manager.evaluateTier('user-1');

    expect(first).toMatchObject({
      previousTier: LoyaltyTier.BRONZE,
      newTier: LoyaltyTier.GOLD,
      changed: true,
    });
    expect(second).toMatchObject({
      previousTier: LoyaltyTier.GOLD,
      newTier: LoyaltyTier.GOLD,
      changed: false,
    });
    expect(store.getTierHistory('user-1')).toHaveLength(1);
  });

  it('does not depend on the order in which accounts are evaluated', () => {
    const store = LoyaltyStore.getInstance();
    const manager = new TierManager(store);
    accountAt(store, 'user-a', 20_000, 50);
    accountAt(store, 'user-b', 1_000, 5);

    const firstRun = manager.evaluateAllTiers();
    const secondRun = manager.evaluateAllTiers();

    expect(firstRun.map((result) => result.newTier)).toEqual([
      LoyaltyTier.PLATINUM,
      LoyaltyTier.SILVER,
    ]);
    expect(secondRun).toEqual([]);
    expect(manager.determineTier(1_000, 5)).toBe(LoyaltyTier.SILVER);
    expect(manager.determineTier(20_000, 50)).toBe(LoyaltyTier.PLATINUM);
  });
});
