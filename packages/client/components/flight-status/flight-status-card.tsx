"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plane,
  Clock,
  MapPin,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Bell,
  BellOff,
  Share2,
  History,
} from "lucide-react";
import { api } from "@/lib/api";
import { useFlightSocket } from "@/hooks/use-socket-events";
import { useToast } from "@/hooks/use-toast";

interface FlightStatusData {
  id: string;
  flightNumber: string;
  airline: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime?: string;
  status: string;
  delayMinutes: number;
  gate?: string;
  terminal?: string;
  cancellationReason?: string;
}

interface StatusEvent {
  id: string;
  eventType: string;
  message?: string;
  delayMinutes?: number;
  newGate?: string;
  previousGate?: string;
  createdAt: string;
}

interface FlightStatusCardProps {
  flight: FlightStatusData;
  isFollowing?: boolean;
  onFollowToggle?: () => void;
}

function getStatusBadge(status: string, delayMinutes?: number) {
  switch (status) {
    case "SCHEDULED":
      return delayMinutes && delayMinutes > 0 ? (
        <Badge
          variant="warning"
          className="bg-amber-100 text-amber-800 border-amber-200"
        >
          <Clock className="h-3 w-3 mr-1" />
          Delayed {delayMinutes}min
        </Badge>
      ) : (
        <Badge variant="secondary">
          <CheckCircle className="h-3 w-3 mr-1" />
          On Time
        </Badge>
      );
    case "DELAYED":
      return (
        <Badge
          variant="warning"
          className="bg-amber-100 text-amber-800 border-amber-200"
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          Delayed {delayMinutes}min
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    case "DEPARTED":
      return (
        <Badge
          variant="default"
          className="bg-blue-100 text-blue-800 border-blue-200"
        >
          <Plane className="h-3 w-3 mr-1" />
          Departed
        </Badge>
      );
    case "LANDED":
      return (
        <Badge
          variant="default"
          className="bg-green-100 text-green-800 border-green-200"
        >
          <CheckCircle className="h-3 w-3 mr-1" />
          Landed
        </Badge>
      );
    case "DIVERTED":
      return (
        <Badge
          variant="destructive"
          className="bg-purple-100 text-purple-800 border-purple-200"
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          Diverted
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function FlightStatusCard({
  flight,
  isFollowing = false,
  onFollowToggle,
}: FlightStatusCardProps) {
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const { onFlightEvent } = useFlightSocket(flight.id);
  const { toast } = useToast();

  // Listen for real-time status updates
  useEffect(() => {
    const unsubDelayed = onFlightEvent("flight-delayed", (data) => {
      toast({
        title: `⚠️ ${flight.flightNumber} Delayed`,
        description: `Delayed by ${data.delayMinutes} minutes`,
        variant: "destructive",
      });
    });

    const unsubGate = onFlightEvent("gate-changed", (data) => {
      toast({
        title: `Gate Change: ${flight.flightNumber}`,
        description: `Gate changed to ${data.newGate}`,
      });
    });

    const unsubCancelled = onFlightEvent("flight-cancelled", (data) => {
      toast({
        title: `❌ ${flight.flightNumber} Cancelled`,
        description: data.cancellationReason || "No reason provided",
        variant: "destructive",
      });
    });

    const unsubBoarding = onFlightEvent("boarding-reminder", (data) => {
      toast({
        title: `🔔 Boarding Soon: ${flight.flightNumber}`,
        description: `Boarding at gate ${data.gate} in 45 minutes`,
      });
    });

    return () => {
      unsubDelayed?.();
      unsubGate?.();
      unsubCancelled?.();
      unsubBoarding?.();
    };
  }, [flight.id, flight.flightNumber, onFlightEvent, toast]);

  // Load status history
  useEffect(() => {
    if (!showHistory) return;
    api
      .get(`/flights/${flight.id}/history`)
      .then((res: any) => setEvents(res.data?.data || []))
      .catch(() => {});
  }, [flight.id, showHistory]);

  const handleShare = async () => {
    if (!shareEmail) return;
    try {
      await api.post(`/flights/${flight.id}/share`, {
        recipientEmail: shareEmail,
      });
      toast({
        title: "Shared",
        description: `Flight status shared with ${shareEmail}`,
      });
      setShareEmail("");
      setShowShare(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to share flight status",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "DELAYED":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "ON_TIME":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "CANCELLED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "GATE_CHANGED":
        return <MapPin className="h-4 w-4 text-blue-500" />;
      case "BOARDING":
        return <Plane className="h-4 w-4 text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            {flight.airline} {flight.flightNumber}
          </CardTitle>
          <div className="flex items-center gap-2">
            {getStatusBadge(flight.status, flight.delayMinutes)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Route Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{flight.from}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold">{flight.to}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatDate(flight.departureTime)}
          </span>
        </div>

        {/* Gate / Terminal */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {flight.gate ? `Gate ${flight.gate}` : "Gate TBD"}
            {flight.terminal ? ` · Terminal ${flight.terminal}` : ""}
          </span>
          {flight.cancellationReason && (
            <span className="text-red-500 text-xs">
              {flight.cancellationReason}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant={isFollowing ? "default" : "outline"}
            size="sm"
            onClick={onFollowToggle}
          >
            {isFollowing ? (
              <>
                <Bell className="h-4 w-4 mr-1" />
                Following
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 mr-1" />
                Follow
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShare(!showShare)}
          >
            <Share2 className="h-4 w-4 mr-1" />
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4 mr-1" />
            History
          </Button>
        </div>

        {/* Share Input */}
        {showShare && (
          <div className="flex gap-2 pt-2">
            <Input
              type="email"
              placeholder="Enter email to share status"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />
            <Button size="sm" onClick={handleShare}>
              Send
            </Button>
          </div>
        )}

        {/* Status History */}
        {showHistory && events.length > 0 && (
          <div className="pt-2 space-y-2 max-h-48 overflow-y-auto">
            <h4 className="text-sm font-medium text-muted-foreground">
              Status History
            </h4>
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-sm">
                <div className="mt-0.5">{getEventIcon(event.eventType)}</div>
                <div className="flex-1">
                  <p className="text-sm">
                    {event.eventType === "DELAYED" &&
                      `Delayed by ${event.delayMinutes} minutes`}
                    {event.eventType === "GATE_CHANGED" &&
                      `Gate changed from ${event.previousGate || "N/A"} to ${event.newGate || "N/A"}`}
                    {event.eventType === "CANCELLED" &&
                      `Cancelled: ${event.message || "No reason"}`}
                    {event.eventType === "BOARDING" && "Boarding started"}
                    {event.eventType === "DEPARTED" && "Flight departed"}
                    {event.eventType === "LANDED" && "Flight landed"}
                    {event.eventType === "ON_TIME" && "Flight is on time"}
                    {![
                      "DELAYED",
                      "GATE_CHANGED",
                      "CANCELLED",
                      "BOARDING",
                      "DEPARTED",
                      "LANDED",
                      "ON_TIME",
                    ].includes(event.eventType) &&
                      (event.message || event.eventType)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {showHistory && events.length === 0 && (
          <p className="text-sm text-muted-foreground pt-2">
            No status events recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
