"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { defaultManager, SocketManager } from "@/lib/socket";
import { useToast } from "@/hooks/use-toast";

type SocketContextValue = {
  manager: SocketManager;
  connected: boolean;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const manager = useMemo(() => defaultManager, []);
  const { toast } = useToast();

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("token") || undefined
        : undefined;
    manager.connect(token);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    manager.on("connect", onConnect);
    manager.on("disconnect", onDisconnect);

    manager.onPriceUpdate((data) => {
      toast({
        title: "Price update",
        description: `${data.flightId} now ${data.price}`,
      });
    });

    manager.onBookingStatus((data) => {
      toast({
        title: "Booking update",
        description: `Booking ${data.bookingId} is ${data.status}`,
      });
    });

    // Flight Status Events
    manager.onFlightDelayed((data) => {
      toast({
        title: `⚠️ Flight ${data.flightNumber} Delayed`,
        description: `Delayed by ${data.delayMinutes} minutes`,
        variant: "destructive",
      });
    });

    manager.onGateChanged((data) => {
      toast({
        title: `Gate Change: ${data.flightNumber}`,
        description: `Gate changed to ${data.newGate}`,
      });
    });

    manager.onFlightCancelled((data) => {
      toast({
        title: `❌ Flight ${data.flightNumber} Cancelled`,
        description: data.cancellationReason || "No reason provided",
        variant: "destructive",
      });
    });

    manager.onBoardingReminder((data) => {
      toast({
        title: `🔔 Boarding Soon: ${data.flightNumber}`,
        description: `Boarding at gate ${data.gate} in 45 minutes`,
      });
    });

    manager.onFlightStatusUpdate((data) => {
      toast({
        title: `Flight ${data.flightNumber} Update`,
        description: `Status: ${data.status}`,
      });
    });

    return () => {
      manager.off("connect", onConnect);
      manager.off("disconnect", onDisconnect);
      manager.disconnect();
    };
  }, [manager, toast]);

  const value: SocketContextValue = useMemo(
    () => ({ manager, connected }),
    [manager, connected],
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
