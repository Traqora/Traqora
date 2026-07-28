import * as admin from 'firebase-admin';
import { config } from '../config';

class PushNotificationService {
  private initialized = false;

  constructor() {
    if (config.firebaseServiceAccount) {
      try {
        const serviceAccount = JSON.parse(Buffer.from(config.firebaseServiceAccount, 'base64').toString('utf-8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.initialized = true;
      } catch (error: any) {
        console.error('Failed to initialize Firebase Admin:', error.message);
      }
    }
  }

  public async send(token: string, type: string, data: any) {
    if (!this.initialized) {
      console.warn('Firebase Admin not initialized. Skipping push notification send.');
      return;
    }

    let title = '';
    let body = '';

    switch (type) {
      case 'booking':
        title = 'Booking Confirmed';
        body = `Your flight ${data.flightNumber} is confirmed! Ref: ${data.bookingReference}`;
        break;
      case 'reminder':
        title = 'Flight Reminder';
        body = `Your flight ${data.flightNumber} departs in 24 hours!`;
        break;
      case 'refund':
        title = 'Refund Processed';
        body = `Refund of ${data.refundAmount} for booking ${data.bookingReference} is processed.`;
        break;
      case 'flight_delayed':
        title = `Flight ${data.flightNumber} Delayed`;
        body = `Your flight ${data.flightNumber} (${data.from || ''} → ${data.to || ''}) is delayed by ${data.delayMinutes} minutes.`;
        break;
      case 'flight_delayed_significant':
        title = `⚠️ Significant Delay: ${data.flightNumber}`;
        body = `Your flight ${data.flightNumber} (${data.from || ''} → ${data.to || ''}) is delayed by ${data.delayMinutes} minutes. Please check the app for updated information.`;
        break;
      case 'flight_cancelled':
        title = `❌ Flight ${data.flightNumber} Cancelled`;
        body = `Your flight ${data.flightNumber} (${data.from || ''} → ${data.to || ''}) has been cancelled. Reason: ${data.cancellationReason || 'Unknown'}. A refund is being initiated automatically.`;
        break;
      case 'gate_changed':
        title = `Gate Change: ${data.flightNumber}`;
        body = `Your flight ${data.flightNumber} gate has changed from ${data.previousGate || 'N/A'} to ${data.newGate || 'N/A'}.`;
        break;
      case 'boarding_reminder':
        title = `🔔 Boarding Soon: ${data.flightNumber}`;
        body = `Boarding for ${data.flightNumber} begins in 45 minutes at gate ${data.gate || 'TBD'}, terminal ${data.terminal || 'TBD'}.`;
        break;
      case 'flight_status':
        title = `Flight ${data.flightNumber} Update`;
        body = `Your flight ${data.flightNumber} (${data.from || ''} → ${data.to || ''}) status: ${data.status}`;
        break;
      case 'refund_initiated':
        title = '🔄 Automatic Refund Initiated';
        body = `A refund for cancelled flight ${data.flightNumber} has been initiated. Refund will be processed to your original payment method.`;
        break;
      default:
        throw new Error(`Push notification type not found: ${type}`);
    }

    const message = {
      notification: { title, body },
      data: { type, ...data }, // Pass along extra dynamic data
      token,
    };

    try {
      await admin.messaging().send(message);
      console.log(`Push notification sent successfully to token for type ${type}`);
    } catch (error: any) {
      console.error('Error sending push notification:', error.message);
      throw error;
    }
  }
}

export const pushNotificationService = new PushNotificationService();
