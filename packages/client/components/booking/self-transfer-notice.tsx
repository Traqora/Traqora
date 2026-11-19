"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Clock,
  Info,
  ShieldAlert,
  Truck,
} from "lucide-react";

export interface SelfTransferSegment {
  flightNumber: string;
  airline: string;
  fromAirport: string;
  toAirport: string;
  departure: string;
  arrival: string;
  bookingReference: string | null;
  layoverMinutes?: number;
  riskLevel?: "low" | "medium" | "high" | "severe";
  riskExplanation?: string;
  separateTickets?: boolean;
  departureTimeZone?: string;
  arrivalTimeZone?: string;
  departureLocalTime?: string;
  arrivalLocalTime?: string;
}

export interface SelfTransferNoticeProps {
  isSelfTransfer: boolean;
  separateTicketCount: number;
  riskLevel?: "low" | "medium" | "high" | "severe";
  explanation?: string;
  segments?: SelfTransferSegment[];
  title?: string;
}

const RISK_LABELS: Record<string, { label: string; variant: string }> = {
  low: { label: "Low", variant: "secondary" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "destructive" },
  severe: { label: "Severe", variant: "destructive" },
};

const SEPARATE_TICKET_RISKS = [
  {
    id: "no-missed-connection-protection",
    title: "No missed-connection protection",
    description:
      "On separate tickets, each airline treats your flights as unrelated. If your first flight is delayed or cancelled, the airline is generally not obliged to rebook you on the next separately ticketed flight — you may have to buy a new ticket.",
    icon: <ShieldAlert className="mr-2 h-4 w-4" />,
  },
  {
    id: "baggage-not-checked-through",
    title: "Baggage is not checked through",
    description:
      "Baggage is usually not interlined on separate tickets. Collect your bags at the transfer airport, re-check them for the next flight, and clear security again — allow extra time.",
    icon: <Truck className="mr-2 h-4 w-4" />,
  },
  {
    id: "separate-contracts",
    title: "Separate contracts",
    description:
      "Each ticket is its own contract. A schedule change, cancellation, or refund on one ticket does not automatically apply to the other ticket.",
    icon: <Info className="mr-2 h-4 w-4" />,
  },
  {
    id: "re-clear-security-immigration",
    title: "Re-clear security and immigration",
    description:
      "Depending on the airport and country, you may need to clear immigration, customs, and security again between tickets, which can consume a large part of your layover.",
    icon: <AlertTriangle className="mr-2 h-4 w-4" />,
  },
];

const MITIGATIONS = [
  "Allow at least 2 hours between self-transfer flights (3+ hours for international transfers involving immigration or a change of airport).",
  "Carry travel documents, medication, and essentials in cabin baggage in case checked bags miss the connection.",
  "Consider travel insurance that covers missed connections caused by separate tickets.",
  "Check visa and entry requirements for the transfer country — you may need to enter the country between tickets.",
  "Monitor both flights separately; the airline will not protect the onward ticket.",
];

export function SelfTransferNotice({
  isSelfTransfer,
  separateTicketCount,
  riskLevel = "medium",
  explanation,
  segments,
  title = "Self-transfer itinerary — separate tickets detected",
}: SelfTransferNoticeProps) {
  if (!isSelfTransfer) return null;

  const { label, variant } = RISK_LABELS[riskLevel] ?? RISK_LABELS.medium;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="mr-2 h-4 w-4 text-warning" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {explanation ??
            `This itinerary contains ${separateTicketCount} self-transfer connection(s) on separate tickets. Separate tickets are independent contracts — missed connections, baggage, and refunds are not automatically protected.`}
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg border border-border text-xs">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="font-medium">Overall risk: </span>
        <Badge variant={variant}>{label}</Badge>
      </div>

      <Separator orientation="vertical" className="my-2" />

      <div className="space-y-3">
        {SEPARATE_TICKET_RISKS.map((risk) => (
          <div key={risk.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-white/30">
            {risk.icon}
            <div>
              <p className="text-sm font-medium">{risk.title}</p>
              <p className="text-sm text-muted-foreground">{risk.description}</p>
            </div>
          </div>
        ))}
      </div>

      {segments && segments.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Connection details
          </p>
          {segments.map((seg, i) => {
            const conn = seg.separateTickets ? (
              <span className="text-xs text-destructive">
                Separate tickets · {seg.layoverMinutes ?? 0} min layover
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Same ticket · protected
              </span>
            );
            return (
              <div key={i} className="flex flex-col gap-0.5 p-2 rounded bg-muted/50 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{seg.flightNumber}</span>
                  <span className="text-muted-foreground">
                    {seg.fromAirport} → {seg.toAirport}
                  </span>
                  {conn}
                </div>
                {(seg.departureLocalTime || seg.arrivalLocalTime) && (
                  <div className="text-muted-foreground">
                    Dep {seg.departureLocalTime ?? seg.departure}
                    {seg.departureTimeZone ? ` (${seg.departureTimeZone})` : ""}
                    {" · "}
                    Arr {seg.arrivalLocalTime ?? seg.arrival}
                    {seg.arrivalTimeZone ? ` (${seg.arrivalTimeZone})` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="p-3 rounded-lg border border-border/50 bg-blue-50 text-xs">
        <p className="font-medium text-blue-900 mb-1">How to protect yourself</p>
        <ul className="list-disc list-inside text-blue-800 space-y-1">
          {MITIGATIONS.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

