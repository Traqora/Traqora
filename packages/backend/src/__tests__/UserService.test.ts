import { UserService } from '../../src/services/UserService';
import { createMockRepository, createMockEmailService, createMockRedisClient } from '../../../tests/helpers/mocks';
import { UserBuilder } from '../../../tests/helpers/builders';
import { createUser } from '../../../tests/helpers/factories';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn().mockReturnValue({ userId: 'u-001', email: 'test@example.com' }),
}));

import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

describe('UserService', () => {
  let service: UserService;
  let userRepo: ReturnType<typeof createMockRepository>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let redis: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    userRepo = createMockRepository();
    emailService = createMockEmailService();
    redis = createMockRedisClient();
    service = new UserService(userRepo as any, emailService as any, redis as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('creates a new user and sends welcome email', async () => {
      userRepo.findOneBy.mockResolvedValue(null); // no existing user
      const newUser = createUser({ email: 'new@example.com' });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);

      const result = await service.register({ email: 'new@example.com', password: 'SecurePass1!' });

      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePass1!', expect.any(Number));
      expect(userRepo.save).toHaveBeenCalledTimes(1);
      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com' }));
      expect(result).not.toHaveProperty('password'); // password must not be returned
    });

    it('throws if email is already registered', async () => {
      userRepo.findOneBy.mockResolvedValue(createUser({ email: 'existing@example.com' }));

      await expect(
        service.register({ email: 'existing@example.com', password: 'pass' }),
      ).rejects.toThrow(/already registered/i);
    });

    it('throws on invalid email format', async () => {
      await expect(service.register({ email: 'not-an-email', password: 'pass' })).rejects.toThrow(/invalid email/i);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns JWT token on valid credentials', async () => {
      const user = { ...createUser(), password: 'hashed_password' };
      userRepo.findOneBy.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: user.email, password: 'correct_password' });

      expect(result.token).toBe('mock.jwt.token');
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws on wrong password', async () => {
      const user = { ...createUser(), password: 'hashed_password' };
      userRepo.findOneBy.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow(/invalid credentials/i);
    });

    it('throws when user account does not exist', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(service.login({ email: 'ghost@example.com', password: 'pass' })).rejects.toThrow(/invalid credentials/i);
    });
  });

  // ── linkWallet ─────────────────────────────────────────────────────────────

  describe('linkWallet()', () => {
    it('associates a Stellar wallet address with a user', async () => {
      const user = createUser({ walletAddress: null });
      userRepo.findOneBy.mockResolvedValue(user);
      userRepo.save.mockResolvedValue({ ...user, walletAddress: 'GBZ_WALLET_001' });

      const result = await service.linkWallet(user.id, 'GBZ_WALLET_001');

      expect(result.walletAddress).toBe('GBZ_WALLET_001');
    });

    it('throws if wallet address is already linked to another user', async () => {
      const otherUser = createUser({ walletAddress: 'GBZ_TAKEN' });
      userRepo.findOneBy
        .mockResolvedValueOnce(createUser()) // current user
        .mockResolvedValueOnce(otherUser);  // wallet already taken

      await expect(service.linkWallet('user-me', 'GBZ_TAKEN')).rejects.toThrow(/wallet already linked/i);
    });

    it('validates Stellar public key format', async () => {
      const user = createUser();
      userRepo.findOneBy.mockResolvedValue(user);

      await expect(service.linkWallet(user.id, 'INVALID_KEY')).rejects.toThrow(/invalid stellar address/i);
    });
  });

  // ── getLoyaltyPoints ───────────────────────────────────────────────────────

  describe('getLoyaltyPoints()', () => {
    it('returns the user loyalty points balance', async () => {
      const user = new UserBuilder().withLoyaltyPoints(250).build();
      userRepo.findOneBy.mockResolvedValue(user);

      const result = await service.getLoyaltyPoints(user.id);
      expect(result.points).toBe(250);
    });
  });

  describe('addLoyaltyPoints()', () => {
    it('increments loyalty points by specified amount', async () => {
      const user = new UserBuilder().withLoyaltyPoints(100).build();
      userRepo.findOneBy.mockResolvedValue(user);
      userRepo.save.mockResolvedValue({ ...user, loyaltyPoints: 150 });

      const result = await service.addLoyaltyPoints(user.id, 50);
      expect(result.loyaltyPoints).toBe(150);
    });

    it('throws if points amount is negative', async () => {
      await expect(service.addLoyaltyPoints('user-001', -10)).rejects.toThrow(/must be positive/i);
    });
  });

  // ── getUserProfile ─────────────────────────────────────────────────────────

  describe('getUserProfile()', () => {
    it('returns user profile without sensitive fields', async () => {
      const user = { ...createUser(), password: 'hashed_password', refreshToken: 'secret_token' };
      userRepo.findOneBy.mockResolvedValue(user);

      const result = await service.getUserProfile(user.id);

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('throws NotFoundException for unknown user', async () => {
      userRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getUserProfile('ghost-id')).rejects.toThrow(/not found/i);
    });
  });
});
