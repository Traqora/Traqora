// packages/backend/notify/notification-dedup-service.js
const fs = require('fs');
const path = require('path');

// In-memory cache store for demonstration & test harness (expandable to Redis in production)
const deliveryLog = new Map();

function checkAndRecordNotification(notification, contractPath) {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const { userId, eventType, channel, referenceId } = notification;

  if (!userId || !eventType || !channel) {
    throw new Error('Invalid notification payload: missing userId, eventType, or channel.');
  }

  if (!contract.supportedChannels.includes(channel)) {
    throw new Error(`Unsupported notification channel: '${channel}'`);
  }

  // Construct unique fingerprint for dedup
  const fingerprint = `${userId}:${eventType}:${referenceId || 'general'}:${channel}`;
  const now = Date.now();
  const windowMs = contract.dedupWindowSeconds * 1000;

  if (deliveryLog.has(fingerprint)) {
    const lastSentTimestamp = deliveryLog.get(fingerprint);
    if (now - lastSentTimestamp < windowMs) {
      console.warn(`⚠️ Duplicate notification suppressed for fingerprint: ${fingerprint}`);
      return { isDuplicate: true, fingerprint };
    }
  }

  // Record dispatch timestamp
  deliveryLog.set(fingerprint, now);
  console.log(`✅ Notification cleared for dispatch: ${fingerprint}`);
  return { isDuplicate: false, fingerprint };
}

// CLI runner if executed directly
if (require.main === module) {
  const sampleNotification = {
    userId: 'usr_12345',
    eventType: 'booking_confirmed',
    referenceId: 'TRQ-8821',
    channel: 'email'
  };
  const contractFile = path.join(__dirname, 'dedup-contract.json');
  try {
    const result = checkAndRecordNotification(sampleNotification, contractFile);
    console.log(result);
  } catch (err) {
    console.error(`❌ Dedup check failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { checkAndRecordNotification, deliveryLog };