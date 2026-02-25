import Queue from 'bull';
import cron from 'node-cron';
import { logger } from '../utils/logger';
import { config } from '../config';
import PriceAlert from '../models/PriceAlert';
import PriceHistory from '../models/PriceHistory';
import { PriceOracleService } from '../services/PriceOracleService';
import { VolatilityService } from '../services/VolatilityService';
import { NotificationService } from '../services/NotificationService';
import { getWebSocketServer } from '../websockets/server';

// Parse Redis config from URL if available, or use defaults
const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
// Simple parsing for Bull (it prefers host/port object usually, but can take redis URL string too in some versions, but let's stick to object for safety if we can parse it, or just pass the URL string if Bull supports it. Bull constructor supports redis connection string as second arg if first is name? No, it supports `new Queue(name, url)`.)

// Define the Queue
export const priceMonitorQueue = new Queue('price-monitor', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
  }
});

// Worker: Process the price check job
priceMonitorQueue.process(async (job) => {
  const { flightId } = job.data;
  
  try {
    // 1. Fetch current price
    const oracle = PriceOracleService.getInstance();
    const prices = await oracle.fetchPrices([flightId]); // Batching could be optimized here
    
    if (!prices || prices.length === 0) return;

    const currentPriceData = prices[0];
    const currentPrice = currentPriceData.price;

    // 2. Save history
    await PriceHistory.create({
      flightId,
      price: currentPrice,
      currency: currentPriceData.currency,
      source: currentPriceData.source
    });

    // 3. Check Volatility
    // Get last 24h history for this flight
    const history = await PriceHistory.find({ 
      flightId, 
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    }).sort({ timestamp: 1 });

    const isVolatile = VolatilityService.isSignificantDrop(currentPrice, history);

    // 4. Check Subscriptions/Alerts
    const alerts = await PriceAlert.find({ flightId, isActive: true });
    
    for (const alert of alerts) {
      if (currentPrice <= alert.targetPrice || isVolatile) {
        // Send Notification
        const notifier = NotificationService.getInstance();
        const message = `Price Drop Alert! Flight ${flightId} is now ${currentPrice} ${alert.currency}.`;
        
        // Throttling: Check if we notified recently (e.g., in last 24h)
        // Implementation: check alert.lastNotifiedAt
        const throttleTime = 24 * 60 * 60 * 1000;
        if (!alert.lastNotifiedAt || (Date.now() - alert.lastNotifiedAt.getTime() > throttleTime)) {
            if (alert.notificationMethod === 'email' || alert.notificationMethod === 'both') {
                await notifier.sendEmail(alert.userId, 'Price Alert', message); // Assuming userId is email for now
            }
            if (alert.notificationMethod === 'push' || alert.notificationMethod === 'both') {
                await notifier.sendPushNotification(alert.userId, message);
            }
            
            // Update lastNotifiedAt
            alert.lastNotifiedAt = new Date();
            await alert.save();
        }
      }
    }

    // 5. Broadcast via WebSocket
    try {
        const ws = getWebSocketServer();
        ws.broadcastPriceUpdate(flightId, currentPrice);
    } catch (e) {
        logger.warn('WebSocket server not ready, skipping broadcast');
    }

    logger.info(`Processed price check for flight ${flightId}: ${currentPrice}`);

  } catch (error) {
    logger.error(`Error processing price check for flight ${flightId}`, error);
    throw error;
  }
});

// Cron: Schedule the jobs
export const initPriceMonitorCron = () => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.info('Running Price Monitor Cron Job');
    
    try {
      // Find all unique flights that have active alerts
      // Using distinct to get unique flight IDs
      const activeFlights = await PriceAlert.distinct('flightId', { isActive: true });
      
      logger.info(`Found ${activeFlights.length} flights to monitor.`);

      for (const flightId of activeFlights) {
        // Add job to queue
        await priceMonitorQueue.add({ flightId });
      }
    } catch (error) {
      logger.error('Error in Price Monitor Cron', error);
    }
  });
};
