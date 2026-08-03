import cron from 'node-cron';
import { logger } from '../utils/logger';
import { flightStatusService } from '../services/FlightStatusService';

/**
 * Boarding Reminder Cron Job
 * Runs every minute to check for flights departing in ~45 minutes
 * and sends boarding reminders to followers
 */
export const initBoardingReminderCron = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await flightStatusService.checkAndSendBoardingReminders();
    } catch (error) {
      logger.error('Boarding reminder cron failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info('Boarding reminder cron job initialized (runs every minute)');
};