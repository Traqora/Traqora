"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const refundRequestSchema = z.object({
  bookingId: z.string().uuid("Invalid booking ID"),
  reason: z.enum([
    "flight_cancelled",
    "flight_delayed",
    "customer_request",
    "duplicate_booking",
    "service_issue",
    "other",
  ], {
    required_error: "Please select a reason for the refund",
  }),
  reasonDetails: z.string().min(10, "Please provide more details (at least 10 characters)").max(1000, "Details too long"),
});

type RefundRequestFormValues = z.infer<typeof refundRequestSchema>;

interface RefundRequestFormProps {
  bookingId?: string;
  onSuccess?: (refundId: string) => void;
  onCancel?: () => void;
}

export function RefundRequestForm({ bookingId: propBookingId, onSuccess, onCancel }: RefundRequestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRefundId, setSubmittedRefundId] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<RefundRequestFormValues>({
    resolver: zodResolver(refundRequestSchema),
    defaultValues: {
      bookingId: propBookingId || "",
      reason: undefined,
      reasonDetails: "",
    },
  });

  const onSubmit = async (data: RefundRequestFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/refunds/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to submit refund request");
      }

      setSubmittedRefundId(result.data.id);
      toast({
        description: "Refund request submitted successfully",
      });
      onSuccess?.(result.data.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: error.message || "Failed to submit refund request",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedRefundId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Refund Request Submitted</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your refund request has been submitted and is being processed.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Reference ID: {submittedRefundId}
              </p>
            </div>
            <Button
              onClick={() => {
                setSubmittedRefundId(null);
                form.reset();
              }}
              variant="outline"
            >
              Submit Another Request
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">Request a Refund</CardTitle>
        <CardDescription>
          Submit a refund request for your booking. We'll review your request and process it according to our refund policy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {!propBookingId && (
              <FormField
                control={form.control}
                name="bookingId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Booking ID</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Enter your booking ID"
                      />
                    </FormControl>
                    <FormDescription>
                      You can find this in your booking confirmation email
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Refund</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="flight_cancelled">Flight Cancelled</SelectItem>
                      <SelectItem value="flight_delayed">Flight Delayed</SelectItem>
                      <SelectItem value="customer_request">Customer Request</SelectItem>
                      <SelectItem value="duplicate_booking">Duplicate Booking</SelectItem>
                      <SelectItem value="service_issue">Service Issue</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reasonDetails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Details</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Please provide more details about your refund request..."
                      className="min-h-[120px] resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Include any relevant information that may help process your request
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Refund processing times vary based on the reason and payment method. You'll receive updates via email.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
