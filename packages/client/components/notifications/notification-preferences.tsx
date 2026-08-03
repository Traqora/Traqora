"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check } from "lucide-react";
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationFrequency,
} from "@/types/notification";

interface NotificationPreference {
  channel: NotificationChannel;
  category: NotificationCategory;
  frequency: NotificationFrequency;
  enabled: boolean;
}

const CATEGORIES: NotificationCategory[] = [
  "booking",
  "payment",
  "itinerary",
  "collaboration",
  "marketing",
  "system",
];
const CHANNELS: NotificationChannel[] = ["email", "sms", "push", "inapp"];
const FREQUENCIES: NotificationFrequency[] = [
  "instant",
  "daily",
  "weekly",
  "never",
];

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications/preferences");
      if (!res.ok) throw new Error("Failed to fetch preferences");

      const data = await res.json();

      // Build preference matrix
      const prefs: NotificationPreference[] = [];
      for (const category of CATEGORIES) {
        for (const channel of CHANNELS) {
          const existing = data.preferences.find(
            (p: any) => p.category === category && p.channel === channel,
          );
          prefs.push(
            existing || {
              channel,
              category,
              frequency: "instant",
              enabled: true,
            },
          );
        }
      }
      setPreferences(prefs);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load preferences",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (
    channel: NotificationChannel,
    category: NotificationCategory,
    field: "enabled" | "frequency",
    value: any,
  ) => {
    const updated = preferences.map((p) => {
      if (p.channel === channel && p.category === category) {
        return { ...p, [field]: value };
      }
      return p;
    });
    setPreferences(updated);

    try {
      const pref = updated.find(
        (p) => p.channel === channel && p.category === category,
      )!;
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          category,
          frequency: pref.frequency,
          enabled: pref.enabled,
        }),
      });

      if (!res.ok) throw new Error("Failed to update preference");

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to save preference",
      );
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading preferences...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Customize how and when you receive notifications
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {saved && (
            <div className="flex gap-2 p-3 rounded-lg bg-green-50 text-green-700 text-sm mb-4">
              <Check className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Preferences saved successfully</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Category
                  </th>
                  {CHANNELS.map((channel) => (
                    <th
                      key={channel}
                      className="text-center py-3 px-4 font-semibold text-sm"
                    >
                      {channel.charAt(0).toUpperCase() + channel.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((category) => (
                  <tr key={category} className="border-b hover:bg-muted/50">
                    <td className="py-4 px-4">
                      <Badge variant="outline">{category}</Badge>
                    </td>
                    {CHANNELS.map((channel) => {
                      const pref = preferences.find(
                        (p) => p.channel === channel && p.category === category,
                      )!;
                      return (
                        <td key={channel} className="py-4 px-4">
                          <div className="flex flex-col items-center gap-2">
                            <Switch
                              checked={pref.enabled}
                              onCheckedChange={(checked) =>
                                handleUpdate(
                                  channel,
                                  category,
                                  "enabled",
                                  checked,
                                )
                              }
                            />
                            {pref.enabled && (
                              <Select
                                value={pref.frequency}
                                onValueChange={(value) =>
                                  handleUpdate(
                                    channel,
                                    category,
                                    "frequency",
                                    value,
                                  )
                                }
                              >
                                <SelectTrigger className="w-24 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FREQUENCIES.map((freq) => (
                                    <SelectItem key={freq} value={freq}>
                                      {freq.charAt(0).toUpperCase() +
                                        freq.slice(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
