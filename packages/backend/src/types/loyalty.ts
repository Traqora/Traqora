export enum LoyaltyTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
}

export enum PointsTransactionType {
  EARNED = 'earned',
  REDEEMED = 'redeemed',
  BONUS = 'bonus',
  EXPIRED = 'expired',
}

export enum CampaignType {
  SEASONAL = 'seasonal',
  PROMOTIONAL = 'promotional',
}

export interface TierConfig {
  tier: LoyaltyTier;
  minPoints: number;
  minBookings: number;
  pointsMultiplier: number;
  bonusPercentage: number;
}

export interface LoyaltyAccount {
  userId: string;
  tier: LoyaltyTier;
  totalPoints: number;
  availablePoints: number;
  lifetimeBookings: number;
  lifetimeSpent: number;
  tierUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PointsTransaction {
  id: string;
  userId: string;
  points: number;
  type: PointsTransactionType;
  bookingId?: string;
  campaignId?: string;
  description: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  multiplier: number;
  flatBonus: number;
  startDate: Date;
  endDate: Date;
  active: boolean;
  conditions: CampaignConditions;
  createdAt: Date;
}

export interface CampaignConditions {
  minBookingAmount?: number;
  applicableTiers?: LoyaltyTier[];
  maxUsesPerUser?: number;
  applicableRoutes?: string[];
}

export interface BookingForPoints {
  bookingId: string;
  userId: string;
  amount: number;
  completedAt: Date;
  route?: string;
}

export interface PointsCalculationResult {
  basePoints: number;
  tierMultiplierApplied: number;
  tierBonusPoints: number;
  campaignBonusPoints: number;
  totalPoints: number;
  breakdown: PointsBreakdownItem[];
}

export interface PointsBreakdownItem {
  source: string;
  points: number;
  description: string;
}

export interface PointsHistoryQuery {
  userId: string;
  page: number;
  limit: number;
  type?: PointsTransactionType;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
