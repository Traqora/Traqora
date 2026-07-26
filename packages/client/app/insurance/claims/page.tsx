"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plane, Shield, ArrowLeft, FileText, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  getInsurancePolicy,
  getInsuranceClaims,
  submitInsuranceClaim,
  InsurancePolicy,
  InsuranceClaim,
} from "@/lib/api"

const eventTypeLabels: Record<InsuranceClaim["eventType"], string> = {
  medical: "Medical Emergency",
  baggage: "Lost / Delayed Baggage",
  trip_cancellation: "Trip Cancellation",
  other: "Other",
}

const statusColors: Record<InsuranceClaim["status"], string> = {
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  paid: "bg-emerald-100 text-emerald-800",
}

export default function InsuranceClaimsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [policyId, setPolicyId] = useState(searchParams.get("policyId") || "")
  const [policy, setPolicy] = useState<InsurancePolicy | null>(null)
  const [claims, setClaims] = useState<InsuranceClaim[]>([])
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [eventType, setEventType] = useState<InsuranceClaim["eventType"]>("medical")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [contactEmail, setContactEmail] = useState("")

  const lookupPolicy = async (id: string) => {
    if (!id) return
    setIsLookingUp(true)
    setLookupError(null)
    try {
      const [foundPolicy, foundClaims] = await Promise.all([
        getInsurancePolicy(id),
        getInsuranceClaims(id),
      ])
      setPolicy(foundPolicy)
      setClaims(foundClaims)
    } catch (err: any) {
      setPolicy(null)
      setClaims([])
      setLookupError(err.message || "Policy not found")
    } finally {
      setIsLookingUp(false)
    }
  }

  useEffect(() => {
    if (policyId) lookupPolicy(policyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmitClaim = async () => {
    if (!policy) return
    const amountCents = Math.round(parseFloat(amount) * 100)
    if (!description.trim() || Number.isNaN(amountCents) || amountCents <= 0) {
      toast({
        title: "Missing information",
        description: "Please provide a description and a valid claim amount.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const claim = await submitInsuranceClaim(policy.id, {
        eventType,
        description,
        amountRequestedCents: amountCents,
        contactEmail: contactEmail || undefined,
      })
      setClaims((prev) => [claim, ...prev])
      setDescription("")
      setAmount("")
      toast({ title: "Claim submitted", description: "We'll review your claim and follow up by email." })
    } catch (err: any) {
      toast({ title: "Failed to submit claim", description: err.message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="font-serif font-bold text-3xl text-foreground flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Insurance Claims Portal
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Look up your policy</CardTitle>
            <CardDescription>Enter your policy ID to view details and file a claim.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Input
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              placeholder="Policy ID"
            />
            <Button onClick={() => lookupPolicy(policyId)} disabled={isLookingUp || !policyId}>
              {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
            </Button>
          </CardContent>
        </Card>

        {lookupError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{lookupError}</AlertDescription>
          </Alert>
        )}

        {policy && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Policy {policy.providerPolicyRef}</CardTitle>
                  <Badge variant={policy.status === "active" ? "secondary" : "outline"}>{policy.status}</Badge>
                </div>
                <CardDescription>
                  {policy.coverageType} coverage &middot; {policy.destination} &middot; Booking{" "}
                  {policy.bookingId}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>File a New Claim</CardTitle>
                <CardDescription>Describe what happened and the amount you're claiming.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Event Type</Label>
                  <Select value={eventType} onValueChange={(v) => setEventType(v as InsuranceClaim["eventType"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(eventTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the event and any supporting details"
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Claim Amount (USD)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Email (optional)</Label>
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <Button onClick={handleSubmitClaim} disabled={isSubmitting || policy.status !== "active"}>
                  {isSubmitting ? "Submitting..." : "Submit Claim"}
                </Button>
                {policy.status !== "active" && (
                  <p className="text-xs text-muted-foreground">
                    Claims can only be filed against an active policy.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Claim History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {claims.length === 0 && (
                  <p className="text-sm text-muted-foreground">No claims filed yet.</p>
                )}
                {claims.map((claim) => (
                  <div key={claim.id} className="flex items-start justify-between p-3 rounded-lg border border-border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{eventTypeLabels[claim.eventType]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-md">{claim.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested: ${(claim.amountRequestedCents / 100).toFixed(2)} &middot;{" "}
                        {new Date(claim.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={statusColors[claim.status]}>{claim.status.replace("_", " ")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
