"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ThumbsUp, ThumbsDown, Gavel, Shield, CheckCircle2, Users, Clock, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Dispute {
  id: string;
  refundId: string;
  disputeType: string;
  description: string;
  desiredOutcome: string;
  status: "pending_jury" | "in_voting" | "resolved" | "appealed";
  createdAt: string;
  evidence?: Array<{ name: string; type: string; url: string }>;
}

interface JuryVotingProps {
  dispute: Dispute;
  onVote?: (vote: "approve" | "reject", comments: string) => void;
}

export function JuryVoting({ dispute, onVote }: JuryVotingProps) {
  const [selectedVote, setselectedVote] = useState<"approve" | "reject" | null>(null);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!selectedVote) {
      toast({
        variant: "destructive",
        description: "Please select your vote",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Placeholder API call - replace with actual jury voting API when available
      // await fetch(`/api/v1/disputes/${dispute.id}/vote`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ vote: selectedVote, comments }),
      // });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      onVote?.(selectedVote, comments);
      setHasVoted(true);
      
      toast({
        description: "Your vote has been recorded",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: error.message || "Failed to submit vote",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasVoted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Vote Submitted</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your vote has been recorded on the blockchain.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dispute Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-serif">Dispute Review</CardTitle>
              <CardDescription>Dispute ID: {dispute.id}</CardDescription>
            </div>
            <Badge variant="outline" className="bg-purple-100 text-purple-800">
              <Gavel className="h-3 w-3 mr-1" />
              Jury Duty
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              As a jury member, your vote will help determine the outcome of this dispute. Please review all evidence carefully before voting.
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Dispute Type:</span>
              <span className="font-medium capitalize">{dispute.disputeType.replace(/_/g, " ")}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Filed:</span>
              <span className="font-medium">
                {new Date(dispute.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Description</p>
            <p className="text-sm text-muted-foreground">{dispute.description}</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Desired Outcome</p>
            <p className="text-sm text-muted-foreground">{dispute.desiredOutcome}</p>
          </div>

          {dispute.evidence && dispute.evidence.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Evidence ({dispute.evidence.length})</p>
                <div className="space-y-2">
                  {dispute.evidence.map((evidence, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{evidence.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Voting Card */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Cast Your Vote</CardTitle>
          <CardDescription>
            Review the dispute and evidence above, then cast your vote.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Vote Options */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              type="button"
              variant={selectedVote === "approve" ? "default" : "outline"}
              className={`h-24 flex flex-col gap-2 ${
                selectedVote === "approve"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "hover:border-green-300 hover:text-green-600"
              }`}
              onClick={() => setselectedVote("approve")}
            >
              <ThumbsUp className="h-6 w-6" />
              <span>Approve Dispute</span>
            </Button>
            <Button
              type="button"
              variant={selectedVote === "reject" ? "default" : "outline"}
              className={`h-24 flex flex-col gap-2 ${
                selectedVote === "reject"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "hover:border-red-300 hover:text-red-600"
              }`}
              onClick={() => setselectedVote("reject")}
            >
              <ThumbsDown className="h-6 w-6" />
              <span>Reject Dispute</span>
            </Button>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Comments (Optional)</label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any additional context or reasoning for your vote..."
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Your comments will be visible to other jury members and the dispute participants.
            </p>
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            disabled={!selectedVote || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Shield className="mr-2 h-4 w-4 animate-spin" />
                Submitting Vote...
              </>
            ) : (
              <>
                <Gavel className="mr-2 h-4 w-4" />
                Submit Vote
              </>
            )}
          </Button>

          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              This action will require signing with your wallet. Your vote will be recorded on the Stellar blockchain.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
