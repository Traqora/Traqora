"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EvidenceUpload, UploadedFile } from "./EvidenceUpload";

const appealFormSchema = z.object({
  disputeId: z.string().min(1, "Dispute ID is required"),
  appealReason: z.string().min(20, "Please provide more details (at least 20 characters)").max(2000, "Reason too long"),
  newEvidence: z.string().min(10, "Please describe new evidence (at least 10 characters)").max(1000, "Description too long").optional(),
});

type AppealFormValues = z.infer<typeof appealFormSchema>;

interface AppealFormProps {
  disputeId?: string;
  onSuccess?: (appealId: string) => void;
  onCancel?: () => void;
}

export function AppealForm({ disputeId: propDisputeId, onSuccess, onCancel }: AppealFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAppealId, setSubmittedAppealId] = useState<string | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<UploadedFile[]>([]);
  const { toast } = useToast();

  const form = useForm<AppealFormValues>({
    resolver: zodResolver(appealFormSchema),
    defaultValues: {
      disputeId: propDisputeId || "",
      appealReason: "",
      newEvidence: "",
    },
  });

  const onSubmit = async (data: AppealFormValues) => {
    setIsSubmitting(true);
    try {
      // Placeholder API call - replace with actual appeal API when available
      // const response = await fetch("/api/v1/disputes/appeal", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     ...data,
      //     evidence: evidenceFiles.map(f => ({ name: f.name, type: f.type, url: f.url })),
      //   }),
      // });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const appealId = `APL-${Math.random().toString(36).substring(7).toUpperCase()}`;
      setSubmittedAppealId(appealId);
      
      toast({
        description: "Appeal submitted successfully",
      });
      onSuccess?.(appealId);
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: error.message || "Failed to submit appeal",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedAppealId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Appeal Submitted</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your appeal has been submitted and will be reviewed by a senior dispute resolution team.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Reference ID: {submittedAppealId}
              </p>
            </div>
            <Button
              onClick={() => {
                setSubmittedAppealId(null);
                form.reset();
                setEvidenceFiles([]);
              }}
              variant="outline"
            >
              Submit Another Appeal
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif">File an Appeal</CardTitle>
        <CardDescription>
          If you disagree with the jury's decision, you can file an appeal for review by a senior resolution team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Scale className="h-4 w-4" />
          <AlertDescription>
            Appeals must be filed within 7 days of the original decision. You must provide new evidence or demonstrate procedural error.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {!propDisputeId && (
              <FormField
                control={form.control}
                name="disputeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dispute ID</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Enter the dispute ID you're appealing"
                      />
                    </FormControl>
                    <FormDescription>
                  The dispute ID you wish to appeal
                </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="appealReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Appeal Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Explain why you believe the jury's decision was incorrect..."
                      className="min-h-[150px] resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Provide specific reasons for your appeal
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newEvidence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Evidence Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Describe any new evidence that wasn't available during the original dispute..."
                      className="min-h-[100px] resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Appeals must include new evidence or demonstrate procedural error
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

            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Frivolous appeals may result in penalties. Please ensure you have valid grounds for appeal before submitting.
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
                  "Submit Appeal"
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
