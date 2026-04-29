"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/components/socket/SocketProvider";
import { Refund } from "@/components/refunds/RefundStatusTracker";
import { useToast } from "@/hooks/use-toast";

export function useRefundStatus(refundId: string) {
  const [refund, setRefund] = useState<Refund | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { manager, connected } = useSocket();
  const { toast } = useToast();

  useEffect(() => {
    if (!refundId) return;

    const fetchRefund = async () => {
      try {
        const response = await fetch(`/api/v1/refunds/${refundId}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to fetch refund");
        }

        setRefund(result.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRefund();

    // Subscribe to real-time updates if socket is connected
    if (connected) {
      const handleRefundUpdate = (data: { refundId: string; status: string }) => {
        if (data.refundId === refundId) {
          toast({
            description: `Refund status updated to: ${data.status}`,
          });
          fetchRefund(); // Refetch to get latest data
        }
      };

      manager.on('refundStatusUpdate', handleRefundUpdate);

      return () => {
        manager.off('refundStatusUpdate', handleRefundUpdate);
      };
    }
  }, [refundId, connected, manager, toast]);

  const refresh = () => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/v1/refunds/${refundId}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setRefund(result.data);
        } else {
          throw new Error(result.error?.message || "Failed to refresh");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  };

  return { refund, isLoading, error, refresh, connected };
}
