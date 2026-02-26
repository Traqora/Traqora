"use client";

export function useReferral() {
  async function createReferralLink(): Promise<{ url: string }> {
    const res = await fetch('/api/loyalty/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ createLink: true }) });
    if (!res.ok) throw new Error('Failed to create referral link');
    return res.json();
  }

  return { createReferralLink } as const;
}
