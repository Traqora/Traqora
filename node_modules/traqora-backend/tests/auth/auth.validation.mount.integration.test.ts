import express from 'express';
import request from 'supertest';
import { authRoutes } from '../../src/api/routes/auth';
import { validateRequest } from '../../src/middleware/validationMiddleware';
import { AuthService } from '../../src/services/authService';

jest.mock('../../src/services/authService');

describe('Mounted auth validation', () => {
  let app: express.Application;

  const validWalletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/auth',
      validateRequest('/api/v1/auth/challenge'),
      validateRequest('/api/v1/auth/verify'),
      validateRequest('/api/v1/auth/refresh'),
      authRoutes,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates only the matching auth route schema', async () => {
    const mockChallenge = {
      nonce: 'abc123def456',
      expiresIn: 300,
      message: 'Sign this message to authenticate with Traqora: abc123def456',
    };

    (AuthService.prototype.generateChallenge as jest.Mock).mockResolvedValue(mockChallenge);

    const response = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ walletAddress: validWalletAddress });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockChallenge);
    expect(AuthService.prototype.generateChallenge).toHaveBeenCalledWith(validWalletAddress);
  });

  it('rejects an invalid challenge payload on the mounted route', async () => {
    const response = await request(app)
      .post('/api/v1/auth/challenge')
      .send({ walletAddress: 'INVALID' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
