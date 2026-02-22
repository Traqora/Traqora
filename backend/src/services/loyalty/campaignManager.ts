import { v4 as uuidv4 } from 'uuid';
import {
  Campaign,
  CampaignType,
  CampaignConditions,
  BookingForPoints,
  LoyaltyTier,
} from '../../types/loyalty';
import { LoyaltyStore } from './store';
import { logger } from '../../utils/logger';

export interface CreateCampaignInput {
  name: string;
  type: CampaignType;
  multiplier: number;
  flatBonus: number;
  startDate: Date;
  endDate: Date;
  conditions?: CampaignConditions;
}

export class CampaignManager {
  private store: LoyaltyStore;

  constructor(store: LoyaltyStore) {
    this.store = store;
  }

  /** Create and persist a new bonus-points campaign. */
  createCampaign(input: CreateCampaignInput): Campaign {
    if (input.multiplier < 0) {
      throw new Error('Campaign multiplier cannot be negative');
    }
    if (input.flatBonus < 0) {
      throw new Error('Campaign flat bonus cannot be negative');
    }
    if (input.endDate <= input.startDate) {
      throw new Error('Campaign end date must be after start date');
    }

    const campaign: Campaign = {
      id: uuidv4(),
      name: input.name.trim(),
      type: input.type,
      multiplier: input.multiplier,
      flatBonus: input.flatBonus,
      startDate: input.startDate,
      endDate: input.endDate,
      active: true,
      conditions: input.conditions ?? {},
      createdAt: new Date(),
    };

    this.store.upsertCampaign(campaign);
    logger.info({ msg: 'Campaign created', campaignId: campaign.id, name: campaign.name });
    return campaign;
  }

  /** Mark an existing campaign as inactive. */
  deactivateCampaign(campaignId: string): void {
    const campaign = this.store.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }
    campaign.active = false;
    this.store.upsertCampaign(campaign);
    logger.info({ msg: 'Campaign deactivated', campaignId });
  }

  getActiveCampaigns(at?: Date): Campaign[] {
    return this.store.getActiveCampaigns(at);
  }

  /**
   * Filter active campaigns down to those applicable for a given booking
   * based on amount thresholds, tier eligibility, and route constraints.
   */
  getApplicableCampaigns(
    booking: BookingForPoints,
    userTier: LoyaltyTier,
    at?: Date,
  ): Campaign[] {
    return this.store.getActiveCampaigns(at).filter(campaign => {
      const cond = campaign.conditions;

      if (cond.minBookingAmount !== undefined && booking.amount < cond.minBookingAmount) {
        return false;
      }

      if (cond.applicableTiers && cond.applicableTiers.length > 0) {
        if (!cond.applicableTiers.includes(userTier)) {
          return false;
        }
      }

      if (cond.applicableRoutes && cond.applicableRoutes.length > 0 && booking.route) {
        if (!cond.applicableRoutes.includes(booking.route)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate the bonus points granted by a single campaign.
   *
   * - `multiplier > 1` grants extra points equal to `base * (multiplier - 1)`
   * - `flatBonus` is added on top unconditionally
   */
  calculateCampaignBonus(basePoints: number, campaign: Campaign): number {
    let bonus = 0;

    if (campaign.multiplier > 1) {
      bonus += Math.floor(basePoints * (campaign.multiplier - 1));
    }

    bonus += campaign.flatBonus;
    return bonus;
  }
}
