"use client";

import { useState, useEffect } from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, Trash2, AlertCircle } from "lucide-react";

export default function NotificationCenterPage() {
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

  const [activeTab, setActiveTab] = useState<"inbox" | "preferences">("inbox");

  return (
    <main className="container mx-auto py-8 px-4 max-w-4xl space-y-6" role="main">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="h-8 w-8 text-primary" />
            Notification Center
          </h1>
          <p className="text-muted-foreground">
            Manage your notifications, inbox alerts, and delivery channel preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refresh()} aria-label="Refresh notifications">
            Refresh
          </Button>
          {activeTab === "inbox" && (noduplicateCount => notifications.some(n => !n.read))(notifications) && (
            <Button variant="secondary" onClick={() => markAllRead()} aria-label="Mark all notifications as read">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          )}
          {activeTab === "inbox" && notifications.length > 0 && (
            <Button variant="destructive" onClick={() => clearAll()} aria-label="Clear all notifications">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="inbox" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            Inbox
            {stats && stats.unread > 0 && (
              <Badge variant="default" className="ml-1 bg-primary text-primary-foreground">
                {stats.unread}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Notifications</CardTitle>
              <CardDescription>Stay updated on your flights, bookings, and account activity.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading && <div className="text-center py-12 text-muted-foreground">Loading notifications...</div>}

              {error && (
                <div className="flex gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {!loading && !error && notifications.length === 0 && (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Bell className="h-12 w-12 text-muted-foreground/50" />
                  <p className="text-lg font-medium">Your inbox is empty</p>
                  <p className="text-sm text-muted-foreground">You will see updates here when they arrive.</p>
                </div>
              )}

              {!loading && notifications.length > 0 && (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`py-4 flex items-start justify-between gap-4 transition-colors ${!notification.read ? "bg-muted/50 px-3 rounded-lg" : ""}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{notification.title}</span>
                          {!notification.read && (
                            <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread notification" />
                          )}
                          <Badge variant="outline" className="text-xs capitalize">
                            {notification.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{notification.message}</p>
                        <span className="text-xs text-muted-foreground/80">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {!notification.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markRead(notification.id)}
                          aria-label={`Mark notification ${notification.title} as read`}
                        >
                          Mark Read
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <NotificationPreferences />
        </TabsContent>
      </Tabs>
    </main>
  );
}
