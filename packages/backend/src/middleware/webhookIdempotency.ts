import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/dataSource';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { logger } from '../utils/logger';

export interface WebhookIdempotencyRecord {
  eventId: string;
  status: string;
  responseBody?: any;
}

export const webhookIdempotencyMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const eventId = (req.headers['stripe-signature'] as string) || (req.body && req.body.id) || req.headers['x-webhook-event-id'];
    if (!eventId) {
      return next();
    }

    const keyRepo = AppDataSource.getRepository(IdempotencyKey);
    const cacheKey = `webhook:${eventId}`;
    
    const existing = await keyRepo.findOne({ where: { key: cacheKey } });
    if (existing) {
      logger.info('Duplicate webhook delivery detected, returning cached response', { eventId });
      res.status(200).json({
        success: true,
        idempotentReplay: true,
        data: existing.responseBody ? JSON.parse(existing.responseBody) : { received: true },
      });
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      keyRepo.save(
        keyRepo.create({
          key: cacheKey,
          requestPath: req.path,
          responseBody: JSON.stringify(body),
          statusCode: res.statusCode,
        })
      ).catch((err) => {
        logger.error('Failed to save webhook idempotency record', { error: err.message, eventId });
      });
      return originalJson(body);
    };

    next();
  } catch (err: any) {
    logger.error('Error in webhookIdempotencyMiddleware', { error: err.message });
    next();
  }
};
