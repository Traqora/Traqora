import { AppDataSource } from '../db/dataSource';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { logger } from '../utils/logger';

export class WebhookService {
  static async processEventIdempotently(eventId: string, processor: () => Promise<any>): Promise<any> {
    const keyRepo = AppDataSource.getRepository(IdempotencyKey);
    const cacheKey = `webhook-svc:${eventId}`;

    const existing = await keyRepo.findOne({ where: { key: cacheKey } });
    if (existing) {
      logger.info('Webhook event already processed via service helper', { eventId });
      return existing.responseBody ? JSON.parse(existing.responseBody) : { processed: true, idempotent: true };
    }

    const result = await processor();

    await keyRepo.save(
      keyRepo.create({
        key: cacheKey,
        requestPath: 'internal/webhookService',
        responseBody: JSON.stringify(result),
        statusCode: 200,
      })
    ).catch((err) => {
      logger.error('Failed to save service webhook idempotency record', { error: err.message, eventId });
    });

    return result;
  }
}
