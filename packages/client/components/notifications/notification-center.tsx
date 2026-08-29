"use client";

import { Bell, Trash2, AlertCircle, CheckCircle, Inbox, CheckCheck, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/use-notifications";

const CATEGORY_ICONS: Record<string, string> = {
  booking: "📅",
  payment: "💳",
  itinerary: "✈️",
  collaboration: "👥",
  marketing: "📢",
  system: "⚙️",
};

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "📬";
}

function formatRelativeTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function NotificationCenter() {
  const {
    notifications,
    stats,
    loading,
    error,
    markRead,
    markAllRead,
    clearAll,
    refresh,
  } = useNotifications();

  const unreadCount = stats?.unread ?? notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-label="Loading notifications">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" aria-hidden="true" />
              Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="rounded-full px-2 py-0 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Your notification inbox</CardDescription>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              aria-label="Refresh notifications"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllRead}
                aria-label="Mark all notifications as read"
              >
                <CheckCheck className="h-4 w-4 mr-2" aria-hidden="true" />
                Mark all read
              </Button>
            )}

            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                aria-label="Clear all notifications"
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <div
              role="alert"
              className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}

          {/* Stats summary */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" aria-label="Notification summary">
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Unread</p>
                <p className="text-2xl font-bold text-primary">{stats.unread}</p>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Read</p>
                <p className="text-2xl font-bold text-green-600">{stats.read}</p>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Categories</p>
                <p className="text-2xl font-bold">
                  {Object.keys(stats.byCategory).length}
                </p>
              </div>
            </div>
          )}

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div className="text-center py-12" aria-label="No notifications">
              <Inbox
                className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50"
                aria-hidden="true"
              />
              <p className="text-muted-foreground">You're all caught up</p>
            </div>
          ) : (
            <ul className="space-y-3" role="list" aria-label="Notifications">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`flex gap-3 p-4 rounded-lg border transition-colors ${
                    notification.read
                      ? "bg-card"
                      : "bg-primary/5 border-primary/20"
                  }`}
                  aria-label={`${notification.read ? "Read" : "Unread"} notification: ${notification.title}`}
                >
                  <Avatar className="h-10 w-10 shrink-0" aria-hidden="true">
                    <AvatarFallback>
                      {getCategoryIcon(notification.category)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">
                          {notification.title}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.body}
                        </p>
                      </div>
                      {notification.read ? (
                        <CheckCircle
                          className="h-5 w-5 text-green-600 shrink-0 mt-0.5"
                          aria-label="Read"
                        />
                      ) : (
                        <div
                          className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0"
                          aria-label="Unread"
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {notification.category}
                        </Badge>
                        <time
                          dateTime={new Date(notification.createdAt).toISOString()}
                          className="text-xs text-muted-foreground"
                        >
                          {formatRelativeTime(notification.createdAt)}
                        </time>
                      </div>

                      <div className="flex gap-2">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => markRead(notification.id)}
                            aria-label={`Mark "${notification.title}" as read`}
                          >
                            Mark as read
                          </Button>
                        )}
                        {notification.actionUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            asChild
                          >
                            <a href={notification.actionUrl}>View</a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
