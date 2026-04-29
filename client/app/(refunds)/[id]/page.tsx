"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RefundStatusTracker, Refund } from "@/components/refunds/RefundStatusTracker";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertCircle, Scale } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DisputeForm } from "@/components/refunds/DisputeForm";
import { AppealForm } from "@/components/refunds/AppealForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRefundStatus } from "@/hooks/useRefundStatus";

export default function RefundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { refund, isLoading, error } = useRefundStatus(params.id as string);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [showAppealForm, setShowAppealForm] = useState(false);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/refunds/status">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Status
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!refund) return null;

  const canDispute = refund.status === "rejected" || refund.status === "manual_review";
  const canAppeal = refund.status === "rejected";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/refunds/status">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Status
        </Button>
      </Link>

      <RefundStatusTracker refund={refund} />

      {/* Dispute/Appeal Options */}
      {(canDispute || canAppeal) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="font-serif">Need Help?</CardTitle>
            <CardDescription>
              If you disagree with this decision, you have options.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canDispute && !showDisputeForm && (
              <Button
                onClick={() => setShowDisputeForm(true)}
                className="w-full"
                variant="outline"
              >
                <Scale className="mr-2 h-4 w-4" />
                File a Dispute
              </Button>
            )}
            {canAppeal && !showAppealForm && (
              <Button
                onClick={() => setShowAppealForm(true)}
                className="w-full"
                variant="outline"
              >
                <Scale className="mr-2 h-4 w-4" />
                File an Appeal
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dispute Form */}
      {showDisputeForm && (
        <div className="mt-6">
          <Button
            variant="ghost"
            onClick={() => setShowDisputeForm(false)}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <DisputeForm
            refundId={refund.id}
            onSuccess={(disputeId) => {
              setShowDisputeForm(false);
              router.push(`/refunds/dispute/${disputeId}`);
            }}
            onCancel={() => setShowDisputeForm(false)}
          />
        </div>
      )}

      {/* Appeal Form */}
      {showAppealForm && (
        <div className="mt-6">
          <Button
            variant="ghost"
            onClick={() => setShowAppealForm(false)}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <AppealForm
            disputeId={refund.id}
            onSuccess={(appealId) => {
              setShowAppealForm(false);
              router.push(`/refunds/appeal/${appealId}`);
            }}
            onCancel={() => setShowAppealForm(false)}
          />
        </div>
      )}
    </div>
  );
}
