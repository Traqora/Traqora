import express from 'express';
import request from 'supertest';
import { errorHandler } from '../utils/errorHandler';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/errors';

describe('Centralized Error Handling', () => {
  const app = express();
  app.use(express.json());

  app.get('/test-bad-request', (req, res, next) => {
    next(new BadRequestError('Custom bad request', { foo: 'bar' }));
  });

  app.get('/test-not-found', (req, res, next) => {
    next(new NotFoundError('Resource not found'));
  });

  app.get('/test-unauthorized', (req, res, next) => {
    next(new UnauthorizedError());
  });

  app.get('/test-generic-error', (req, res, next) => {
    next(new Error('Something went wrong'));
  });

  app.use(errorHandler);

  it('should handle BadRequestError with custom message and details', async () => {
    const response = await request(app).get('/test-bad-request');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Custom bad request',
      code: 'BAD_REQUEST',
      details: { foo: 'bar' },
      requestId: expect.any(String),
      timestamp: expect.any(String),
      success: false,
    });
  });

  it('should handle NotFoundError', async () => {
    const response = await request(app).get('/test-not-found');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Resource not found');
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('should handle UnauthorizedError with default message', async () => {
    const response = await request(app).get('/test-unauthorized');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('should handle generic Error as Internal Server Error', async () => {
    const response = await request(app).get('/test-generic-error');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Something went wrong');
    expect(response.body.code).toBe('INTERNAL_ERROR');
  });
});
