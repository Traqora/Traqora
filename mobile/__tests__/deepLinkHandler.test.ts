import { MobileDeepLinkHandler } from '../deepLinkHandler';

const mockOpener = {
  openURL: jest.fn().mockResolvedValue(true),
  addEventListener: jest.fn(),
};

describe('MobileDeepLinkHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MobileDeepLinkHandler.setUrlOpener(mockOpener);
  });

  it('handles booking screen deep links correctly', () => {
    const url = MobileDeepLinkHandler.handleNotificationDeepLink({
      screen: 'booking',
      id: 'bk-123',
    });
    expect(url).toBe('traqora://book/bk-123');
    expect(mockOpener.openURL).toHaveBeenCalledWith('traqora://book/bk-123');
  });

  it('handles refund screen deep links correctly', () => {
    const url = MobileDeepLinkHandler.handleNotificationDeepLink({
      screen: 'refund',
      id: 'ref-456',
    });
    expect(url).toBe('traqora://refunds/ref-456');
    expect(mockOpener.openURL).toHaveBeenCalledWith('traqora://refunds/ref-456');
  });

  it('handles chat screen deep links correctly', () => {
    const url = MobileDeepLinkHandler.handleNotificationDeepLink({
      screen: 'chat',
      id: 'sess-789',
    });
    expect(url).toBe('traqora://chat?sessionId=sess-789');
    expect(mockOpener.openURL).toHaveBeenCalledWith('traqora://chat?sessionId=sess-789');
  });

  it('falls back to default home URL when unhandled screen is given', () => {
    const url = MobileDeepLinkHandler.handleNotificationDeepLink({
      screen: 'unknown' as any,
    });
    expect(url).toBe('traqora://home');
    expect(mockOpener.openURL).toHaveBeenCalledWith('traqora://home');
  });
});
