import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Receipt, Scale, FileText } from "lucide-react";

export default function RefundsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
        <h1 className="text-3xl font-serif font-bold mb-2">Refunds & Disputes</h1>
        <p className="text-muted-foreground">
          Manage refund requests, track status, and file disputes if needed.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/refunds/request">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="font-serif">Request a Refund</CardTitle>
              <CardDescription>
                Submit a new refund request for your booking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                <Receipt className="mr-2 h-4 w-4" />
                Start Refund Request
              </Button>
            </CardContent>
          </Card>
        </Link>

        <Link href="/refunds/status">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="font-serif">Track Refund Status</CardTitle>
              <CardDescription>
                Check the status of your existing refund requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                View Status
              </Button>
            </CardContent>
          </Card>
        </Link>

        <Link href="/refunds/dispute">
          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer md:col-span-2">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-orange-10 flex items-center justify-center mb-2">
                <Scale className="h-6 w-6 text-orange-600" />
              </div>
              <CardTitle className="font-serif">File a Dispute</CardTitle>
              <CardDescription>
                If you disagree with a refund decision, file a dispute for independent review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                <Scale className="mr-2 h-4 w-4" />
                File Dispute
              </Button>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
