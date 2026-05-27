"use client";
import React, { useState } from "react";
import { useReferral } from "@/hooks/loyalty/useReferral";
import { useToast } from "@/hooks/use-toast";

export function ReferralInvite() {
  const { createReferralLink } = useReferral();
  const { toast } = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function onCreateLink() {
    setPending(true);
    try {
      const res = await createReferralLink();
      setLink(res.url);
      await navigator.clipboard.writeText(res.url);
      toast({ description: "Referral link created and copied to clipboard" });
    } catch (e: any) {
      toast({ description: `Failed to create link: ${e?.message || 'unknown error'}`, variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setPending(true);
    try {
      const res = await fetch('/api/loyalty/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!res.ok) throw new Error('Invite failed');
      toast({ description: `Invite sent to ${email}` });
      setEmail("");
    } catch (e: any) {
      toast({ description: `Invite failed: ${e?.message || 'unknown error'}`, variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 bg-background">
      <h2 className="text-lg font-medium">Referral</h2>
      <div className="flex gap-2 mt-2">
        <button onClick={onCreateLink} disabled={pending} className="px-3 py-2 rounded border disabled:opacity-50">
          {pending ? 'Working...' : 'Create Referral Link'}
        </button>
        {link && <input value={link} readOnly className="flex-1 border rounded px-3 py-2 bg-muted" />}
      </div>
      <form onSubmit={onInvite} className="mt-3 flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Friend's email" className="flex-1 border rounded px-3 py-2" />
        <button disabled={pending || !email} className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">Send Invite</button>
      </form>
    </div>
  );
}
