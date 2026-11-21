// @ts-ignore
import { logger } from '../utils/logger';
import { AppDataSource } from '../db/dataSource';
import { Referral } from '../db/entities/Referral';

export interface FraudCheckResult {
  isFraudulent: boolean;
  riskScore: number; // 0-100
  reasons: string[];
  blockAction: boolean;
}

export interface ReferralContext {
  referrerId: string;
  referrerEmail?: string;
  referrerWallet?: string;
  referredEmail?: string;
  referredWallet?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  referrerAccountAge?: number; // days
  referrerTotalReferrals?: number;
  referrerSuccessfulReferrals?: number;
  referrerTotalBookings?: number;
  referrerTotalSpent?: number; // cents
  referredUserId?: string; // for referral ring detection
}

export class ReferralFraudDetection {
  private readonly thresholds = {
    HIGH_RISK_SCORE: 70,
    BLOCK_RISK_SCORE: 90,
    MAX_REFERRALS_PER_HOUR: 10,
    MAX_REFERRALS_PER_DAY: 50,
    MAX_REFERRALS_PER_WEEK: 200,
    MAX_REFERRALS_NEW_ACCOUNT: 5, // for accounts < 7 days old
    MIN_ACCOUNT_AGE_TO_REFER: 7, // days
    MIN_BOOKINGS_TO_REFER: 1,
    MIN_SPENT_TO_REFER: 1000, // cents ($10)
    SAME_IP_THRESHOLD: 3, // max referrals from same IP in 24h
    EMAIL_SIMILARITY_THRESHOLD: 0.85, // Levenshtein distance
    MAX_SAME_DEVICE_REFERRALS: 10, // per week
    MAX_GEOGRAPHIC_REGIONS: 5, // different /16 networks per week
    MIN_CONVERSION_TIME_MS: 5 * 60 * 1000, // 5 minutes
  };

  /**
   * Main fraud detection method - runs all heuristics
   */
  async detectFraud(context: ReferralContext): Promise<FraudCheckResult> {
    const checks = [
      this.checkAccountAge,
      this.checkReferralVelocity,
      this.checkActivityThresholds,
      this.checkSameIPPattern,
      this.checkEmailSimilarity,
      this.checkWalletSimilarity,
      this.checkSelfReferral,
      this.checkSuspiciousTiming,
      this.checkDeviceFingerprinting,
      this.checkGeographicPattern,
      this.checkReferralRing,
      this.checkImmediateConversion,
    ];

    const results = await Promise.all(
      checks.map(check => check(context))
    );

    const riskScore = this.calculateRiskScore(results);
    const reasons = results.filter(r => r.isFraudulent).map(r => r.reason);
    const blockAction = riskScore >= this.thresholds.BLOCK_RISK_SCORE;

    if (riskScore >= this.thresholds.HIGH_RISK_SCORE) {
      logger.warn('High-risk referral detected', {
        referrerId: context.referrerId,
        riskScore,
        reasons,
        blockAction,
      });
    }

    return {
      isFraudulent: riskScore >= this.thresholds.HIGH_RISK_SCORE,
      riskScore,
      reasons,
      blockAction,
    };
  }

  /**
   * Heuristic 1: Account Age Check
   * New accounts (< 7 days) are limited in referrals
   */
  private async checkAccountAge(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const accountAge = context.referrerAccountAge || 0;

    if (accountAge < this.thresholds.MIN_ACCOUNT_AGE_TO_REFER) {
      // Check if they've exceeded the new account limit
      const referrals = context.referrerTotalReferrals || 0;
      if (referrals > this.thresholds.MAX_REFERRALS_NEW_ACCOUNT) {
        return {
          isFraudulent: true,
          reason: `New account (${accountAge} days) exceeded referral limit of ${this.thresholds.MAX_REFERRALS_NEW_ACCOUNT}`,
          score: 50,
        };
      }
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 2: Referral Velocity Check
   * Detect rapid-fire referrals
   */
  private async checkReferralVelocity(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const totalReferrals = context.referrerTotalReferrals || 0;

    // Check hourly rate (would need time-series data in production)
    // For now, we check daily/weekly limits
    if (totalReferrals > this.thresholds.MAX_REFERRALS_PER_DAY) {
      return {
        isFraudulent: true,
        reason: `Exceeded daily referral limit of ${this.thresholds.MAX_REFERRALS_PER_DAY}`,
        score: 60,
      };
    }

    if (totalReferrals > this.thresholds.MAX_REFERRALS_PER_WEEK) {
      return {
        isFraudulent: true,
        reason: `Exceeded weekly referral limit of ${this.thresholds.MAX_REFERRALS_PER_WEEK}`,
        score: 80,
      };
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 3: Activity Thresholds
   * Require minimum bookings and spend before allowing referrals
   */
  private async checkActivityThresholds(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const bookings = context.referrerTotalBookings || 0;
    const spent = context.referrerTotalSpent || 0;

    if (bookings < this.thresholds.MIN_BOOKINGS_TO_REFER) {
      return {
        isFraudulent: true,
        reason: `Insufficient bookings (${bookings}) to refer (minimum: ${this.thresholds.MIN_BOOKINGS_TO_REFER})`,
        score: 40,
      };
    }

    if (spent < this.thresholds.MIN_SPENT_TO_REFER) {
      return {
        isFraudulent: true,
        reason: `Insufficient spend ($${spent / 100}) to refer (minimum: $${this.thresholds.MIN_SPENT_TO_REFER / 100})`,
        score: 30,
      };
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 4: Same IP Pattern
   * Detect multiple referrals from the same IP
   */
  private async checkSameIPPattern(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const ipAddress = context.ipAddress;

    if (!ipAddress) {
      return { isFraudulent: false, reason: '', score: 0 };
    }

    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const referralRepo = AppDataSource.getRepository(Referral);

      // Count referrals from same IP in the last 24 hours
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      const ipCount = await referralRepo
        .createQueryBuilder('referral')
        .where('referral.ipAddress = :ipAddress', { ipAddress })
        .andWhere('referral.createdAt >= :yesterday', { yesterday })
        .getCount();

      if (ipCount >= this.thresholds.SAME_IP_THRESHOLD) {
        return {
          isFraudulent: true,
          reason: `Multiple referrals (${ipCount}) from same IP address in 24 hours`,
          score: 65,
        };
      }

      return { isFraudulent: false, reason: '', score: 0 };
    } catch (error) {
      logger.error('Error checking IP pattern', { error });
      return { isFraudulent: false, reason: '', score: 0 };
    }
  }

  /**
   * Heuristic 5: Email Similarity
   * Detect similar email addresses (potential fake accounts)
   */
  private async checkEmailSimilarity(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const referrerEmail = context.referrerEmail;
    const referredEmail = context.referredEmail;

    if (!referrerEmail || !referredEmail) {
      return { isFraudulent: false, reason: '', score: 0 };
    }

    const similarity = this.calculateLevenshteinSimilarity(referrerEmail, referredEmail);

    if (similarity > this.thresholds.EMAIL_SIMILARITY_THRESHOLD) {
      return {
        isFraudulent: true,
        reason: `Email addresses too similar (${(similarity * 100).toFixed(1)}% match)`,
        score: 55,
      };
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 6: Wallet Similarity
   * Detect similar wallet addresses (potential controlled accounts)
   */
  private async checkWalletSimilarity(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const referrerWallet = context.referrerWallet;
    const referredWallet = context.referredWallet;

    if (!referrerWallet || !referredWallet) {
      return { isFraudulent: false, reason: '', score: 0 };
    }

    // Check if wallets are identical
    if (referrerWallet === referredWallet) {
      return {
        isFraudulent: true,
        reason: 'Referrer and referred wallets are identical',
        score: 100,
      };
    }

    // Check similarity (first few characters often indicate same source)
    const prefixLength = 8;
    if (referrerWallet.slice(0, prefixLength) === referredWallet.slice(0, prefixLength)) {
      return {
        isFraudulent: true,
        reason: 'Wallet addresses share suspicious prefix',
        score: 70,
      };
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 7: Self-Referral Detection
   * Check if referrer is referring themselves
   */
  private async checkSelfReferral(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const referrerEmail = context.referrerEmail;
    const referredEmail = context.referredEmail;
    const referrerWallet = context.referrerWallet;
    const referredWallet = context.referredWallet;

    if (referrerEmail && referredEmail && referrerEmail.toLowerCase() === referredEmail.toLowerCase()) {
      return {
        isFraudulent: true,
        reason: 'Self-referral detected (same email)',
        score: 100,
      };
    }

    if (referrerWallet && referredWallet && referrerWallet === referredWallet) {
      return {
        isFraudulent: true,
        reason: 'Self-referral detected (same wallet)',
        score: 100,
      };
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 8: Suspicious Timing
   * Detect referrals made at unusual times or patterns
   */
  private async checkSuspiciousTiming(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const hour = context.timestamp.getHours();

    // Flag referrals between 2 AM - 5 AM (unusual for legitimate users)
    if (hour >= 2 && hour <= 5) {
      return {
        isFraudulent: true,
        reason: 'Referral made during unusual hours (2 AM - 5 AM)',
        score: 20,
      };
    }

    return { isFraudulent: false, reason: '', score: 0 };
  }

  /**
   * Heuristic 9: Device Fingerprinting
   * Detect referrals from similar devices (same user agent, screen resolution, etc.)
   */
  private async checkDeviceFingerprinting(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const userAgent = context.userAgent;

    if (!userAgent) {
      return { isFraudulent: false, reason: '', score: 0 };
    }

    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const referralRepo = AppDataSource.getRepository(Referral);

      // Count referrals with same user agent from same referrer in last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const sameDeviceCount = await referralRepo
        .createQueryBuilder('referral')
        .where('referral.referrerId = :referrerId', { referrerId: context.referrerId })
        .andWhere('referral.userAgent = :userAgent', { userAgent })
        .andWhere('referral.createdAt >= :weekAgo', { weekAgo })
        .getCount();

      // More than 10 referrals from same device in a week is suspicious
      if (sameDeviceCount > this.thresholds.MAX_SAME_DEVICE_REFERRALS) {
        return {
          isFraudulent: true,
          reason: `High volume of referrals (${sameDeviceCount}) from same device in 7 days`,
          score: 45,
        };
      }

      return { isFraudulent: false, reason: '', score: 0 };
    } catch (error) {
      logger.error('Error checking device fingerprint', { error });
      return { isFraudulent: false, reason: '', score: 0 };
    }
  }

  /**
   * Heuristic 10: Geographic Pattern
   * Detect referrals from IPs in different geographic regions (possible VPN/proxy)
   */
  private async checkGeographicPattern(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    const ipAddress = context.ipAddress;

    if (!ipAddress) {
      return { isFraudulent: false, reason: '', score: 0 };
    }

    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const referralRepo = AppDataSource.getRepository(Referral);

      // Get recent referrals from this referrer
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentReferrals = await referralRepo
        .createQueryBuilder('referral')
        .select(['referral.ipAddress'])
        .where('referral.referrerId = :referrerId', { referrerId: context.referrerId })
        .andWhere('referral.createdAt >= :weekAgo', { weekAgo })
        .limit(20)
        .getMany();

      if (recentReferrals.length < 3) {
        return { isFraudulent: false, reason: '', score: 0 };
      }

      // Simple check: if IPs are from very different ranges (first octet differs significantly)
      const ipPrefixes = recentReferrals
        .map(r => r.ipAddress?.split('.').slice(0, 2).join('.'))
        .filter(Boolean);

      const uniquePrefixes = new Set(ipPrefixes);

      // If IPs from more than 5 different /16 networks in a week, suspicious
      if (uniquePrefixes.size > this.thresholds.MAX_GEOGRAPHIC_REGIONS) {
        return {
          isFraudulent: true,
          reason: `Referrals from ${uniquePrefixes.size} different geographic regions in 7 days (possible VPN/proxy)`,
          score: 50,
        };
      }

      return { isFraudulent: false, reason: '', score: 0 };
    } catch (error) {
      logger.error('Error checking geographic pattern', { error });
      return { isFraudulent: false, reason: '', score: 0 };
    }
  }

  /**
   * Heuristic 11: Referral Ring Detection
   * Detect circular referral patterns (A refers B, B refers C, C refers A)
   */
  private async checkReferralRing(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    if (!context.referredUserId) {
      return { isFraudulent: false, reason: '', score: 0 };
    }

    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const referralRepo = AppDataSource.getRepository(Referral);

      // Check if the referred user has also made referrals
      const referredUserReferrals = await referralRepo
        .createQueryBuilder('referral')
        .select(['referral.referredWallet', 'referral.referredEmail'])
        .where('referral.referrerId = :referredUserId', { referredUserId: context.referredUserId })
        .limit(10)
        .getMany();

      if (referredUserReferrals.length === 0) {
        return { isFraudulent: false, reason: '', score: 0 };
      }

      // Check if any of those referrals point back to the original referrer
      const ringDetected = referredUserReferrals.some(r =>
        r.referredWallet === context.referrerWallet ||
        (r.referredEmail && context.referrerEmail && r.referredEmail.toLowerCase() === context.referrerEmail.toLowerCase())
      );

      if (ringDetected) {
        return {
          isFraudulent: true,
          reason: 'Circular referral pattern detected (referral ring)',
          score: 85,
        };
      }

      // Check for chain referrals (A refers B, B refers C, C refers D)
      if (referredUserReferrals.length >= 3) {
        return {
          isFraudulent: true,
          reason: 'Possible referral chain/ring detected',
          score: 60,
        };
      }

      return { isFraudulent: false, reason: '', score: 0 };
    } catch (error) {
      logger.error('Error checking referral ring', { error });
      return { isFraudulent: false, reason: '', score: 0 };
    }
  }

  /**
   * Heuristic 12: Immediate Conversion Pattern
   * Detect referrals that convert immediately (suspicious automation)
   */
  private async checkImmediateConversion(context: ReferralContext): Promise<{ isFraudulent: boolean; reason: string; score: number }> {
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const referralRepo = AppDataSource.getRepository(Referral);

      // Get recent completed referrals from this referrer
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const completedReferrals = await referralRepo
        .createQueryBuilder('referral')
        .select(['referral.createdAt', 'referral.completedAt'])
        .where('referral.referrerId = :referrerId', { referrerId: context.referrerId })
        .andWhere('referral.isCompleted = :isCompleted', { isCompleted: true })
        .andWhere('referral.createdAt >= :weekAgo', { weekAgo })
        .getMany();

      if (completedReferrals.length < 3) {
        return { isFraudulent: false, reason: '', score: 0 };
      }

      // Calculate average time to conversion
      const conversionTimes = completedReferrals
        .map(r => {
          if (r.completedAt && r.createdAt) {
            return r.completedAt.getTime() - r.createdAt.getTime();
          }
          return null;
        })
        .filter(Boolean) as number[];

      const avgConversionTime = conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length;

      // If average conversion is less than 5 minutes, suspicious
      if (avgConversionTime < this.thresholds.MIN_CONVERSION_TIME_MS) {
        return {
          isFraudulent: true,
          reason: `Suspiciously fast conversions (avg: ${Math.round(avgConversionTime / 1000)}s)`,
          score: 55,
        };
      }

      return { isFraudulent: false, reason: '', score: 0 };
    } catch (error) {
      logger.error('Error checking immediate conversion', { error });
      return { isFraudulent: false, reason: '', score: 0 };
    }
  }

  /**
   * Calculate overall risk score from individual check results
   */
  private calculateRiskScore(results: Array<{ isFraudulent: boolean; reason: string; score: number }>): number {
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const fraudulentCount = results.filter(r => r.isFraudulent).length;

    // Cap at 100
    return Math.min(100, totalScore);
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  private calculateLevenshteinSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));

    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    return 1 - distance / maxLength;
  }
}

export const referralFraudDetection = new ReferralFraudDetection();
