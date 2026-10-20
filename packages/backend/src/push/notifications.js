// Push notifications for mobile alerts
const pushNotifications = {
    sendAlert: (userId, message, data = {}) => {
        // Logic to send push notification with deep-link payload support
        const payload = {
            userId,
            message,
            data: {
                screen: data.screen || 'home',
                id: data.id || '',
                url: data.url || (data.screen ? `traqora://${data.screen === 'booking' ? 'book/' + data.id : data.screen === 'refund' ? 'refunds/' + data.id : 'chat?sessionId=' + data.id}` : 'traqora://home'),
                ...data
            }
        };
        console.log(`Push notification sent to user ${userId}: ${message}`, payload);
        return payload;
    }
};

module.exports = pushNotifications;
