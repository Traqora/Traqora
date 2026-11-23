"use client";

import React from "react";
import {
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  Eye,
  Vote,
  FileText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ProposalStage =
  | "created"
  | "active"
  | "voting"
  | "passed"
  | "rejected"
  | "executed";

export interface ProposalLifecycleEvent {
  stage: ProposalStage;
  label: string;
  timestamp?: Date;
  description?: string;
}

interface ProposalLifecycleProps {
  proposalId: string;
  stages: ProposalLifecycleEvent[];
  currentStage: ProposalStage;
  title?: string;
}

const stageIcons: Record<ProposalStage, React.ReactNode> = {
  created: <FileText className="h-4 w-4" />,
  active: <Sparkles className="h-4 w-4" />,
  voting: <Vote className="h-4 w-4" />,
  passed: <CheckCircle className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  executed: <ArrowRight className="h-4 w-4" />,
};

const stageColors: Record<ProposalStage, string> = {
  created: "bg-muted text-muted-foreground",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  voting: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  passed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  executed: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function ProposalLifecycle({ proposalId, stages, currentStage, title }: ProposalLifecycleProps) {
  const currentIndex = stages.findIndex((s) => s.stage === currentStage);

  return (
    <div className="space-y-6">
      {title && (
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-serif font-bold">{title}</h2>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Proposal Lifecycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Timeline */}
          <div className="relative space-y-0">
            {stages.map((stage, index) => {
              const isCompleted = index < currentIndex;
              const isCurrent = index === currentIndex;
              const isUpcoming = index > currentIndex;

              return (
                <div key={stage.stage} className="flex gap-4 pb-6 last:pb-0">
                  {/* Icon column */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted
                          ? "bg-green-500 border-green-500 text-white"
                          : isCurrent
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-muted-foreground text-muted-foreground"
                      }`}
                    >
                      {stageIcons[stage.stage]}
                    </div>
                    {index < stages.length - 1 && (
                      <div
                        className={`w-0.5 h-full min-h-[2rem] mt-1 ${
                          isCompleted ? "bg-green-500" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>

                  {/* Content column */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stageColors[stage.stage]}`}>
                        {stageIcons[stage.stage]}
                        {stage.label}
                      </span>
                      {isCurrent && <Badge variant="default" className="ml-1">Current</Badge>}
                      {isCompleted && <CheckCircle className="h-3 w-3 text-green-500" />}
                    </div>
                    {stage.description && (
                      <p className="text-sm text-muted-foreground">{stage.description}</p>
                    )}
                    {stage.timestamp && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {stage.timestamp.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Stages</div>
            <div className="text-2xl font-bold">{stages.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Current Stage</div>
            <div className="text-2xl font-bold capitalize">{currentStage}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Progress</div>
            <div className="text-2xl font-bold">
              {Math.round((currentIndex / (stages.length - 1)) * 100)}%
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
