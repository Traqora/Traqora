"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Info, RotateCcw, Ban, ArrowUpDown, Clock, AlertTriangle, CheckCircle, XCircle } from "lucide-react"

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

interface FareRulesSummaryProps {
  fareRules: FareRule[]
  airlineName?: string
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

export function FareRulesSummary({ fareRules, airlineName }: FareRulesSummaryProps) {
  if (!fareRules || fareRules.length === 0) return null

  const getPolicySummary = (rule: FareRule) => {
    const parts: string[] = []
    if (rule.changeable) parts.push("Changes allowed")
    else parts.push("Non-changeable")
    if (rule.refundable) parts.push("Refundable")
    else parts.push("Non-refundable")
    return parts.join(" · ")
  }

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
                      <span className="font-medium">{rule.changeable ? `$${(rule.changeFeeCents / 100).toFixed(2)} fee` : "Not allowed"}</span>
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
                        <span className="font-medium">${(rule.changeFeeCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Cancel fee:</span>
                        <span className="font-medium">${(rule.cancellationFeeCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Upgrade fee:</span>
                        <span className="font-medium">${(rule.upgradeFeeCents / 100).toFixed(2)}</span>
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
