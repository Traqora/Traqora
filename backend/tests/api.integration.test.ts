import request from 'supertest';
import { app } from '../src/index';

describe('API Integration Tests', () => {
  describe('Health Checks', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('API Documentation', () => {
    it('should serve Swagger UI', async () => {
      await request(app)
        .get('/api-docs')
        .expect(200);
    });

    it('should serve OpenAPI JSON', async () => {
      const response = await request(app)
        .get('/api-docs.json')
        .expect(200);
      
      expect(response.body).toHaveProperty('openapi', '3.0.0');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
    });
  });

  describe('Users API', () => {
    it('should require authentication for user profile', async () => {
      await request(app)
        .get('/api/v1/users/me')
        .expect(401);
    });
  });

  describe('Wallet API', () => {
    it('should require authentication for wallet status', async () => {
      await request(app)
        .get('/api/v1/wallet/status')
        .expect(401);
    });

    it('should accept wallet connection requests', async () => {
      const response = await request(app)
        .post('/api/v1/wallet/connect')
        .send({
          walletType: 'freighter',
          publicKey: 'GD5WOJQY2UEJHHFIVZGF5QYQKQBV7ZLXN3Z2KM4QNLQ7MTHGFASE2EI'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('challenge');
    });
  });

  describe('Airlines API', () => {
    it('should return list of airlines', async () => {
      const response = await request(app)
        .get('/api/v1/airlines')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return airline health status', async () => {
      const response = await request(app)
        .get('/api/v1/airlines/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('overallStatus');
    });
  });

  describe('Loyalty API', () => {
    it('should return loyalty campaigns', async () => {
      const response = await request(app)
        .get('/api/v1/loyalty/campaigns')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('Refunds API', () => {
    it('should require admin API key for admin endpoints', async () => {
      await request(app)
        .get('/api/v1/refunds/admin/review-queue')
        .expect(403);
    });
  });

  describe('Flight Search', () => {
    it('should search flights across airlines', async () => {
      const response = await request(app)
        .get('/api/v1/airlines/search')
        .query({ 
          departureAirport: 'JFK', 
          arrivalAirport: 'LAX',
          date: new Date().toISOString().split('T')[0]
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('flights');
    });
  });
});
