"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarClock, CheckCircle2 } from "lucide-react"
import { ScheduleChange } from "./schedule-change"

export interface ScheduleChangeListProps {
  /** Already normalized by normalizeScheduleChanges, or supplied as typed data. */
  changes: readonly ScheduleChange[]
}

/**
 * Shows each supplier-verified schedule change next to the itinerary that was
 * originally purchased. Renders nothing when there are no verified changes.
 */
export function ScheduleChangeList({ changes }: ScheduleChangeListProps) {
  if (!changes || changes.length === 0) return null

  return (
    <section aria-labelledby="schedule-changes-title" className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="schedule-changes-title" className="text-lg font-serif">
          Supplier schedule changes
        </h2>
      </div>

      <div role="list" aria-live="polite" className="space-y-3">
        {changes.map((change) => (
          <Card key={change.id} role="listitem" className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                {change.flightNumber}
                <Badge variant="secondary" className="gap-1 text-xs font-normal">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Verified by supplier
                </Badge>
              </CardTitle>
              <CardDescription>
                Published {new Date(change.verifiedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Originally purchased
                  </p>
                  <p className="font-medium">{change.originalDeparture}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Revised departure
                  </p>
                  <p className="font-medium text-primary">{change.revisedDeparture}</p>
                </div>
              </div>
              {change.reason ? (
                <p className="mt-3 text-xs text-muted-foreground">Reason: {change.reason}</p>
              ) : null}
              {change.providerOfferId ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Supplier offer: {change.providerOfferId}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
