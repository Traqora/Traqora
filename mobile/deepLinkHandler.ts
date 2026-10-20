export interface DeepLinkPayload {
  screen?: 'booking' | 'refund' | 'chat';
  id?: string;
  url?: string;
  [key: string]: any;
}

export interface UrlOpener {
  openURL(url: string): Promise<any>;
  addEventListener(type: string, listener: (event: { url: string }) => void): void;
}

export class MobileDeepLinkHandler {
  private static customOpener?: UrlOpener;

  static setUrlOpener(opener: UrlOpener): void {
    MobileDeepLinkHandler.customOpener = opener;
  }

  /**
   * Parse and handle push notification or deep link payload
   */
  static handleNotificationDeepLink(data: DeepLinkPayload): string {
    let targetUrl = data.url;

    if (!targetUrl && data.screen) {
      switch (data.screen) {
        case 'booking':
          targetUrl = `traqora://book/${data.id || ''}`;
          break;
        case 'refund':
          targetUrl = `traqora://refunds/${data.id || ''}`;
          break;
        case 'chat':
          targetUrl = `traqora://chat?sessionId=${data.id || ''}`;
          break;
        default:
          targetUrl = 'traqora://home';
          break;
      }
    } else if (!targetUrl) {
      targetUrl = 'traqora://home';
    }

    if (MobileDeepLinkHandler.customOpener) {
      MobileDeepLinkHandler.customOpener.openURL(targetUrl).catch((err: any) => {
        console.error('Failed to open deep link URL:', targetUrl, err);
      });
    } else if (typeof window !== 'undefined' && (window as any).location) {
      (window as any).location.href = targetUrl;
    }

    return targetUrl;
  }

  static setupNotificationOpenListener(callback?: (url: string) => void): void {
    if (MobileDeepLinkHandler.customOpener) {
      MobileDeepLinkHandler.customOpener.addEventListener('url', (event) => {
        if (callback) {
          callback(event.url);
        }
      });
    }
  }
}
