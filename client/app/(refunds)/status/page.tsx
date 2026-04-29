"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RefundStatusTracker, Refund } from "@/components/refunds/RefundStatusTracker";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function RefundStatusPage() {
  const [refundId, setRefundId] = useState("");
  const [refund, setRefund] = useState<Refund | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!refundId.trim()) return;

    setIsLoading(true);
    setError(null);
    setRefund(null);

    try {
      const response = await fetch(`/api/v1/refunds/${refundId}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Refund not found");
      }

      setRefund(result.data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch refund status");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link href="/refunds">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Refunds
          </Button>
        </Link>
        <h1 className="text-3xl font-serif font-bold mb-2">Track Refund Status</h1>
        <p className="text-muted-foreground">
          Enter your refund ID to check the current status of your refund request.
        </p>
      </div>

      {/* Search Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <Input
              placeholder="Enter refund ID (e.g., 123e4567-e89b-12d3-a456-426614174000)"
              value={refundId}
              onChange={(e) => setRefundId(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {refund && <RefundStatusTracker refund={refund} />}
    </div>
  );
}
