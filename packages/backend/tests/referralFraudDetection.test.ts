// @ts-ignore
import { ReferralFraudDetection, ReferralContext } from '../src/services/referralFraudDetection';
import { AppDataSource } from '../src/db/dataSource';
import { Referral } from '../src/db/entities/Referral';

describe('Referral Fraud Detection', () => {
  let fraudDetection: ReferralFraudDetection;

  beforeAll(async () => {
    await AppDataSource.initialize();
  });

  afterAll(async () => {
    await AppDataSource.destroy();
  });

  beforeEach(async () => {
    fraudDetection = new ReferralFraudDetection();
    // Clean up test data
    const referralRepo = AppDataSource.getRepository(Referral);
    await referralRepo.clear();
  });

  describe('Account Age Check', () => {
    it('should allow referrals from accounts older than 7 days', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerAccountAge: 30,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
      expect(result.riskScore).toBeLessThan(70);
    });

    it('should limit referrals from new accounts (< 7 days)', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerAccountAge: 3,
        referrerTotalReferrals: 6,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('New account (3 days) exceeded referral limit of 5');
    });

    it('should allow limited referrals from new accounts', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerAccountAge: 5,
        referrerTotalReferrals: 3,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Referral Velocity Check', () => {
    it('should block excessive daily referrals', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalReferrals: 60,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Exceeded daily referral limit of 50');
    });

    it('should block excessive weekly referrals', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalReferrals: 250,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Exceeded weekly referral limit of 200');
    });

    it('should allow normal referral velocity', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalReferrals: 10,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Activity Thresholds Check', () => {
    it('should require minimum bookings', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalBookings: 0,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Insufficient bookings (0) to refer (minimum: 1)');
    });

    it('should require minimum spend', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalBookings: 2,
        referrerTotalSpent: 500,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Insufficient spend ($5) to refer (minimum: $10)');
    });

    it('should allow users with sufficient activity', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalBookings: 3,
        referrerTotalSpent: 2000,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Email Similarity Check', () => {
    it('should detect similar email addresses', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerEmail: 'john.doe@example.com',
        referredEmail: 'john.doe2@example.com',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Email addresses too similar');
    });

    it('should allow dissimilar email addresses', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerEmail: 'john.doe@example.com',
        referredEmail: 'jane.smith@example.com',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Wallet Similarity Check', () => {
    it('should detect identical wallets', async () => {
      const wallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerWallet: wallet,
        referredWallet: wallet,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.blockAction).toBe(true);
      expect(result.riskScore).toBe(100);
    });

    it('should detect wallets with similar prefixes', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerWallet: 'GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        referredWallet: 'GABCD1234567890BCDEFGHIJKLMNOP',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Wallet addresses share suspicious prefix');
    });

    it('should allow different wallets', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerWallet: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
        referredWallet: 'HBCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHI',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Self-Referral Check', () => {
    it('should detect self-referral by email', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerEmail: 'john@example.com',
        referredEmail: 'john@example.com',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.blockAction).toBe(true);
      expect(result.riskScore).toBe(100);
    });

    it('should detect self-referral by wallet', async () => {
      const wallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerWallet: wallet,
        referredWallet: wallet,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.blockAction).toBe(true);
    });

    it('should allow legitimate referrals', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerEmail: 'john@example.com',
        referredEmail: 'jane@example.com',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Suspicious Timing Check', () => {
    it('should flag referrals during unusual hours (2-5 AM)', async () => {
      const earlyMorning = new Date();
      earlyMorning.setHours(3, 0, 0, 0);

      const context: ReferralContext = {
        referrerId: 'user123',
        timestamp: earlyMorning,
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Referral made during unusual hours (2 AM - 5 AM)');
    });

    it('should allow referrals during normal hours', async () => {
      const normalTime = new Date();
      normalTime.setHours(14, 0, 0, 0);

      const context: ReferralContext = {
        referrerId: 'user123',
        timestamp: normalTime,
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Risk Score Calculation', () => {
    it('should calculate cumulative risk score', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerAccountAge: 3,
        referrerTotalReferrals: 60,
        referrerTotalBookings: 0,
        referrerEmail: 'john@example.com',
        referredEmail: 'john@example.com',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.riskScore).toBeGreaterThan(50);
      expect(result.blockAction).toBe(true);
    });

    it('should cap risk score at 100', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerAccountAge: 1,
        referrerTotalReferrals: 300,
        referrerTotalBookings: 0,
        referrerTotalSpent: 0,
        referrerEmail: 'john@example.com',
        referredEmail: 'john@example.com',
        referrerWallet: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
        referredWallet: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.riskScore).toBe(100);
    });
  });

  describe('High Risk vs Block Action', () => {
    it('should not block if risk score is between 70-89', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerTotalReferrals: 60,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.blockAction).toBe(false);
    });

    it('should block if risk score is 90 or higher', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referrerEmail: 'john@example.com',
        referredEmail: 'john@example.com',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.blockAction).toBe(true);
    });
  });

  describe('Same IP Pattern Check', () => {
    it('should detect multiple referrals from same IP', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);
      const ipAddress = '192.168.1.1';

      // Create 3 referrals from same IP in last 24h
      for (let i = 0; i < 3; i++) {
        const referral = referralRepo.create({
          referrerId: 'user123',
          ipAddress,
          createdAt: new Date(),
        });
        await referralRepo.save(referral);
      }

      const context: ReferralContext = {
        referrerId: 'user123',
        ipAddress,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('Multiple referrals');
    });

    it('should allow referrals from different IPs', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        ipAddress: '192.168.1.1',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Device Fingerprinting Check', () => {
    it('should detect high volume from same device', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      // Create 11 referrals from same device in last 7 days
      for (let i = 0; i < 11; i++) {
        const referral = referralRepo.create({
          referrerId: 'user123',
          userAgent,
          createdAt: new Date(),
        });
        await referralRepo.save(referral);
      }

      const context: ReferralContext = {
        referrerId: 'user123',
        userAgent,
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('same device');
    });

    it('should allow normal device usage', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Geographic Pattern Check', () => {
    it('should detect referrals from many geographic regions', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);

      // Create referrals from 6 different /16 networks
      const ipPrefixes = ['192.168', '10.0', '172.16', '192.169', '10.1', '172.17'];
      for (const prefix of ipPrefixes) {
        const referral = referralRepo.create({
          referrerId: 'user123',
          ipAddress: `${prefix}.1.1`,
          createdAt: new Date(),
        });
        await referralRepo.save(referral);
      }

      const context: ReferralContext = {
        referrerId: 'user123',
        ipAddress: '192.168.1.1',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('geographic regions');
    });

    it('should allow referrals from same region', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        ipAddress: '192.168.1.1',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Referral Ring Detection', () => {
    it('should detect circular referral patterns', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);

      // Create a referral ring: user123 -> user456 -> user123
      const referral1 = referralRepo.create({
        referrerId: 'user456',
        referredWallet: 'user123',
        createdAt: new Date(),
      });
      await referralRepo.save(referral1);

      const context: ReferralContext = {
        referrerId: 'user123',
        referrerWallet: 'user123',
        referredUserId: 'user456',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('referral ring');
    });

    it('should detect referral chains', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);

      // Create 3 referrals from the referred user
      for (let i = 0; i < 3; i++) {
        const referral = referralRepo.create({
          referrerId: 'user456',
          referredWallet: `user${i}`,
          createdAt: new Date(),
        });
        await referralRepo.save(referral);
      }

      const context: ReferralContext = {
        referrerId: 'user123',
        referredUserId: 'user456',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('referral chain');
    });

    it('should allow normal referrals', async () => {
      const context: ReferralContext = {
        referrerId: 'user123',
        referredUserId: 'user456',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });

  describe('Immediate Conversion Pattern Check', () => {
    it('should detect suspiciously fast conversions', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);

      // Create 3 referrals that converted in under 5 minutes
      for (let i = 0; i < 3; i++) {
        const createdAt = new Date();
        const completedAt = new Date(createdAt.getTime() + 2 * 60 * 1000); // 2 minutes later

        const referral = referralRepo.create({
          referrerId: 'user123',
          isCompleted: true,
          createdAt,
          completedAt,
        });
        await referralRepo.save(referral);
      }

      const context: ReferralContext = {
        referrerId: 'user123',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(true);
      expect(result.reasons).toContain('fast conversions');
    });

    it('should allow normal conversion times', async () => {
      const referralRepo = AppDataSource.getRepository(Referral);

      // Create referrals with normal conversion times (1 hour)
      const createdAt = new Date();
      const completedAt = new Date(createdAt.getTime() + 60 * 60 * 1000);

      const referral = referralRepo.create({
        referrerId: 'user123',
        isCompleted: true,
        createdAt,
        completedAt,
      });
      await referralRepo.save(referral);

      const context: ReferralContext = {
        referrerId: 'user123',
        timestamp: new Date(),
      };

      const result = await fraudDetection.detectFraud(context);
      expect(result.isFraudulent).toBe(false);
    });
  });
});
