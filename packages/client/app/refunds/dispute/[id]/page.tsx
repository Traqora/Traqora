"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient, DisputeRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle, Loader2, Gavel, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function DisputeTimelinePage() {
  const params = useParams<{ id: string }>();
  const disputeId = params?.id as string;

  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  const loadDispute = async () => {
    if (!disputeId) return;
    setLoading(true);
    const response = await apiClient.getDispute(disputeId);
    if (!response.success) {
      setError(response.error.message);
      setLoading(false);
      return;
    }
    setDispute(response.data);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    loadDispute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  const submitEvidence = async () => {
    if (!disputeId || !evidenceDescription.trim()) return;

    setSubmittingEvidence(true);
    const response = await apiClient.submitDisputeEvidence(disputeId, {
      description: evidenceDescription.trim(),
      fileUrl: evidenceUrl.trim() || undefined,
    });
    setSubmittingEvidence(false);

    if (!response.success) {
      setError(response.error.message);
      return;
    }

    setDispute(response.data);
    setEvidenceDescription("");
    setEvidenceUrl("");
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-center min-h-[320px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <Link href="/refunds/status">
        <Button variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Refunds
        </Button>
      </Link>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dispute && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-serif">Dispute Timeline</CardTitle>
                  <CardDescription>{dispute.id}</CardDescription>
                </div>
                <Badge variant="outline">{dispute.status.replace("_", " ")}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 text-sm">
                <p><span className="font-medium">Refund:</span> {dispute.refundId}</p>
                <p><span className="font-medium">Arbitrator:</span> {dispute.arbitratorAddress || "Pending assignment"}</p>
                <p><span className="font-medium">Type:</span> {dispute.disputeType.replace(/_/g, " ")}</p>
              </div>

              <div className="space-y-3">
                {dispute.timeline.map((event, idx) => (
                  <div key={`${event.type}-${idx}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Gavel className="h-4 w-4 text-muted-foreground" />
                        {event.type.replace(/_/g, " ")}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(event.at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Actor: {event.actor}</p>
                    {event.notes && <p className="mt-2 text-sm">{event.notes}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Submit Additional Evidence</CardTitle>
              <CardDescription>Attach IPFS CID/URL evidence during review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={evidenceDescription}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                placeholder="Describe the evidence"
                className="min-h-[90px]"
              />
              <Input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="ipfs://<CID> or https://.../ipfs/..."
              />
              <Button
                type="button"
                onClick={submitEvidence}
                disabled={submittingEvidence || evidenceDescription.trim().length < 5}
                className="w-full"
              >
                {submittingEvidence ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting Evidence...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Submit Evidence
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
