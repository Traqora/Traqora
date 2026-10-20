"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Bell, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface NotificationPreferences {
  emailEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
  pushBookingEnabled: boolean
  pushReminderEnabled: boolean
  pushRefundEnabled: boolean
  pushPromoEnabled: boolean
  pushOptedIn: boolean
  pushOptInAt?: string
  email?: string
  phoneNumber?: string
}

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/v1/users/preferences', {
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPreferences(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
      toast.error('Failed to load notification preferences')
    } finally {
      setIsLoading(false)
    }
  }

  const updatePreferences = async (updates: Partial<NotificationPreferences>) => {
    if (!preferences) return

    setIsSaving(true)
    try {
      const response = await fetch('/api/v1/users/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      })

      const data = await response.json()
      if (data.success) {
        setPreferences({ ...preferences, ...updates })
        toast.success('Preferences updated successfully')
      } else {
        toast.error('Failed to update preferences')
      }
    } catch (error) {
      console.error('Failed to update preferences:', error)
      toast.error('Failed to update preferences')
    } finally {
      setIsSaving(false)
    }
  }

  const requestPushPermission = async () => {
    setIsRequestingPermission(true)

    try {
      // Request browser notification permission
      const permission = await Notification.requestPermission()

      if (permission === 'granted') {
        // Get FCM token (this would be integrated with Firebase)
        // For now, we'll simulate token registration
        const mockToken = 'mock-fcm-token-' + Date.now()

        const response = await fetch('/api/v1/users/push/opt-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            token: mockToken,
            platform: 'web',
            enabledTypes: ['booking', 'reminder', 'refund'],
          }),
        })

        const data = await response.json()
        if (data.success) {
          toast.success('Push notifications enabled!')
          await fetchPreferences()
        } else {
          toast.error('Failed to enable push notifications')
        }
      } else {
        toast.error('Notification permission denied')
      }
    } catch (error) {
      console.error('Failed to request push permission:', error)
      toast.error('Failed to enable push notifications')
    } finally {
      setIsRequestingPermission(false)
    }
  }

  const optOutPush = async () => {
    try {
      const response = await fetch('/api/v1/users/push/opt-out', {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()
      if (data.success) {
        toast.success('Push notifications disabled')
        await fetchPreferences()
      } else {
        toast.error('Failed to disable push notifications')
      }
    } catch (error) {
      console.error('Failed to opt out:', error)
      toast.error('Failed to disable push notifications')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!preferences) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Failed to load preferences
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Manage how you receive notifications about your bookings and account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Push Notifications */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications in your browser
              </p>
            </div>
            {preferences.pushOptedIn ? (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Enabled
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={optOutPush}
                  disabled={isSaving}
                >
                  Disable
                </Button>
              </div>
            ) : (
              <Button
                onClick={requestPushPermission}
                disabled={isRequestingPermission}
                size="sm"
              >
                {isRequestingPermission ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  'Enable'
                )}
              </Button>
            )}
          </div>

          {preferences.pushOptedIn && (
            <div className="space-y-3 pl-4 border-l-2 border-border">
              <div className="flex items-center justify-between">
                <Label htmlFor="booking" className="text-sm">
                  Booking confirmations
                </Label>
                <Switch
                  id="booking"
                  checked={preferences.pushBookingEnabled}
                  onCheckedChange={(checked) =>
                    updatePreferences({ pushBookingEnabled: checked })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reminder" className="text-sm">
                  Flight reminders
                </Label>
                <Switch
                  id="reminder"
                  checked={preferences.pushReminderEnabled}
                  onCheckedChange={(checked) =>
                    updatePreferences({ pushReminderEnabled: checked })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="refund" className="text-sm">
                  Refund updates
                </Label>
                <Switch
                  id="refund"
                  checked={preferences.pushRefundEnabled}
                  onCheckedChange={(checked) =>
                    updatePreferences({ pushRefundEnabled: checked })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="promo" className="text-sm">
                  Promotional offers
                </Label>
                <Switch
                  id="promo"
                  checked={preferences.pushPromoEnabled}
                  onCheckedChange={(checked) =>
                    updatePreferences({ pushPromoEnabled: checked })
                  }
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Email Notifications */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <Switch
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) =>
                updatePreferences({ emailEnabled: checked })
              }
              disabled={isSaving}
            />
          </div>
          {preferences.emailEnabled && (
            <div className="pl-4 border-l-2 border-border">
              <Label htmlFor="email" className="text-sm">
                Email address
              </Label>
              <input
                id="email"
                type="email"
                value={preferences.email || ''}
                onChange={(e) => updatePreferences({ email: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md"
                placeholder="your@email.com"
                disabled={isSaving}
              />
            </div>
          )}
        </div>

        <Separator />

        {/* SMS Notifications */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">SMS Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via text message
              </p>
            </div>
            <Switch
              checked={preferences.smsEnabled}
              onCheckedChange={(checked) =>
                updatePreferences({ smsEnabled: checked })
              }
              disabled={isSaving}
            />
          </div>
          {preferences.smsEnabled && (
            <div className="pl-4 border-l-2 border-border">
              <Label htmlFor="phone" className="text-sm">
                Phone number
              </Label>
              <input
                id="phone"
                type="tel"
                value={preferences.phoneNumber || ''}
                onChange={(e) => updatePreferences({ phoneNumber: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md"
                placeholder="+1 (555) 000-0000"
                disabled={isSaving}
              />
            </div>
          )}
        </div>

        {preferences.pushOptInAt && (
          <div className="text-xs text-muted-foreground">
            Push notifications opted in on{' '}
            {new Date(preferences.pushOptInAt).toLocaleDateString()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
