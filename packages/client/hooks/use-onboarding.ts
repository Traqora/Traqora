"use client";

import { useState, useEffect, useCallback } from 'react';

export type OnboardingStepId =
  | 'wallet-setup'
  | 'first-search'
  | 'first-booking'
  | 'view-dashboard';

export interface OnboardingState {
  completed: boolean;
  skipped: boolean;
  completedSteps: OnboardingStepId[];
  currentStep: OnboardingStepId;
  startedAt: string | null;
}

const STORAGE_KEY = 'traqora_onboarding';
const STEP_ORDER: OnboardingStepId[] = [
  'wallet-setup',
  'first-search',
  'first-booking',
  'view-dashboard',
];

const defaultState: OnboardingState = {
  completed: false,
  skipped: false,
  completedSteps: [],
  currentStep: 'wallet-setup',
  startedAt: null,
};

function load(): OnboardingState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
  } catch {
    return defaultState;
  }
}

function save(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [isOpen, setIsOpen] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const persisted = load();
    setState(persisted);
    // Auto-open for first-time users who haven't completed or skipped.
    if (!persisted.completed && !persisted.skipped && !persisted.startedAt) {
      setIsOpen(true);
    }
  }, []);

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const completeStep = useCallback(
    (stepId: OnboardingStepId) => {
      setState((prev) => {
        if (prev.completedSteps.includes(stepId)) return prev;
        const completedSteps = [...prev.completedSteps, stepId];
        const nextIdx = STEP_ORDER.indexOf(stepId) + 1;
        const currentStep = STEP_ORDER[nextIdx] ?? prev.currentStep;
        const completed = completedSteps.length >= STEP_ORDER.length;
        const next: OnboardingState = {
          ...prev,
          completedSteps,
          currentStep,
          completed,
          startedAt: prev.startedAt ?? new Date().toISOString(),
        };
        save(next);
        return next;
      });
    },
    [],
  );

  const skip = useCallback(() => {
    update({ skipped: true });
    setIsOpen(false);
  }, [update]);

  const reset = useCallback(() => {
    const fresh = { ...defaultState, startedAt: new Date().toISOString() };
    save(fresh);
    setState(fresh);
    setIsOpen(true);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const progress =
    STEP_ORDER.length > 0
      ? Math.round((state.completedSteps.length / STEP_ORDER.length) * 100)
      : 0;

  return {
    state,
    isOpen,
    progress,
    stepOrder: STEP_ORDER,
    completeStep,
    skip,
    reset,
    open,
    close,
  };
}
