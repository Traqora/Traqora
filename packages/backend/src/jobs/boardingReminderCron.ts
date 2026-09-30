import cron from 'node-cron';
import { logger } from '../utils/logger';
import { flightStatusService } from '../services/FlightStatusService';
import { createJobLogger } from './jobLogger';

/**
 * Boarding Reminder Cron Job
 * Runs every minute to check for flights departing in ~45 minutes
 * and sends boarding reminders to followers
 */
export const initBoardingReminderCron = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    const log = createJobLogger('boarding-reminder');
    log.start();
    try {
      await flightStatusService.checkAndSendBoardingReminders();
      log.complete();
    } catch (error) {
      log.fail({
        step: 'check_and_send_reminders',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info('Boarding reminder cron job initialized (runs every minute)');
};