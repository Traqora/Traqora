"use client";

import Link from "next/link";
import { RefundRequestForm } from "@/components/refunds/RefundRequestForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RefundRequestPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <Link href="/refunds">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Refunds
          </Button>
        </Link>
        <h1 className="text-3xl font-serif font-bold mb-2">Request a Refund</h1>
        <p className="text-muted-foreground">
          Submit a refund request for your booking. We'll review your request and process it according to our refund policy.
        </p>
      </div>

      <RefundRequestForm />
    </div>
  );
}
