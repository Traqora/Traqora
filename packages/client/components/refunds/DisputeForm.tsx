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
import { Loader2, AlertCircle, CheckCircle2, Gavel } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EvidenceUpload, UploadedFile } from "./EvidenceUpload";

const disputeFormSchema = z.object({
  refundId: z.string().uuid("Invalid refund ID"),
  disputeType: z.enum([
    "refund_denied",
    "refund_amount",
    "processing_delay",
    "service_quality",
    "other",
  ], {
    required_error: "Please select a dispute type",
  }),
  description: z.string().min(20, "Please provide more details (at least 20 characters)").max(2000, "Description too long"),
  desiredOutcome: z.string().min(10, "Please specify desired outcome (at least 10 characters)").max(500, "Description too long"),
});

type DisputeFormValues = z.infer<typeof disputeFormSchema>;

interface DisputeFormProps {
  refundId?: string;
  onSuccess?: (disputeId: string) => void;
  onCancel?: () => void;
}

export function DisputeForm({ refundId: propRefundId, onSuccess, onCancel }: DisputeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedDisputeId, setSubmittedDisputeId] = useState<string | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<UploadedFile[]>([]);
  const { toast } = useToast();

  const form = useForm<DisputeFormValues>({
    resolver: zodResolver(disputeFormSchema),
    defaultValues: {
      refundId: propRefundId || "",
      disputeType: undefined,
      description: "",
      desiredOutcome: "",
    },
  });

  const onSubmit = async (data: DisputeFormValues) => {
    setIsSubmitting(true);
    try {
      // Placeholder API call - replace with actual dispute API when available
      // const response = await fetch("/api/v1/disputes/create", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     ...data,
      //     evidence: evidenceFiles.map(f => ({ name: f.name, type: f.type, url: f.url })),
      //   }),
      // });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const disputeId = `DSP-${Math.random().toString(36).substring(7).toUpperCase()}`;
      setSubmittedDisputeId(disputeId);
      
      toast({
        description: "Dispute filed successfully",
      });
      onSuccess?.(disputeId);
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: error.message || "Failed to file dispute",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedDisputeId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Dispute Filed Successfully</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your dispute has been submitted and will be reviewed by our dispute resolution team.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Reference ID: {submittedDisputeId}
              </p>
            </div>
            <Alert>
              <Gavel className="h-4 w-4" />
              <AlertDescription>
                A jury will be selected to review your case. You'll receive notifications when the jury is seated and voting begins.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => {
                setSubmittedDisputeId(null);
                form.reset();
                setEvidenceFiles([]);
              }}
              variant="outline"
            >
              File Another Dispute
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">File a Dispute</CardTitle>
        <CardDescription>
          If you disagree with a refund decision, you can file a dispute for independent review by a jury.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {!propRefundId && (
              <FormField
                control={form.control}
                name="refundId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund ID</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Enter the refund ID you're disputing"
                      />
                    </FormControl>
                    <FormDescription>
                      The refund ID you wish to dispute
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="disputeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dispute Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select dispute type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="refund_denied">Refund Denied</SelectItem>
                      <SelectItem value="refund_amount">Refund Amount Disagreement</SelectItem>
                      <SelectItem value="processing_delay">Processing Delay</SelectItem>
                      <SelectItem value="service_quality">Service Quality Issue</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dispute Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Provide a detailed explanation of why you're disputing this refund decision..."
                      className="min-h-[150px] resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Include all relevant details about your dispute
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="desiredOutcome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desired Outcome</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What resolution are you seeking?"
                      className="min-h-[80px] resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Specify what you believe would be a fair resolution
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <EvidenceUpload
              onFilesChange={setEvidenceFiles}
              maxFiles={5}
              maxSizeMB={10}
            />

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your dispute will be reviewed by an independent jury. This process typically takes 3-5 business days.
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
                  "Submit Dispute"
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
