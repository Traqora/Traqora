"use client";

export function useRedeemPoints() {
  async function mutate(amount: number, opts?: { onOptimistic?: () => void; onSuccess?: (res: any) => void; onError?: (e: any) => void }) {
    try {
      opts?.onOptimistic?.();
      const res = await fetch('/api/loyalty/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
      if (!res.ok) throw new Error('Redemption failed');
      const json = await res.json();
      opts?.onSuccess?.(json);
      return json;
    } catch (e) {
      opts?.onError?.(e);
      throw e;
    }
  }

  return { mutate } as const;
}
