import { Router } from 'express';
import { z } from 'zod';
import PriceAlert from '../../models/PriceAlert';
import PriceHistory from '../../models/PriceHistory';
import { logger } from '../../utils/logger';

const router = Router();

// Validation schema
const createSubscriptionSchema = z.object({
  userId: z.string().min(1),
  flightId: z.string().min(1),
  targetPrice: z.number().positive(),
  currency: z.string().default('USD'),
  notificationMethod: z.enum(['email', 'push', 'both']).default('email'),
});

// Create a new price alert subscription
router.post('/', async (req, res) => {
  try {
    const validatedData = createSubscriptionSchema.parse(req.body);
    
    // Check if subscription already exists
    const existing = await PriceAlert.findOne({
      userId: validatedData.userId,
      flightId: validatedData.flightId
    });

    if (existing) {
      existing.targetPrice = validatedData.targetPrice;
      existing.notificationMethod = validatedData.notificationMethod;
      existing.isActive = true;
      await existing.save();
      return res.status(200).json(existing);
    }

    const newSubscription = await PriceAlert.create(validatedData);
    logger.info(`Created subscription for user ${validatedData.userId} on flight ${validatedData.flightId}`);
    
    return res.status(201).json(newSubscription);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    logger.error('Error creating subscription', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get all subscriptions for a user
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId query parameter' });
    }

    const subscriptions = await PriceAlert.find({ userId });
    return res.json(subscriptions);
  } catch (error) {
    logger.error('Error fetching subscriptions', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete (unsubscribe)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PriceAlert.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    return res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    logger.error('Error deleting subscription', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get price history for a flight
router.get('/history/:flightId', async (req, res) => {
  try {
    const { flightId } = req.params;
    const history = await PriceHistory.find({ flightId })
      .sort({ timestamp: -1 })
      .limit(100); // Limit to last 100 entries
    
    return res.json(history);
  } catch (error) {
    logger.error('Error fetching history', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const subscriptionRoutes = router;
