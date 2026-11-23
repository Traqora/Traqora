"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Loader2, AlertCircle, RefreshCw, FileText } from "lucide-react";
import { RefundStatusTracker, Refund } from "./RefundStatusTracker";

interface UserRefundTrackingViewProps {
  bookingId?: string;
  refundId?: string;
}

export function UserRefundTrackingView({ bookingId, refundId }: UserRefundTrackingViewProps) {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRefunds = async () => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = "/api/v1/refunds";
      if (refundId) {
        endpoint = `/api/v1/refunds/${refundId}`;
      } else if (bookingId) {
        endpoint = `/api/v1/refunds/booking/${bookingId}`;
      }

      const response = await fetch(endpoint);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to fetch refund details");
      }

      if (refundId) {
        setRefunds([result.data]);
      } else if (Array.isArray(result.data)) {
        setRefunds(result.data);
      } else if (result.data) {
        setRefunds([result.data]);
      } else {
        setRefunds([]);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while loading refund status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, [bookingId, refundId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12" role="status" aria-label="Loading refund tracking information">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchRefunds}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (refunds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Refund Tracking</CardTitle>
          <CardDescription>No refund requests found for this itinerary.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mb-2 opacity-50" />
          <p>There are no active or past refund requests associated with this booking.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold tracking-tight">Refund Status & Timeline</h2>
        <Button variant="outline" size="sm" onClick={fetchRefunds}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh Status
        </Button>
      </div>
      {refunds.map((refund) => (
        <RefundStatusTracker key={refund.id} refund={refund} />
      ))}
    </div>
  );
}
