"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Bell,
  BellOff,
  Mail,
  MessageSquare,
  Smartphone,
  Globe,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Undo2,
  Eye,
  EyeOff,
  Archive,
  Trash2,
} from "lucide-react"
import { apiClient } from "@/lib/api"

const NOTIFICATION_TYPES = [
  { id: "booking", label: "Booking Confirmations", description: "Flight booking confirmations and updates" },
  { id: "reminder", label: "Flight Reminders", description: "24-hour departure reminders" },
  { id: "refund", label: "Refund Updates", description: "Refund processing status updates" },
  { id: "promotional", label: "Promotional Offers", description: "Special deals and promotional content" },
  { id: "price_alert", label: "Price Alerts", description: "Price drop notifications for tracked flights" },
  { id: "system", label: "System Notifications", description: "Important system and account updates" },
]

const CHANNELS = [
  { id: "email", label: "Email", icon: Mail, description: "Receive notifications via email" },
  { id: "sms", label: "SMS", icon: MessageSquare, description: "Receive notifications via text message" },
  { id: "push", label: "Push", icon: Smartphone, description: "Receive push notifications on your device" },
  { id: "in_app", label: "In-App", icon: Bell, description: "Receive notifications within the app" },
  { id: "webhook", label: "Webhook", icon: Globe, description: "Send notifications to a webhook URL" },
]

export default function NotificationsPage() {
  const [preferences, setPreferences] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("channels")

  // In-app notifications state
  const [inAppNotifications, setInAppNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(false)

  useEffect(() => {
    loadPreferences()
    loadInAppNotifications()
  }, [])

  const loadPreferences = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getNotificationPreferences()
      setPreferences(response.data)
    } catch (err: any) {
      setError(err.message || "Failed to load notification preferences")
    } finally {
      setLoading(false)
    }
  }

  const loadInAppNotifications = async () => {
    try {
      setNotificationsLoading(true)
      const [notifResponse, countResponse] = await Promise.all([
        apiClient.getInAppNotifications({ limit: 20 }),
        apiClient.getUnreadNotificationCount(),
      ])
      setInAppNotifications(notifResponse.data?.notifications || [])
      setUnreadCount(countResponse.data?.unreadCount || 0)
    } catch (err: any) {
      console.error("Failed to load in-app notifications:", err)
    } finally {
      setNotificationsLoading(false)
    }
  }

  const handleToggleChannel = (channel: string, enabled: boolean) => {
    setPreferences((prev: any) => ({
      ...prev,
      [`${channel}Enabled`]: enabled,
    }))
  }

  const handleTypeChannelToggle = (type: string, channel: string) => {
    setPreferences((prev: any) => {
      const typePrefs = { ...(prev.typeChannelPreferences || {}) }
      const currentChannels = typePrefs[type] || []
      
      if (currentChannels.includes(channel)) {
        typePrefs[type] = currentChannels.filter((c: string) => c !== channel)
      } else {
        typePrefs[type] = [...currentChannels, channel]
      }

      return { ...prev, typeChannelPreferences: typePrefs }
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const updateData: any = {}
      const fields = [
        "emailEnabled", "smsEnabled", "pushEnabled", "inAppEnabled", "webhookEnabled",
        "email", "phoneNumber", "webhookUrl",
        "typeChannelPreferences",
        "quietHoursEnabled", "quietHoursStart", "quietHoursEnd", "quietHoursTimezone",
        "digestEnabled", "digestFrequency",
        "maxEmailPerHour", "maxSmsPerHour", "maxPushPerHour", "maxInAppPerHour",
      ]

      for (const field of fields) {
        if (preferences[field] !== undefined) {
          updateData[field] = preferences[field]
        }
      }

      await apiClient.updateNotificationPreferences(updateData)
      setSuccess("Notification preferences saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || "Failed to save preferences")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      setSaving(true)
      await apiClient.resetNotificationPreferences()
      await loadPreferences()
      setSuccess("Preferences reset to defaults!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || "Failed to reset preferences")
    } finally {
      setSaving(false)
    }
  }

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiClient.markNotificationAsRead(id)
      setInAppNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (err: any) {
      console.error("Failed to mark as read:", err)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsAsRead()
      setInAppNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      )
      setUnreadCount(0)
    } catch (err: any) {
      console.error("Failed to mark all as read:", err)
    }
  }

  const handleArchive = async (id: string) => {
    try {
      await apiClient.archiveNotification(id)
      setInAppNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (err: any) {
      console.error("Failed to archive:", err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Notification Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage how and when you receive notifications
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Bell className="h-4 w-4 mr-2" />
          {unreadCount} unread
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6 border-green-500 text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="channels">Channel Preferences</TabsTrigger>
          <TabsTrigger value="types">Per-Type Settings</TabsTrigger>
          <TabsTrigger value="inbox">Inbox ({unreadCount})</TabsTrigger>
        </TabsList>

        {/* Channel Preferences Tab */}
        <TabsContent value="channels" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Channel Master Toggles</CardTitle>
              <CardDescription>
                Enable or disable entire notification channels
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {CHANNELS.map((channel) => {
                const Icon = channel.icon
                const enabled = preferences?.[`${channel.id}Enabled`]
                return (
                  <div key={channel.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Icon className={`h-5 w-5 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <Label className="font-medium">{channel.label}</Label>
                        <p className="text-sm text-muted-foreground">{channel.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => handleToggleChannel(channel.id, checked)}
                    />
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
              <CardDescription>
                Configure your contact information for notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={preferences?.email || ""}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number (E.164 format)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1234567890"
                  value={preferences?.phoneNumber || ""}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, phoneNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook">Webhook URL</Label>
                <Input
                  id="webhook"
                  type="url"
                  placeholder="https://your-webhook.com/notifications"
                  value={preferences?.webhookUrl || ""}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, webhookUrl: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quiet Hours</CardTitle>
              <CardDescription>
                Suppress non-urgent notifications during specific hours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <Label>Enable Quiet Hours</Label>
                </div>
                <Switch
                  checked={preferences?.quietHoursEnabled || false}
                  onCheckedChange={(checked) => setPreferences((prev: any) => ({ ...prev, quietHoursEnabled: checked }))}
                />
              </div>
              {preferences?.quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quietStart">Start Time</Label>
                    <Input
                      id="quietStart"
                      placeholder="22:00"
                      value={preferences?.quietHoursStart || "22:00"}
                      onChange={(e) => setPreferences((prev: any) => ({ ...prev, quietHoursStart: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quietEnd">End Time</Label>
                    <Input
                      id="quietEnd"
                      placeholder="07:00"
                      value={preferences?.quietHoursEnd || "07:00"}
                      onChange={(e) => setPreferences((prev: any) => ({ ...prev, quietHoursEnd: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limits</CardTitle>
              <CardDescription>
                Maximum notifications per hour per channel
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Emails/Hour</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={preferences?.maxEmailPerHour || 10}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, maxEmailPerHour: parseInt(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max SMS/Hour</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={preferences?.maxSmsPerHour || 5}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, maxSmsPerHour: parseInt(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Push/Hour</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={preferences?.maxPushPerHour || 20}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, maxPushPerHour: parseInt(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max In-App/Hour</Label>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  value={preferences?.maxInAppPerHour || 50}
                  onChange={(e) => setPreferences((prev: any) => ({ ...prev, maxInAppPerHour: parseInt(e.target.value) }))}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Preferences
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              <Undo2 className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </TabsContent>

        {/* Per-Type Settings Tab */}
        <TabsContent value="types" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Type Channels</CardTitle>
              <CardDescription>
                Configure which channels each notification type uses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {NOTIFICATION_TYPES.map((type) => {
                const typePrefs = preferences?.typeChannelPreferences?.[type.id] || []
                return (
                  <div key={type.id} className="space-y-3 p-4 border rounded-lg">
                    <div>
                      <h3 className="font-medium">{type.label}</h3>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CHANNELS.map((channel) => {
                        const isEnabled = typePrefs.includes(channel.id)
                        const masterEnabled = preferences?.[`${channel.id}Enabled`]
                        const Icon = channel.icon
                        return (
                          <Badge
                            key={channel.id}
                            variant={isEnabled ? "default" : "outline"}
                            className={`cursor-pointer transition-all ${
                              !masterEnabled ? "opacity-40 cursor-not-allowed" : ""
                            }`}
                            onClick={() => {
                              if (masterEnabled) {
                                handleTypeChannelToggle(type.id, channel.id)
                              }
                            }}
                          >
                            <Icon className="h-3 w-3 mr-1" />
                            {channel.label}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Preferences
            </Button>
          </div>
        </TabsContent>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="space-y-6 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>In-App Notifications</CardTitle>
                <CardDescription>
                  Your recent notifications ({unreadCount} unread)
                </CardDescription>
              </div>
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                  <Eye className="h-4 w-4 mr-2" />
                  Mark All Read
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {notificationsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : inAppNotifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BellOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inAppNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                        !notification.isRead ? "bg-primary/5 border-primary/20" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {!notification.isRead && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                          <h4 className={`font-medium truncate ${!notification.isRead ? "text-primary" : ""}`}>
                            {notification.title}
                          </h4>
                          <Badge variant="secondary" className="ml-auto flex-shrink-0">
                            {notification.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.body}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleMarkAsRead(notification.id)}
                            title="Mark as read"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleArchive(notification.id)}
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}