"use client";
import React, { useState } from "react";
import { useRedeemPoints } from "@/hooks/loyalty/useRedeemPoints";
import { useToast } from "@/hooks/use-toast";

export function RedeemPointsForm({ points, onRedeemedOptimistic }: { points: number; onRedeemedOptimistic?: () => void }) {
  const [amount, setAmount] = useState(0);
  const { toast } = useToast();
  const redeem = useRedeemPoints();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;

    // optimistic update: show immediate deduction
    setPending(true);
    try {
      await redeem.mutate(amount, {
        onOptimistic: () => {
          toast({ description: `Redeeming ${amount} points...` });
        },
        onSuccess: (res) => {
          toast({ description: `Redeemed ${amount} points. New balance: ${res.newPoints}` });
          onRedeemedOptimistic?.();
        },
        onError: (err) => {
          toast({ description: `Redemption failed: ${err?.message || 'unknown error'}`, variant: 'destructive' });
        }
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 bg-background">
      <h2 className="text-lg font-medium">Redeem Points</h2>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <div className="text-sm text-muted-foreground">Available: {points.toLocaleString()}</div>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(parseInt(e.target.value || '0', 10))}
          className="w-full border rounded px-3 py-2 bg-background"
          placeholder="Enter points to redeem"
        />
        <button disabled={pending || amount <= 0} className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">
          {pending ? 'Redeeming...' : 'Redeem'}
        </button>
      </form>
    </div>
  );
}
