"use client";
import React from "react";

export function TierBenefits({ benefits, loading }: { benefits: { id: string; label: string; description?: string }[]; loading?: boolean }) {
  return (
    <div className="rounded-lg border p-4 bg-background">
      <h2 className="text-lg font-medium">Tier Benefits</h2>
      {loading ? (
        <div className="text-sm text-muted-foreground mt-2">Loading...</div>
      ) : benefits.length === 0 ? (
        <div className="text-sm text-muted-foreground mt-2">No benefits listed</div>
      ) : (
        <ul className="mt-2 space-y-2">
          {benefits.map((b) => (
            <li key={b.id} className="text-sm">
              <div className="font-medium">{b.label}</div>
              {b.description && <div className="text-muted-foreground">{b.description}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
