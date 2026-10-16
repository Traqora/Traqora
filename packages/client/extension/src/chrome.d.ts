/**
 * Minimal ambient declarations for the subset of the MV3 extension APIs this
 * extension uses. Hand-written rather than pulling in `@types/chrome` so the
 * client package gains no new dependency for a directory Next.js never bundles.
 */
declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    function sendMessage<T = unknown, R = unknown>(message: T): Promise<R>;
    function getURL(path: string): string;

    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };

    const onInstalled: {
      addListener(callback: () => void): void;
    };
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
    const sync: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
    }
    function query(queryInfo: Record<string, unknown>): Promise<Tab[]>;
    function sendMessage<T = unknown, R = unknown>(tabId: number, message: T): Promise<R>;
  }

  namespace notifications {
    interface NotificationOptions {
      type: 'basic';
      iconUrl: string;
      title: string;
      message: string;
      priority?: number;
    }
    function create(
      notificationId: string,
      options: NotificationOptions,
    ): Promise<string>;
  }

  namespace alarms {
    interface Alarm {
      name: string;
    }
    function create(name: string, alarmInfo: { periodInMinutes?: number; delayInMinutes?: number }): void;
    const onAlarm: {
      addListener(callback: (alarm: Alarm) => void): void;
    };
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  }
}
