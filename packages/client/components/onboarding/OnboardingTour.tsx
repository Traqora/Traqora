"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Lock,
} from "lucide-react";

export type TourStep = {
  id: string;
  title: string;
  description: string;
  action: string;
  completed: boolean;
  optional?: boolean;
  estimatedTime?: string;
};

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps?: TourStep[];
}

const defaultSteps: TourStep[] = [
  {
    id: "wallet-setup",
    title: "Connect Your Wallet",
    description: "Set up your crypto wallet to start booking flights securely.",
    action: "Connect Wallet",
    completed: false,
    estimatedTime: "2 min",
  },
  {
    id: "first-search",
    title: "Search for Flights",
    description: "Explore available flights with our advanced search filters.",
    action: "Search Flights",
    completed: false,
    estimatedTime: "3 min",
  },
  {
    id: "first-booking",
    title: "Book Your First Flight",
    description:
      "Complete a flight booking using secure blockchain technology.",
    action: "Book Flight",
    completed: false,
    estimatedTime: "5 min",
  },
  {
    id: "view-dashboard",
    title: "View Your Dashboard",
    description: "Monitor your bookings, refunds, and loyalty rewards.",
    action: "Go to Dashboard",
    completed: false,
    estimatedTime: "3 min",
  },
  {
    id: "manage-preferences",
    title: "Set Preferences",
    description: "Customize your notification settings and travel preferences.",
    action: "Set Preferences",
    completed: false,
    optional: true,
    estimatedTime: "2 min",
  },
];

export function OnboardingTour({
  isOpen,
  onClose,
  steps = defaultSteps,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [localSteps, setLocalSteps] = useState(steps);

  useEffect(() => {
    setLocalSteps(steps);
  }, [steps]);

  if (!isOpen) return null;

  const current = localSteps[currentStep];
  const progress = ((currentStep + 1) / localSteps.length) * 100;
  const completedSteps = localSteps.filter((s) => s.completed).length;

  const handleNext = () => {
    if (currentStep < localSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    const updated = [...localSteps];
    updated[currentStep].completed = true;
    setLocalSteps(updated);
    handleNext();
  };

  const handleSkip = () => {
    if (currentStep === localSteps.length - 1) {
      onClose();
    } else {
      handleNext();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">Welcome to Traqora</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Step {currentStep + 1} of {localSteps.length}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-secondary rounded-full mt-4 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Current Step */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-semibold text-primary">
                  {currentStep + 1}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{current?.title}</h3>
                {current?.optional && (
                  <Badge variant="outline" className="mt-1">
                    Optional
                  </Badge>
                )}
              </div>
              {current?.estimatedTime && (
                <span className="text-sm text-muted-foreground">
                  {current.estimatedTime}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <p className="text-muted-foreground text-base">
            {current?.description}
          </p>

          {/* Steps Overview */}
          <div className="space-y-2 bg-secondary/20 p-4 rounded-lg max-h-48 overflow-y-auto">
            <h4 className="font-semibold text-sm mb-3">Your Journey</h4>
            {localSteps.map((step, idx) => (
              <div
                key={step.id}
                className={`flex items-center space-x-3 p-2 rounded cursor-pointer transition-colors ${
                  idx === currentStep
                    ? "bg-primary/10"
                    : step.completed
                      ? "bg-primary/5"
                      : ""
                }`}
                onClick={() => setCurrentStep(idx)}
              >
                <div className="flex-shrink-0">
                  {step.completed ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : idx === currentStep ? (
                    <AlertCircle className="h-5 w-5 text-primary" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm ${step.completed ? "text-muted-foreground line-through" : ""}`}
                  >
                    {step.title}
                  </p>
                </div>
                {step.optional && (
                  <Badge variant="outline" className="text-xs">
                    Optional
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 bg-primary/5 p-4 rounded-lg">
            <div>
              <p className="text-2xl font-bold text-primary">
                {completedSteps}
              </p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-muted-foreground">
                {localSteps.length - completedSteps}
              </p>
              <p className="text-xs text-muted-foreground">Remaining</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {Math.round(progress)}%
              </p>
              <p className="text-xs text-muted-foreground">Progress</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <Button variant="outline" onClick={handleSkip} className="flex-1">
              {currentStep === localSteps.length - 1 ? "Finish" : "Skip"}
            </Button>

            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex-1"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            <Button onClick={handleComplete} className="flex-1">
              {current?.action}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Keyboard Shortcuts */}
          <p className="text-xs text-muted-foreground text-center">
            💡 Tip: Use arrow keys to navigate or click steps to jump
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
