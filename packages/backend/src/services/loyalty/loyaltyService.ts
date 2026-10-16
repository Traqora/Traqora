import { LoyaltyStore } from './store';
import { LoyaltyTier } from '../../types/loyalty';

export class LoyaltyService {
  private store = LoyaltyStore.getInstance();

  getBalance(walletAddress: string): number {
    return this.store.getOrCreateAccount(walletAddress).availablePoints;
  }

  addPoints(walletAddress: string, points: number): number {
    const account = this.store.getOrCreateAccount(walletAddress);
    account.totalPoints += points;
    account.availablePoints += points;
    this.store.updateAccount(account);
    return account.availablePoints;
  }

  redeemPoints(walletAddress: string, points: number): number {
    const account = this.store.getOrCreateAccount(walletAddress);
    if (account.availablePoints < points) {
      throw new Error('Insufficient points');
    }
    account.availablePoints -= points;
    this.store.updateAccount(account);
    return account.availablePoints;
  }

  setTier(walletAddress: string, tier: string): string {
    const account = this.store.getOrCreateAccount(walletAddress);
    account.tier = tier as LoyaltyTier;
    this.store.updateAccount(account);
    return account.tier;
  }

  getTier(walletAddress: string): string | undefined {
    const account = this.store.getAccount(walletAddress);
    return account?.tier;
  }
}

export const loyaltyService = new LoyaltyService();
