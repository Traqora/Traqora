"use client";
import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type Tier = {
  name: string;
  requiredPoints: number;
  bonusMultiplier: number; // e.g., 1.2x
};

export function TierComparisonChart({ tiers }: { tiers: Tier[] }) {
  const data = tiers.map((t) => ({
    name: t.name,
    Required: t.requiredPoints,
    Bonus: Math.round((t.bonusMultiplier - 1) * 100),
  }));

  return (
    <div className="rounded-lg border p-4 bg-background">
      <h2 className="text-lg font-medium mb-2">Tier Comparison</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Required" fill="#60a5fa" />
            <Bar dataKey="Bonus" fill="#34d399" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
