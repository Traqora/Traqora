"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clock, XCircle, AlertTriangle, Loader2, Calendar, DollarSign, FileText } from "lucide-react";

export type RefundStatus =
  | "pending"
  | "eligibility_check"
  | "approved"
  | "rejected"
  | "processing"
  | "stripe_refunded"
  | "onchain_pending"
  | "onchain_submitted"
  | "completed"
  | "failed"
  | "manual_review"
  | "delayed_pending"
  | "delayed_cancelled";

export type RefundReason =
  | "flight_cancelled"
  | "flight_delayed"
  | "customer_request"
  | "duplicate_booking"
  | "service_issue"
  | "other";

export interface Refund {
  id: string;
  status: RefundStatus;
  reason: RefundReason;
  reasonDetails?: string;
  requestedAmountCents: number;
  approvedAmountCents?: number;
  processingFeeCents: number;
  isEligible: boolean;
  eligibilityNotes?: string;
  requiresManualReview: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  stripeRefundId?: string;
  sorobanTxHash?: string;
  createdAt: string;
  updatedAt: string;
  isDelayed?: boolean;
  delayedUntil?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

interface RefundStatusTrackerProps {
  refund: Refund;
}

const statusConfig: Record<
  RefundStatus,
  { label: string; icon: React.ReactNode; color: string; description: string }
> = {
  pending: {
    label: "Pending",
    icon: <Clock className="h-4 w-4" />,
    color: "bg-yellow-100 text-yellow-800",
    description: "Your refund request is being reviewed",
  },
  eligibility_check: {
    label: "Eligibility Check",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "bg-blue-100 text-blue-800",
    description: "Checking refund eligibility",
  },
  approved: {
    label: "Approved",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "bg-green-100 text-green-800",
    description: "Refund has been approved",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle className="h-4 w-4" />,
    color: "bg-red-100 text-red-800",
    description: "Refund request was rejected",
  },
  processing: {
    label: "Processing",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "bg-blue-100 text-blue-800",
    description: "Refund is being processed",
  },
  stripe_refunded: {
    label: "Stripe Refunded",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "bg-green-100 text-green-800",
    description: "Refund processed via Stripe",
  },
  onchain_pending: {
    label: "On-chain Pending",
    icon: <Clock className="h-4 w-4" />,
    color: "bg-purple-100 text-purple-800",
    description: "Waiting for blockchain transaction",
  },
  onchain_submitted: {
    label: "On-chain Submitted",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "bg-purple-100 text-purple-800",
    description: "Transaction submitted to blockchain",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "bg-green-100 text-green-800",
    description: "Refund completed successfully",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="h-4 w-4" />,
    color: "bg-red-100 text-red-800",
    description: "Refund processing failed",
  },
  manual_review: {
    label: "Manual Review",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "bg-orange-100 text-orange-800",
    description: "Requires manual review by our team",
  },
  delayed_pending: {
    label: "Delayed Pending",
    icon: <Clock className="h-4 w-4" />,
    color: "bg-yellow-100 text-yellow-800",
    description: "Refund is in delayed processing period",
  },
  delayed_cancelled: {
    label: "Cancelled",
    icon: <XCircle className="h-4 w-4" />,
    color: "bg-red-100 text-red-800",
    description: "Delayed refund was cancelled",
  },
};

const reasonLabels: Record<RefundReason, string> = {
  flight_cancelled: "Flight Cancelled",
  flight_delayed: "Flight Delayed",
  customer_request: "Customer Request",
  duplicate_booking: "Duplicate Booking",
  service_issue: "Service Issue",
  other: "Other",
};

interface TimelineEvent {
  status: RefundStatus;
  timestamp: string;
  description: string;
}

const getTimeline = (refund: Refund): TimelineEvent[] => {
  const events: TimelineEvent[] = [
    {
      status: "pending",
      timestamp: refund.createdAt,
      description: "Refund request submitted",
    },
  ];

  if (refund.status === "eligibility_check") {
    events.push({
      status: "eligibility_check",
      timestamp: refund.updatedAt,
      description: "Eligibility check in progress",
    });
  }

  if (refund.status === "manual_review") {
    events.push({
      status: "manual_review",
      timestamp: refund.updatedAt,
      description: "Manual review required",
    });
  }

  if (refund.approvedAmountCents !== undefined) {
    events.push({
      status: "approved",
      timestamp: refund.reviewedAt || refund.updatedAt,
      description: `Refund approved: $${(refund.approvedAmountCents / 100).toFixed(2)}`,
    });
  }

  if (refund.status === "processing" || refund.status === "stripe_refunded") {
    events.push({
      status: "processing",
      timestamp: refund.updatedAt,
      description: "Refund processing initiated",
    });
  }

  if (refund.stripeRefundId) {
    events.push({
      status: "stripe_refunded",
      timestamp: refund.updatedAt,
      description: `Stripe refund: ${refund.stripeRefundId}`,
    });
  }

  if (refund.sorobanTxHash) {
    events.push({
      status: "onchain_submitted",
      timestamp: refund.updatedAt,
      description: `On-chain transaction: ${refund.sorobanTxHash.slice(0, 8)}...`,
    });
  }

  if (refund.status === "completed") {
    events.push({
      status: "completed",
      timestamp: refund.updatedAt,
      description: "Refund completed",
    });
  }

  if (refund.status === "rejected") {
    events.push({
      status: "rejected",
      timestamp: refund.updatedAt,
      description: refund.reviewNotes || "Refund request rejected",
    });
  }

  if (refund.status === "failed") {
    events.push({
      status: "failed",
      timestamp: refund.updatedAt,
      description: "Refund processing failed",
    });
  }

  if (refund.status === "delayed_cancelled") {
    events.push({
      status: "delayed_cancelled",
      timestamp: refund.cancelledAt || refund.updatedAt,
      description: refund.cancellationReason || "Refund cancelled",
    });
  }

  return events;
};

export function RefundStatusTracker({ refund }: RefundStatusTrackerProps) {
  const config = statusConfig[refund.status];
  const timeline = getTimeline(refund);
  const finalAmount = refund.approvedAmountCents ?? refund.requestedAmountCents;
  const netRefund = finalAmount - refund.processingFeeCents;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-serif">Refund Status</CardTitle>
              <CardDescription>Tracking ID: {refund.id}</CardDescription>
            </div>
            <Badge className={config.color}>
              <span className="flex items-center gap-1.5">
                {config.icon}
                {config.label}
              </span>
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{config.description}</p>

          <Separator />

          {/* Refund Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Reason:</span>
                <span className="font-medium">{reasonLabels[refund.reason]}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Submitted:</span>
                <span className="font-medium">
                  {new Date(refund.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Requested:</span>
                <span className="font-medium">
                  ${(refund.requestedAmountCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Net Refund:</span>
                <span className="font-medium text-green-600">
                  ${(netRefund / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {refund.reasonDetails && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-1">Details</p>
                <p className="text-sm text-muted-foreground">{refund.reasonDetails}</p>
              </div>
            </>
          )}

          {refund.isDelayed && refund.delayedUntil && (
            <>
              <Separator />
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-muted-foreground">Delayed until:</span>
                <span className="font-medium">
                  {new Date(refund.delayedUntil).toLocaleString()}
                </span>
              </div>
            </>
          )}

          {refund.reviewNotes && refund.status !== "completed" && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-1">Review Notes</p>
                <p className="text-sm text-muted-foreground">{refund.reviewNotes}</p>
                {refund.reviewedBy && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Reviewed by: {refund.reviewedBy}
                  </p>
                )}
              </div>
            </>
          )}

          {refund.sorobanTxHash && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-1">Blockchain Transaction</p>
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {refund.sorobanTxHash}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0">
            {timeline.map((event, index) => (
              <React.Fragment key={index}>
                <div className="relative flex items-center md:before:flex-auto md:before:-translate-x-1/2 md:before:absolute md:before:top-0 md:before:left-1/2">
                  <div className="md:ml-8 md:w-1/2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        {index === timeline.length - 1 ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-current" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{event.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {index < timeline.length - 1 && (
                  <div className="absolute left-5 top-8 h-full w-px bg-border md:left-1/2" />
                )}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
