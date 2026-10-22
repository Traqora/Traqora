import { Router, Request, Response, NextFunction } from 'express';
import { webhookIdempotencyMiddleware } from '../../middleware/webhookIdempotency';
import { WebhookService } from '../../services/webhookService';
import { logger } from '../../utils/logger';

const router = Router();

router.post(
  '/stripe',
  webhookIdempotencyMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.body;
      const eventId = event?.id || req.headers['stripe-signature'] || 'unknown-event';

      const result = await WebhookService.processEventIdempotently(String(eventId), async () => {
        logger.info('Processing Stripe webhook event', { type: event?.type, eventId });
        // Simulate domain processing based on event type
        return { received: true, type: event?.type, processedAt: new Date().toISOString() };
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

export const webhookRouter = router;
