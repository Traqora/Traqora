import { syncPreferences } from './api';

export class PushNotificationService {
  // Fix: Push-notification opt-in and preference sync on mobile
  static async optInAndSync() {
    const optIn = true; // assume user clicked yes
    await syncPreferences({ pushEnabled: optIn });
    return optIn;
  }
}
