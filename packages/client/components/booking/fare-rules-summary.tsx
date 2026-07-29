"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Info, RotateCcw, Ban, ArrowUpDown, Clock, AlertTriangle,
  CheckCircle, XCircle, Calendar, DollarSign, TrendingUp,
  ShieldAlert, Sun,
} from "lucide-react"

export interface FareRule {
  fareClass: string
  fareBasisCode: string
  airline: string
  changeable: boolean
  refundable: boolean
  changeFeeCents: number
  cancellationFeeCents: number
  upgradeFeeCents: number
  noShowPenalty: number
  noShowGracePeriodMinutes: number
  restrictions: {
    advancePurchaseRequired: boolean
    advancePurchaseDays?: number
    minStayDays?: number
    maxStayDays?: number
  }
  rebookingAllowed: boolean
  nameChangeAllowed: boolean
  nameChangeFeeCents: number
  standbyAllowed: boolean
  standbyFeeCents: number
}

interface ChangeFeeTier {
  fromDays: number
  toDays: number
  feeCents: number
  feePercentage: number
  label: string
}

interface CancellationTier {
  fromDays: number
  toDays: number
  refundPercentage: number
  penaltyCents: number
  label: string
}

interface SeasonalOverride {
  season: string
  name: string
  changeFeeMultiplier: number
  cancellationFeeMultiplier: number
}

interface QuoteResult {
  changeFeeCents: number
  fareDifferenceCents: number
  totalDueCents: number
  currency: string
  breakdown: { label: string; amount: number; explanation?: string }[]
  daysToDeparture: number
}

interface FareRulesSummaryProps {
  fareRules: FareRule[]
  airlineName?: string
  airlineCode?: string
  bookingId?: string
  compact?: boolean
}

const classColorMap: Record<string, string> = {
  economy: "bg-blue-100 text-blue-800 border-blue-200",
  premium_economy: "bg-teal-100 text-teal-800 border-teal-200",
  business: "bg-purple-100 text-purple-800 border-purple-200",
  first: "bg-amber-100 text-amber-800 border-amber-200",
}

const classLabelMap: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First Class",
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function FareRulesSummary({ fareRules, airlineName, airlineCode, bookingId, compact }: FareRulesSummaryProps) {
  const [activeTab, setActiveTab] = useState<string>("rules")
  const [newDate, setNewDate] = useState("")
  const [changeQuote, setChangeQuote] = useState<QuoteResult | null>(null)
  const [cancelQuote, setCancelQuote] = useState<QuoteResult | null>(null)
  const [tiers, setTiers] = useState<ChangeFeeTier[] | CancellationTier[] | null>(null)
  const [tierType, setTierType] = useState<"change" | "cancel">("change")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!fareRules || fareRules.length === 0) return null

  const getPolicySummary = (rule: FareRule) => {
    const parts: string[] = []
    if (rule.changeable) parts.push("Changes allowed")
    else parts.push("Non-changeable")
    if (rule.refundable) parts.push("Refundable")
    else parts.push("Non-refundable")
    return parts.join(" · ")
  }

  const fetchChangeQuote = async () => {
    if (!bookingId || !newDate) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/change-fee?newDate=${encodeURIComponent(newDate)}`)
      const body = await res.json()
      if (body.success) setChangeQuote(body.data)
      else setError(body.error?.message || "Failed to get quote")
    } catch {
      setError("Network error fetching change quote")
    }
    setLoading(false)
  }

  const fetchCancelQuote = async () => {
    if (!bookingId) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/cancellation-refund`)
      const body = await res.json()
      if (body.success) setCancelQuote(body.data)
      else setError(body.error?.message || "Failed to get quote")
    } catch {
      setError("Network error fetching cancel quote")
    }
    setLoading(false)
  }

  const fetchTiers = async (type: "change" | "cancel") => {
    if (!bookingId) return
    setLoading(true)
    setError("")
    setTierType(type)
    try {
      const endpoint = type === "change" ? "change-fee-tiers" : "cancellation-tiers"
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/${endpoint}`)
      const body = await res.json()
      if (body.success) setTiers(body.data)
      else setError(body.error?.message || "Failed to load tiers")
    } catch {
      setError("Network error fetching tiers")
    }
    setLoading(false)
  }

  const activeSeasonalOverride = fareRules.find(r =>
    r.airline && airlineCode === r.airline && (fareRules[0] as any)?.airline
  )

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          Fare Rules & Cancellation Policy
          {airlineName && (
            <Badge variant="outline" className="ml-2 text-xs font-normal">{airlineName}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {bookingId ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="rules" className="text-xs">Rules</TabsTrigger>
              <TabsTrigger value="quote" className="text-xs">Quotes</TabsTrigger>
              <TabsTrigger value="tiers" className="text-xs">Tiers</TabsTrigger>
            </TabsList>

            <TabsContent value="rules" className="space-y-3 pt-2">
              <FareRulesAccordion fareRules={fareRules} />
            </TabsContent>

            <TabsContent value="quote" className="space-y-3 pt-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Change Fee Quote
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      className="text-sm h-9"
                      placeholder="New flight date"
                    />
                    <Button size="sm" variant="secondary" onClick={fetchChangeQuote} disabled={loading || !newDate} className="shrink-0 h-9">
                      {loading ? "..." : "Quote"}
                    </Button>
                  </div>
                  {changeQuote && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Days to departure:</span>
                        <span className="font-mono font-bold">{changeQuote.daysToDeparture}d</span>
                      </div>
                      <Separator />
                      {changeQuote.breakdown.map((b, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">{b.label}</span>
                          <span className={`font-mono font-medium ${b.amount < 0 ? "text-green-600" : ""}`}>
                            {b.amount < 0 ? "-" : ""}{formatCents(Math.abs(b.amount))}
                          </span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between items-center font-bold">
                        <span>Total due:</span>
                        <span className="font-mono text-primary">{formatCents(changeQuote.totalDueCents)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Cancellation Refund
                  </p>
                  <Button size="sm" variant="secondary" onClick={fetchCancelQuote} disabled={loading} className="h-9">
                    {loading ? "Loading..." : "Check Refund"}
                  </Button>
                  {cancelQuote && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Refund eligible:</span>
                        <Badge variant={cancelQuote.eligible ? "secondary" : "outline"} className="text-xs">
                          {cancelQuote.eligible ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Refund:</span>
                        <span className="font-mono font-bold">{formatCents(cancelQuote.refundableCents)}</span>
                      </div>
                      {cancelQuote.penaltyCents > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Penalty:</span>
                          <span className="font-mono text-red-500">-{formatCents(cancelQuote.penaltyCents)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between items-center font-bold">
                        <span>Net refund:</span>
                        <span className={`font-mono ${cancelQuote.netRefundCents > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {formatCents(cancelQuote.netRefundCents)}
                        </span>
                      </div>
                      {cancelQuote.breakdown.map((b, i) => (
                        b.label !== 'Refund (0% of ticket price)' && (
                          <div key={i} className="flex justify-between text-xs text-muted-foreground">
                            <span>{b.label}</span>
                            <span>{formatCents(Math.abs(b.amount))}</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tiers" className="space-y-3 pt-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={tierType === "change" ? "default" : "outline"}
                  onClick={() => fetchTiers("change")}
                  className="h-8 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Change Tiers
                </Button>
                <Button
                  size="sm"
                  variant={tierType === "cancel" ? "default" : "outline"}
                  onClick={() => fetchTiers("cancel")}
                  className="h-8 text-xs"
                >
                  <Ban className="h-3 w-3 mr-1" /> Cancel Tiers
                </Button>
              </div>
              {tiers && (
                <div className="space-y-1.5">
                  {tiers.map((tier, i) => {
                    const isChangeTier = "feeCents" in tier
                    const cTier = tier as ChangeFeeTier
                    const canTier = tier as CancellationTier
                    return (
                      <div
                        key={i}
                        className="flex justify-between items-center py-1.5 px-2 rounded-md bg-muted/20 text-sm"
                      >
                        <span className="text-xs text-muted-foreground flex-1">{tier.label}</span>
                        <span className="font-mono text-xs font-medium">
                          {isChangeTier
                            ? cTier.feeCents === 0 ? "Free" : formatCents(cTier.feeCents)
                            : `${canTier.refundPercentage}% refund`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <FareRulesAccordion fareRules={fareRules} />
        )}

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <Alert className="bg-muted/30 border-border/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Fare rules vary by fare class and airline. Change/cancellation fees are per passenger.
            Fees are time-dependent and may be reduced or waived depending on how far in advance you make changes.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

function FareRulesAccordion({ fareRules }: { fareRules: FareRule[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {fareRules.map((rule, i) => (
        <AccordionItem key={`${rule.fareClass}-${i}`} value={`${rule.fareClass}-${i}`}>
          <AccordionTrigger className="hover:no-underline py-3">
            <div className="flex items-center gap-3 w-full">
              <Badge className={classColorMap[rule.fareClass] || "bg-gray-100 text-gray-800"}>
                {classLabelMap[rule.fareClass] || rule.fareClass}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">{rule.fareBasisCode}</span>
              <span className="text-xs text-muted-foreground ml-auto">{getPolicySummary(rule)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  {rule.changeable ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="text-muted-foreground">Changes:</span>
                  <span className="font-medium">{rule.changeable ? `${formatCentsStatic(rule.changeFeeCents)} fee` : "Not allowed"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {rule.refundable ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="text-muted-foreground">Refunds:</span>
                  <span className="font-medium">{rule.refundable ? "Allowed" : "Not allowed"}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fees & Penalties</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Change fee:</span>
                    <span className="font-medium">{formatCentsStatic(rule.changeFeeCents)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Cancel fee:</span>
                    <span className="font-medium">{formatCentsStatic(rule.cancellationFeeCents)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Upgrade fee:</span>
                    <span className="font-medium">{formatCentsStatic(rule.upgradeFeeCents)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">No-show:</span>
                    <span className="font-medium">{rule.noShowPenalty}% penalty</span>
                  </div>
                </div>
              </div>

              {rule.restrictions && (
                <>
                  <Separator />
                  <div className="space-y-1 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restrictions</p>
                    {rule.restrictions.advancePurchaseRequired && (
                      <p className="text-muted-foreground flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        Advance purchase required {rule.restrictions.advancePurchaseDays ? `(${rule.restrictions.advancePurchaseDays}+ days)` : ""}
                      </p>
                    )}
                    {rule.restrictions.maxStayDays && (
                      <p className="text-muted-foreground">
                        Max stay: {rule.restrictions.maxStayDays} days
                      </p>
                    )}
                    {rule.restrictions.minStayDays && rule.restrictions.minStayDays > 0 && (
                      <p className="text-muted-foreground">
                        Min stay: {rule.restrictions.minStayDays} days
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function getPolicySummary(rule: FareRule): string {
  const parts: string[] = []
  if (rule.changeable) parts.push("Changes allowed")
  else parts.push("Non-changeable")
  if (rule.refundable) parts.push("Refundable")
  else parts.push("Non-refundable")
  return parts.join(" · ")
}

function formatCentsStatic(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
