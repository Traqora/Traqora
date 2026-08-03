'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AncillaryRevenueReport,
  AncillaryServiceType,
  fetchAncillaryRevenue,
} from '@/lib/ancillary-api';
import { formatCurrency } from '@/lib/currency';

const labels: Record<AncillaryServiceType, string> = {
  seat_upgrade: 'Seat upgrades',
  priority_boarding: 'Priority boarding',
  lounge_access: 'Lounge access',
  extra_legroom: 'Extra legroom',
};

export function AncillaryRevenueDashboard({ from, to }: { from?: Date; to?: Date }) {
  const [report, setReport] = useState<AncillaryRevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAncillaryRevenue(from, to)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch(() => {
        if (active) setError('Unable to load ancillary revenue.');
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p role="status">Loading ancillary revenue…</p>;

  return (
    <section aria-labelledby="ancillary-revenue-heading" className="space-y-4">
      <div>
        <h2 id="ancillary-revenue-heading" className="text-2xl font-bold">Ancillary revenue</h2>
        <p className="text-muted-foreground">{report.purchaseCount} recognised purchases</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader><CardTitle>Total</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatCurrency(report.totalCents / 100, 'USD')}
          </CardContent>
        </Card>
        {(Object.keys(labels) as AncillaryServiceType[]).map((type) => (
          <Card key={type}>
            <CardHeader><CardTitle>{labels[type]}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                {formatCurrency(report.byType[type].totalCents / 100, 'USD')}
              </p>
              <p className="text-sm text-muted-foreground">
                {report.byType[type].purchaseCount} purchases
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
