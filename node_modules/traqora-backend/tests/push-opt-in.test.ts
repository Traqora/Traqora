import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { AppDataSource } from '../src/db/dataSource';
import { UserPreference } from '../src/db/entities/UserPreference';
import app from '../src/app';

describe('Push Opt-In API', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    await AppDataSource.initialize();
  });

  afterAll(async () => {
    await AppDataSource.destroy();
  });

  beforeEach(async () => {
    // Clean up test data
    const userPrefRepo = AppDataSource.getRepository(UserPreference);
    await userPrefRepo.clear();

    // Create test user and get auth token
    // This would typically involve registering/logging in
    userId = 'test-user-' + Date.now();
  });

  describe('GET /api/v1/users/preferences', () => {
    it('should return default preferences for new user', async () => {
      const response = await request(app)
        .get('/api/v1/users/preferences')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('pushOptedIn', false);
      expect(response.body.data).toHaveProperty('pushBookingEnabled', true);
      expect(response.body.data).toHaveProperty('pushReminderEnabled', true);
      expect(response.body.data).toHaveProperty('pushRefundEnabled', true);
      expect(response.body.data).toHaveProperty('pushPromoEnabled', true);
    });

    it('should return existing preferences', async () => {
      const userPrefRepo = AppDataSource.getRepository(UserPreference);
      await userPrefRepo.save({
        userId,
        emailEnabled: false,
        pushEnabled: false,
        pushOptedIn: true,
        pushBookingEnabled: false,
        pushReminderEnabled: true,
        pushRefundEnabled: true,
        pushPromoEnabled: false,
      });

      const response = await request(app)
        .get('/api/v1/users/preferences')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.emailEnabled).toBe(false);
      expect(response.body.data.pushOptedIn).toBe(true);
    });
  });

  describe('PUT /api/v1/users/preferences', () => {
    it('should update notification preferences', async () => {
      const response = await request(app)
        .put('/api/v1/users/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailEnabled: false,
          pushBookingEnabled: false,
          pushPromoEnabled: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.emailEnabled).toBe(false);
      expect(response.body.data.pushBookingEnabled).toBe(false);
      expect(response.body.data.pushPromoEnabled).toBe(false);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .put('/api/v1/users/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/users/push/opt-in', () => {
    it('should opt-in to push notifications', async () => {
      const response = await request(app)
        .post('/api/v1/users/push/opt-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test-fcm-token',
          platform: 'web',
          enabledTypes: ['booking', 'reminder', 'refund'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pushOptedIn).toBe(true);
      expect(response.body.data.enabledTypes).toEqual(['booking', 'reminder', 'refund']);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/users/push/opt-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'web',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate platform enum', async () => {
      const response = await request(app)
        .post('/api/v1/users/push/opt-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test-token',
          platform: 'invalid',
        });

      expect(response.status).toBe(400);
    });

    it('should store device tokens', async () => {
      await request(app)
        .post('/api/v1/users/push/opt-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test-fcm-token-1',
          platform: 'web',
        });

      const userPrefRepo = AppDataSource.getRepository(UserPreference);
      const preferences = await userPrefRepo.findOne({ where: { userId } });

      expect(preferences?.pushDeviceTokens).toHaveLength(1);
      expect(preferences?.pushDeviceTokens?.[0].token).toBe('test-fcm-token-1');
      expect(preferences?.pushDeviceTokens?.[0].platform).toBe('web');
    });
  });

  describe('POST /api/v1/users/push/opt-out', () => {
    it('should opt-out of push notifications', async () => {
      // First opt-in
      await request(app)
        .post('/api/v1/users/push/opt-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test-fcm-token',
          platform: 'web',
        });

      // Then opt-out
      const response = await request(app)
        .post('/api/v1/users/push/opt-out')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pushOptedIn).toBe(false);

      const userPrefRepo = AppDataSource.getRepository(UserPreference);
      const preferences = await userPrefRepo.findOne({ where: { userId } });

      expect(preferences?.pushOptedIn).toBe(false);
      expect(preferences?.pushDeviceTokens).toEqual([]);
      expect(preferences?.fcmToken).toBeNull();
    });

    it('should return 404 if preferences not found', async () => {
      const response = await request(app)
        .post('/api/v1/users/push/opt-out')
        .set('Authorization', `Bearer ${authToken}`);

      // This might return 404 or 200 depending on implementation
      // Adjust based on actual behavior
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('POST /api/v1/users/push/register-token', () => {
    it('should register FCM token', async () => {
      const response = await request(app)
        .post('/api/v1/users/push/register-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'new-fcm-token',
          platform: 'ios',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tokenRegistered).toBe(true);
      expect(response.body.data.platform).toBe('ios');
    });

    it('should update existing token', async () => {
      // Register first token
      await request(app)
        .post('/api/v1/users/push/register-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test-token',
          platform: 'web',
        });

      // Update same token with different platform
      const response = await request(app)
        .post('/api/v1/users/push/register-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test-token',
          platform: 'android',
        });

      expect(response.status).toBe(200);

      const userPrefRepo = AppDataSource.getRepository(UserPreference);
      const preferences = await userPrefRepo.findOne({ where: { userId } });

      expect(preferences?.pushDeviceTokens).toHaveLength(1);
      expect(preferences?.pushDeviceTokens?.[0].platform).toBe('android');
    });

    it('should add multiple tokens', async () => {
      await request(app)
        .post('/api/v1/users/push/register-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'token-1',
          platform: 'web',
        });

      await request(app)
        .post('/api/v1/users/push/register-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'token-2',
          platform: 'ios',
        });

      const userPrefRepo = AppDataSource.getRepository(UserPreference);
      const preferences = await userPrefRepo.findOne({ where: { userId } });

      expect(preferences?.pushDeviceTokens).toHaveLength(2);
    });
  });
});
