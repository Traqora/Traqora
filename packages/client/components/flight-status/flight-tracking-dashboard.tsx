"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlightStatusCard } from "./flight-status-card";
import { Plane, Search, TrendingUp, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFlightSocket } from "@/hooks/use-socket-events";

interface FollowedFlight {
  id: string;
  userId: string;
  flightId: string;
  flightNumber: string;
  airlineCode: string;
  notificationsEnabled: boolean;
}

interface FlightDetail {
  id: string;
  flightNumber: string;
  airlineCode: string;
  fromAirport: string;
  toAirport: string;
  departureTime: string;
  arrivalTime?: string;
  status: string;
  delayMinutes: number;
  gate?: string;
  terminal?: string;
  cancellationReason?: string;
}

interface RoutePerformance {
  totalFlights: number;
  onTime: number;
  delayed: number;
  cancelled: number;
  averageDelay: number;
  onTimePercentage: number;
}

export function FlightTrackingDashboard() {
  const [followedFlights, setFollowedFlights] = useState<FollowedFlight[]>([]);
  const [flightDetails, setFlightDetails] = useState<
    Record<string, FlightDetail>
  >({});
  const [flightIdInput, setFlightIdInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("");
  const [routePerformance, setRoutePerformance] =
    useState<RoutePerformance | null>(null);
  const { toast } = useToast();
  const { onFlightEvent } = useFlightSocket();

  // Load followed flights
  useEffect(() => {
    loadFollowedFlights();
  }, []);

  const loadFollowedFlights = async () => {
    try {
      setLoading(true);
      const res = await api.get("/flights/following");
      const followed: FollowedFlight[] = res.data?.data || [];

      setFollowedFlights(followed);

      // Load details for each followed flight
      const details: Record<string, FlightDetail> = {};
      for (const f of followed) {
        try {
          const flightRes = await api.get(`/flights/${f.flightId}/status`);
          if (flightRes.data?.data) {
            details[f.flightId] = flightRes.data.data;
          }
        } catch {
          // flight might not be accessible
        }
      }
      setFlightDetails(details);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load followed flights",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFollowFlight = async () => {
    if (!flightIdInput.trim()) return;
    try {
      await api.post(`/flights/${flightIdInput}/follow`);
      toast({ title: "Success", description: "Now following flight" });
      setFlightIdInput("");
      loadFollowedFlights();
    } catch {
      toast({
        title: "Error",
        description: "Failed to follow flight. Check the flight ID.",
        variant: "destructive",
      });
    }
  };

  const handleUnfollowFlight = async (flightId: string) => {
    try {
      await api.delete(`/flights/${flightId}/follow`);
      toast({
        title: "Unfollowed",
        description: "Stopped following flight",
      });
      loadFollowedFlights();
    } catch {
      toast({
        title: "Error",
        description: "Failed to unfollow flight",
        variant: "destructive",
      });
    }
  };

  const handleCheckRoutePerformance = async () => {
    if (!routeFrom || !routeTo) return;
    try {
      const res = await api.get(
        `/flights/route-performance?from=${routeFrom.toUpperCase()}&to=${routeTo.toUpperCase()}`,
      );
      setRoutePerformance(res.data?.data || null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load route performance data",
        variant: "destructive",
      });
    }
  };

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 75) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          Flight Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="following">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="following">Following</TabsTrigger>
            <TabsTrigger value="track">Track Flight</TabsTrigger>
            <TabsTrigger value="performance">Route Performance</TabsTrigger>
          </TabsList>

          {/* Following Tab */}
          <TabsContent value="following" className="space-y-4 pt-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading followed flights...
              </div>
            ) : followedFlights.length === 0 ? (
              <div className="text-center py-8">
                <Plane className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No Flights Tracked</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Follow a flight to receive real-time status updates
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {followedFlights.map((f) => {
                  const detail = flightDetails[f.flightId];
                  if (!detail) return null;

                  return (
                    <FlightStatusCard
                      key={f.id}
                      flight={{
                        id: detail.id,
                        flightNumber: detail.flightNumber,
                        airline: detail.airlineCode,
                        from: detail.fromAirport,
                        to: detail.toAirport,
                        departureTime: detail.departureTime,
                        arrivalTime: detail.arrivalTime,
                        status: detail.status,
                        delayMinutes: detail.delayMinutes,
                        gate: detail.gate,
                        terminal: detail.terminal,
                        cancellationReason: detail.cancellationReason,
                      }}
                      isFollowing={f.notificationsEnabled}
                      onFollowToggle={() => handleUnfollowFlight(f.flightId)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Track Flight Tab */}
          <TabsContent value="track" className="space-y-4 pt-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Flight ID
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter flight ID (UUID)"
                    value={flightIdInput}
                    onChange={(e) => setFlightIdInput(e.target.value)}
                  />
                  <Button onClick={handleFollowFlight}>
                    <Search className="h-4 w-4 mr-1" />
                    Follow
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  You can find the flight ID in your booking confirmation or
                  search results.
                </p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">How Flight Tracking Works</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>
                    • Enter a flight ID to start receiving real-time updates
                  </li>
                  <li>• Get notified of delays over 30 minutes</li>
                  <li>• Receive gate change alerts instantly</li>
                  <li>• Cancellation notifications with auto-refund</li>
                  <li>• Boarding reminders 45 minutes before departure</li>
                  <li>• No booking required to track a flight</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          {/* Route Performance Tab */}
          <TabsContent value="performance" className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="From (e.g. JFK)"
                value={routeFrom}
                onChange={(e) => setRouteFrom(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-24"
              />
              <Input
                placeholder="To (e.g. LAX)"
                value={routeTo}
                onChange={(e) => setRouteTo(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-24"
              />
              <Button onClick={handleCheckRoutePerformance}>
                <TrendingUp className="h-4 w-4 mr-1" />
                Check
              </Button>
            </div>

            {routePerformance && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted p-3 rounded-lg text-center">
                    <p className="text-2xl font-bold">
                      {routePerformance.totalFlights}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total Flights
                    </p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg text-center">
                    <p
                      className={`text-2xl font-bold ${getPerformanceColor(routePerformance.onTimePercentage)}`}
                    >
                      {routePerformance.onTimePercentage}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      On-Time Performance
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> On Time
                    </span>
                    <span className="text-sm font-medium">
                      {routePerformance.onTime}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Delayed
                    </span>
                    <span className="text-sm font-medium">
                      {routePerformance.delayed}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Cancelled
                    </span>
                    <span className="text-sm font-medium">
                      {routePerformance.cancelled}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">
                      Average Delay
                    </span>
                    <span className="text-sm font-medium">
                      {routePerformance.averageDelay} min
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!routePerformance && (
              <p className="text-sm text-muted-foreground">
                Enter an origin and destination to see historical on-time
                performance data.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
