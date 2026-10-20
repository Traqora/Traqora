"use client";

import React from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  FileText,
  Search,
  Users,
  Gavel,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type DisputePhase =
  | "created"
  | "evidence"
  | "jury_selection"
  | "commit_vote"
  | "reveal_vote"
  | "appeal"
  | "finalized";

export interface DisputeTimelineEvent {
  phase: DisputePhase;
  label: string;
  timestamp?: Date;
  description?: string;
  status: "completed" | "active" | "upcoming" | "failed";
}

interface DisputeTimelineProps {
  disputeId: string;
  phases: DisputeTimelineEvent[];
  currentPhase: DisputePhase;
  title?: string;
}

const phaseIcons: Record<DisputePhase, React.ReactNode> = {
  created: <FileText className="h-4 w-4" />,
  evidence: <Search className="h-4 w-4" />,
  jury_selection: <Users className="h-4 w-4" />,
  commit_vote: <Clock className="h-4 w-4" />,
  reveal_vote: <Gavel className="h-4 w-4" />,
  appeal: <RefreshCw className="h-4 w-4" />,
  finalized: <CheckCircle className="h-4 w-4" />,
};

const phaseColors: Record<DisputePhase, string> = {
  created: "bg-muted text-muted-foreground",
  evidence: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  jury_selection: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  commit_vote: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  reveal_vote: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  appeal: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  finalized: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export function DisputeTimeline({ disputeId, phases, currentPhase, title }: DisputeTimelineProps) {
  const currentIndex = phases.findIndex((p) => p.phase === currentPhase);

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
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Dispute Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Timeline */}
          <div className="relative space-y-0">
            {phases.map((phase, index) => {
              const isCompleted = index < currentIndex;
              const isCurrent = index === currentIndex;
              const isUpcoming = index > currentIndex;
              const isFailed = phase.status === "failed";

              return (
                <div key={phase.phase} className="flex gap-4 pb-6 last:pb-0">
                  {/* Icon column */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isFailed
                          ? "bg-red-500 border-red-500 text-white"
                          : isCompleted
                          ? "bg-green-500 border-green-500 text-white"
                          : isCurrent
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-muted-foreground text-muted-foreground"
                      }`}
                    >
                      {phaseIcons[phase.phase]}
                    </div>
                    {index < phases.length - 1 && (
                      <div
                        className={`w-0.5 h-full min-h-[2rem] mt-1 ${
                          isCompleted && !isFailed ? "bg-green-500" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>

                  {/* Content column */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${phaseColors[phase.phase]}`}>
                        {phaseIcons[phase.phase]}
                        {phase.label}
                      </span>
                      {isCurrent && <Badge variant="default" className="ml-1">Current</Badge>}
                      {isCompleted && !isFailed && <CheckCircle className="h-3 w-3 text-green-500" />}
                      {isFailed && <XCircle className="h-3 w-3 text-red-500" />}
                      {isUpcoming && <Clock className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    {phase.description && (
                      <p className="text-sm text-muted-foreground">{phase.description}</p>
                    )}
                    {phase.timestamp && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {phase.timestamp.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Phases</div>
            <div className="text-2xl font-bold">{phases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Current Phase</div>
            <div className="text-2xl font-bold capitalize">
              {currentPhase.replace(/_/g, " ")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Completed</div>
            <div className="text-2xl font-bold text-green-600">
              {phases.filter((p) => phases.indexOf(p) < currentIndex && p.status !== "failed").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Progress</div>
            <div className="text-2xl font-bold">
              {Math.round((currentIndex / (phases.length - 1)) * 100)}%
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
