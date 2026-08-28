"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "@/components/socket/SocketProvider";
import type {
  Notification,
  NotificationPreference,
  NotificationChannel,
  NotificationCategory,
  NotificationFrequency,
} from "@/types/notification";

/** How often to poll as a fallback when WebSocket is unavailable (ms) */
const POLL_INTERVAL_MS = 30_000;

export interface NotificationStats {
  total: number;
  read: number;
  unread: number;
  byCategory: Record<string, number>;
}

export interface DoNotDisturbSettings {
  enabled: boolean;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
}

export interface UseNotificationsReturn {
  /** Sorted newest-first list of in-app notifications */
  notifications: Notification[];
  stats: NotificationStats | null;
  preferences: NotificationPreference[];
  loading: boolean;
  prefsLoading: boolean;
  error: string | null;
  /** Mark a single notification as read */
  markRead: (notificationId: string) => Promise<void>;
  /** Mark every unread notification as read */
  markAllRead: () => Promise<void>;
  /** Delete all notifications */
  clearAll: () => Promise<void>;
  /** Upsert a single preference cell */
  updatePreference: (
    channel: NotificationChannel,
    category: NotificationCategory,
    field: "enabled" | "frequency",
    value: boolean | NotificationFrequency,
  ) => Promise<void>;
  /** Update contact details (email / phone) used for delivery */
  updateContactSettings: (patch: {
    emailAddress?: string;
    phoneNumber?: string;
  }) => Promise<void>;
  /** Update the Do-Not-Disturb window */
  updateDoNotDisturb: (dnd: DoNotDisturbSettings) => Promise<void>;
  /** Manually trigger a refresh of the inbox */
  refresh: () => Promise<void>;
}

/**
 * Central hook for all notification state.
 *
 * – Fetches inbox + stats + preferences on mount.
 * – Listens for real-time `notification` events from the WebSocket manager.
 * – Falls back to polling every 30 s when WebSocket is unavailable.
 */
export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always call useSocket at the top level (Rules of Hooks).
  // The hook throws when SocketProvider is absent, so we catch that once here.
  const { manager } = useSocket();

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications/inbox");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch {
      // Non-fatal — stats are supplementary
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await fetch("/api/v1/notifications/preferences");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPreferences(data.preferences ?? []);
    } catch {
      // Keep whatever we had
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchInbox(), fetchStats()]);
  }, [fetchInbox, fetchStats]);

  // --------------------------------------------------------------------------
  // Initial load + polling fallback
  // --------------------------------------------------------------------------

  useEffect(() => {
    fetchInbox();
    fetchStats();
    fetchPreferences();

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchInbox, fetchStats, fetchPreferences, refresh]);

  // --------------------------------------------------------------------------
  // Real-time WebSocket updates
  // --------------------------------------------------------------------------

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!manager) return;

    const onNewNotification = (incoming: Notification) => {
      setNotifications((prev) => {
        // Deduplicate by id
        const exists = prev.some((n) => n.id === incoming.id);
        if (exists) return prev;
        return [incoming, ...prev];
      });
      // Refresh stats to get accurate unread count
      fetchStats();
    };

    manager.on("notification", onNewNotification);
    return () => {
      manager!.off("notification", onNewNotification);
    };
  }, [manager, fetchStats]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const markRead = useCallback(
    async (notificationId: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read: true, readAt: new Date() } : n,
        ),
      );

      try {
        const res = await fetch("/api/v1/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchStats();
      } catch (err) {
        // Roll back optimistic update
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, read: false, readAt: undefined } : n,
          ),
        );
        setError(err instanceof Error ? err.message : "Failed to mark as read");
      }
    },
    [fetchStats],
  );

  const markAllRead = useCallback(async () => {
    // Optimistic update
    const now = new Date();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: now })));

    try {
      const res = await fetch("/api/v1/notifications/mark-all-read", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStats();
    } catch (err) {
      // Restore previous state
      await fetchInbox();
      setError(err instanceof Error ? err.message : "Failed to mark all as read");
    }
  }, [fetchInbox, fetchStats]);

  const clearAll = useCallback(async () => {
    const previous = notifications;
    setNotifications([]);

    try {
      const res = await fetch("/api/v1/notifications/clear", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStats();
    } catch (err) {
      setNotifications(previous);
      setError(err instanceof Error ? err.message : "Failed to clear notifications");
    }
  }, [notifications, fetchStats]);

  const updatePreference = useCallback(
    async (
      channel: NotificationChannel,
      category: NotificationCategory,
      field: "enabled" | "frequency",
      value: boolean | NotificationFrequency,
    ) => {
      // Optimistic update
      setPreferences((prev) => {
        const idx = prev.findIndex(
          (p) => p.channel === channel && p.category === category,
        );
        if (idx === -1) {
          return [
            ...prev,
            {
              id: `temp-${channel}-${category}`,
              userId: "",
              channel,
              category,
              frequency: field === "frequency" ? (value as NotificationFrequency) : "instant",
              enabled: field === "enabled" ? (value as boolean) : true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        }
        return prev.map((p, i) =>
          i === idx ? { ...p, [field]: value, updatedAt: new Date() } : p,
        );
      });

      // Find the current full preference to include all fields
      const current = preferences.find(
        (p) => p.channel === channel && p.category === category,
      );

      try {
        const res = await fetch("/api/v1/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            category,
            frequency:
              field === "frequency"
                ? value
                : (current?.frequency ?? "instant"),
            enabled:
              field === "enabled" ? value : (current?.enabled ?? true),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Roll back
        await fetchPreferences();
        setError(
          err instanceof Error ? err.message : "Failed to update preference",
        );
      }
    },
    [preferences, fetchPreferences],
  );

  const updateContactSettings = useCallback(
    async (patch: { emailAddress?: string; phoneNumber?: string }) => {
      try {
        const res = await fetch("/api/v1/notifications/settings/contact", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update contact settings",
        );
      }
    },
    [],
  );

  const updateDoNotDisturb = useCallback(
    async (dnd: DoNotDisturbSettings) => {
      try {
        const res = await fetch("/api/v1/notifications/settings/dnd", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dnd),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update Do-Not-Disturb settings",
        );
      }
    },
    [],
  );

  return {
    notifications,
    stats,
    preferences,
    loading,
    prefsLoading,
    error,
    markRead,
    markAllRead,
    clearAll,
    updatePreference,
    updateContactSettings,
    updateDoNotDisturb,
    refresh,
  };
}
