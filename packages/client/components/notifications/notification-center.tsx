"use client";

import { useState, useEffect } from "react";
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
import { Bell, Trash2, AlertCircle, CheckCircle, Inbox } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  readAt?: Date;
  actionUrl?: string;
  createdAt: Date;
}

interface NotificationStats {
  total: number;
  read: number;
  unread: number;
  byCategory: Record<string, number>;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
    fetchStats();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications/inbox");
      if (!res.ok) throw new Error("Failed to fetch notifications");

      const data = await res.json();
      setNotifications(data.notifications);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/notifications/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");

      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      const res = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });

      if (res.ok) {
        setNotifications(
          notifications.map((n) =>
            n.id === notificationId
              ? { ...n, read: true, readAt: new Date() }
              : n,
          ),
        );
        await fetchStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClear = async () => {
    try {
      const res = await fetch("/api/notifications/clear", {
        method: "POST",
      });

      if (res.ok) {
        setNotifications([]);
        await fetchStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "booking":
        return "📅";
      case "payment":
        return "💳";
      case "itinerary":
        return "✈️";
      case "collaboration":
        return "👥";
      case "marketing":
        return "📢";
      case "system":
        return "⚙️";
      default:
        return "📬";
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading notifications...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Your notification inbox</CardDescription>
          </div>
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold text-primary">
                  {stats.unread}
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground">Read</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.read}
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">
                  {Object.keys(stats.byCategory).length}
                </p>
              </div>
            </div>
          )}

          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 p-4 rounded-lg border transition-colors ${
                    notification.read
                      ? "bg-card"
                      : "bg-primary/5 border-primary/20"
                  }`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback>
                      {getCategoryIcon(notification.category)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">
                          {notification.title}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.body}
                        </p>
                      </div>
                      {notification.read ? (
                        <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {notification.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(
                            notification.createdAt,
                          ).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkRead(notification.id)}
                            className="text-xs"
                          >
                            Mark as read
                          </Button>
                        )}
                        {notification.actionUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            asChild
                          >
                            <a href={notification.actionUrl}>View</a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
