const pushNotifications = require('../notifications');

describe('Push Notifications Deep Link Payload', () => {
    it('generates correct booking deep link payload', () => {
        const result = pushNotifications.sendAlert('user123', 'Your booking is confirmed', {
            screen: 'booking',
            id: 'bk-999'
        });

        expect(result.userId).toBe('user123');
        expect(result.message).toBe('Your booking is confirmed');
        expect(result.data.screen).toBe('booking');
        expect(result.data.id).toBe('bk-999');
        expect(result.data.url).toBe('traqora://book/bk-999');
    });

    it('generates correct refund deep link payload', () => {
        const result = pushNotifications.sendAlert('user123', 'Refund processed', {
            screen: 'refund',
            id: 'ref-888'
        });

        expect(result.data.screen).toBe('refund');
        expect(result.data.id).toBe('ref-888');
        expect(result.data.url).toBe('traqora://refunds/ref-888');
    });

    it('generates correct chat deep link payload', () => {
        const result = pushNotifications.sendAlert('user123', 'New message', {
            screen: 'chat',
            id: 'sess-777'
        });

        expect(result.data.screen).toBe('chat');
        expect(result.data.id).toBe('sess-777');
        expect(result.data.url).toBe('traqora://chat?sessionId=sess-777');
    });

    it('falls back to home deep link when no screen is provided', () => {
        const result = pushNotifications.sendAlert('user123', 'General alert');

        expect(result.data.screen).toBe('home');
        expect(result.data.url).toBe('traqora://home');
    });
});
