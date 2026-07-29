"use client";

import Link from "next/link";
import { DisputeForm } from "@/components/refunds/DisputeForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DisputePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <Link href="/refunds">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Refunds
          </Button>
        </Link>
        <h1 className="text-3xl font-serif font-bold mb-2">File a Dispute</h1>
        <p className="text-muted-foreground">
          If you disagree with a refund decision, you can file a dispute for independent review by a jury.
        </p>
      </div>

      <DisputeForm />
    </div>
  );
}
