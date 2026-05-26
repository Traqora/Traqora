"use client";
import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { LoyaltySummary } from "./LoyaltySummaryCard";

const COLORS = ["#22c55e", "#e5e7eb"]; // green, gray-200

export function TierProgress({ summary, loading }: { summary?: LoyaltySummary; loading?: boolean }) {
  const pct = Math.max(0, Math.min(100, summary?.progressPct ?? 0));
  const data = [
    { name: "Progress", value: pct },
    { name: "Remaining", value: 100 - pct },
  ];

  return (
    <div className="rounded-lg border p-4 bg-background h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Tier Progress</h2>
        <div className="text-sm text-muted-foreground">{loading ? "—" : `${Math.round(pct)}%`}</div>
      </div>
      <div className="h-56 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any, n: any) => [`${v}%`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {summary?.nextTier && (
        <div className="text-sm text-muted-foreground">Progress towards {summary.nextTier}</div>
      )}
    </div>
  );
}
