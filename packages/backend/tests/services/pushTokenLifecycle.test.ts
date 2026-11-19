import { classifyPushFailure, purgePushToken } from '../../src/services/pushTokenLifecycle';

describe('push token lifecycle', () => {
  it('classifies permanent provider token responses and purges only that token', () => {
    expect(classifyPushFailure(new Error('410 Gone: registration token is unregistered'))).toBe('permanent');
    const preferences = {
      fcmToken: 'dead-token',
      pushDeviceTokens: [
        { token: 'dead-token', platform: 'android', lastUsed: new Date() },
        { token: 'live-token', platform: 'web', lastUsed: new Date() },
      ],
    } as any;

    expect(purgePushToken(preferences, 'dead-token')).toBe(true);
    expect(preferences.pushDeviceTokens.map((device: any) => device.token)).toEqual(['live-token']);
    expect(preferences.fcmToken).toBe('live-token');
  });

  it('keeps transient provider failures retryable and leaves tokens intact', () => {
    expect(classifyPushFailure(new Error('503 provider unavailable'))).toBe('transient');
    const preferences = {
      fcmToken: 'live-token',
      pushDeviceTokens: [{ token: 'live-token', platform: 'web', lastUsed: new Date() }],
    } as any;
    expect(purgePushToken(preferences, 'other-token')).toBe(false);
    expect(preferences.pushDeviceTokens).toHaveLength(1);
  });
});
