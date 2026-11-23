"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  Gift,
  Target,
  Award,
  BarChart3,
  PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface TierEarnBurnEntry {
  type: "earn" | "burn";
  amount: number;
  description: string;
  timestamp: Date;
  tier: string;
}

export interface TierDisplayData {
  tier: string;
  tierProgress: number;
  pointsEarned: number;
  pointsBurned: number;
  nextTier: string;
  nextTierProgress: number;
  earnBurnRatio: number;
  entries: TierEarnBurnEntry[];
}

interface TierEarnBurnProps {
  data: TierDisplayData;
  loading?: boolean;
}

export function TierEarnBurn({ data, loading }: TierEarnBurnProps) {
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-48 bg-muted rounded"></div>
        <div className="h-32 bg-muted rounded"></div>
      </div>
    );
  }

  const netPoints = data.pointsEarned - data.pointsBurned;
  const earnPercentage = data.pointsEarned + data.pointsBurned > 0
    ? (data.pointsEarned / (data.pointsEarned + data.pointsBurned)) * 100
    : 50;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-serif font-bold">Tier Display — Earn & Burn</h2>
      </div>

      {/* Current Tier Card */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            Current Tier: {data.tier}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Tier Progress</span>
              <span>{Math.round(data.tierProgress)}%</span>
            </div>
            <Progress value={data.tierProgress} className="h-2" />
          </div>
          {data.nextTier && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next Tier: {data.nextTier}</span>
              <span>{Math.round(data.nextTierProgress)}%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Earn vs Burn Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Earn vs Burn Ratio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Plus className="h-6 w-6 text-green-600" />
                <span className="text-sm text-muted-foreground">Earned</span>
              </div>
              <div className="text-3xl font-bold text-green-600">
                {data.pointsEarned.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {Math.round(earnPercentage)}% of total
              </div>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Minus className="h-6 w-6 text-red-600" />
                <span className="text-sm text-muted-foreground">Burned</span>
              </div>
              <div className="text-3xl font-bold text-red-600">
                {data.pointsBurned.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {Math.round(100 - earnPercentage)}% of total
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-sm">
            <span className="text-muted-foreground">Net Points</span>
            <span className={`font-bold ${netPoints >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netPoints >= 0 ? "+" : ""}{netPoints.toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.entries.slice(0, 10).map((entry, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
              <div className="flex items-center gap-3">
                {entry.type === "earn" ? (
                  <Plus className="h-4 w-4 text-green-500" />
                ) : (
                  <Minus className="h-4 w-4 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.tier} • {entry.timestamp.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className={`font-medium ${entry.type === "earn" ? "text-green-600" : "text-red-600"}`}>
                {entry.type === "earn" ? "+" : "-"}{entry.amount.toLocaleString()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
