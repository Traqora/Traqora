"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Shield, Users } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type {
  FareBreakdownResult,
  FareLineItemInput,
} from "@/lib/pricing/fare-breakdown";

export interface FareBreakdownItem extends FareLineItemInput {
  icon?: ReactNode;
}

interface FareBreakdownProps {
  breakdown: FareBreakdownResult<FareBreakdownItem>;
}

export function FareBreakdown({ breakdown }: FareBreakdownProps) {
  return (
    <div className="space-y-3" data-testid="fare-breakdown">
      <h2 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">
        Price Breakdown
      </h2>

      {!breakdown.ok ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Price unavailable</p>
            <p className="text-xs">{breakdown.error.message}</p>
          </div>
        </div>
      ) : (
        <dl className="space-y-2">
          <FareRow
            icon={<Users className="h-4 w-4" />}
            label={`Base Fare (${breakdown.passengerCount} × ${formatCurrency(
              breakdown.unitBaseFare.value,
              breakdown.currency,
            )})`}
            value={formatCurrency(breakdown.baseFare.value, breakdown.currency)}
          />
          {breakdown.lines.map((line) => (
            <FareRow
              key={line.key}
              icon={line.icon}
              label={line.label}
              value={formatCurrency(line.amount.value, breakdown.currency)}
            />
          ))}
          <FareRow
            icon={<Shield className="h-4 w-4" />}
            label="Taxes & Mandatory Fees"
            value={formatCurrency(breakdown.taxes.value, breakdown.currency)}
          />
        </dl>
      )}
    </div>
  );
}

function FareRow({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <dt className="text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
