import { LoyaltyStore } from './store';
import { CampaignManager } from './campaignManager';
import { TierManager } from './tierManager';
import { PointsCalculator } from './pointsCalculator';
import { ExpirationHandler } from './expirationHandler';
import { RetroactiveCalculator } from './retroactiveCalculator';
import { ContractSync } from './contractSync';

export { LoyaltyStore } from './store';
export { CampaignManager, CreateCampaignInput } from './campaignManager';
export { TierManager, TierChangeResult } from './tierManager';
export { PointsCalculator } from './pointsCalculator';
export { ExpirationHandler, ExpirationResult } from './expirationHandler';
export { RetroactiveCalculator, RetroactiveResult } from './retroactiveCalculator';
export { ContractSync, SyncResult, OnChainAccount } from './contractSync';
export {
  TIER_CONFIGS,
  getTierConfig,
  getTierConfigsSorted,
  POINTS_EXPIRATION_MS,
  BASE_POINTS_PER_DOLLAR,
  POINTS_PER_DOLLAR_REDEMPTION,
} from './tierConfig';

/**
 * Convenience factory that wires up every loyalty service using the
 * singleton store. Call this once at application startup.
 */
export function createLoyaltyServices(store?: LoyaltyStore) {
  const s = store ?? LoyaltyStore.getInstance();
  const campaignManager = new CampaignManager(s);
  const tierManager = new TierManager(s);
  const pointsCalculator = new PointsCalculator(s, campaignManager, tierManager);
  const expirationHandler = new ExpirationHandler(s, tierManager);
  const retroactiveCalculator = new RetroactiveCalculator(s, pointsCalculator);
  const contractSync = new ContractSync(s);

  return {
    store: s,
    campaignManager,
    tierManager,
    pointsCalculator,
    expirationHandler,
    retroactiveCalculator,
    contractSync,
  };
}
