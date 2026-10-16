'use client';

import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { API_BASE_URL } from '@/lib/api';

interface FareDataPoint {
  date: string;
  price: number;
  currency: string;
}

interface FareTrendResponse {
  route: string;
  windowDays: number;
  summary: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    currentPrice: number | null;
    dataPointCount: number;
    seasonalNote: string;
  };
  dataPoints: FareDataPoint[];
}

export interface FareTrendChartProps {
  /** Route/flight id in the `ORIGIN-DEST-YYYY-MM-DD` shape the backend
   * keys price history by (see routeFlightId in analytics.ts). */
  route: string;
  windowDays?: 30 | 60 | 90;
}

/**
 * Fetches and renders a route's fare price history + trend summary from
 * GET /analytics/fare-trends/:route (#376). A route with no accumulated
 * price history yet (nobody has an active price alert on it) renders a
 * clear empty state rather than a misleading empty chart.
 */
export function FareTrendChart({ route, windowDays = 30 }: FareTrendChartProps) {
  const [data, setData] = useState<FareTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE_URL}/api/v1/analytics/fare-trends/${encodeURIComponent(route)}?window=${windowDays}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load fare trends (${res.status})`);
        return res.json();
      })
      .then((json: FareTrendResponse) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load fare trends');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route, windowDays]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fare trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fare trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Couldn&apos;t load fare trend data.</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.summary.dataPointCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fare trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No price history for this route yet — trends appear once it has been tracked for a while.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary, dataPoints } = data;
  const trendUp = summary.currentPrice !== null && summary.currentPrice > summary.avgPrice;
  const trendFlat = summary.currentPrice === summary.avgPrice;
  const TrendIcon = trendFlat ? Minus : trendUp ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Fare trend — last {windowDays} days</CardTitle>
        <Badge variant={trendUp ? 'destructive' : 'secondary'} className="flex items-center gap-1">
          <TrendIcon className="h-3 w-3" />
          {summary.currentPrice !== null
            ? `${dataPoints[0]?.currency ?? 'USD'} ${summary.currentPrice}`
            : 'n/a'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataPoints}>
              <XAxis dataKey="date" hide />
              <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
              <Tooltip
                formatter={(value: number) => [`${dataPoints[0]?.currency ?? 'USD'} ${value}`, 'Price']}
                labelFormatter={(label) => label}
              />
              <Line type="monotone" dataKey="price" stroke="currentColor" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <dt className="text-muted-foreground">Low</dt>
            <dd className="font-medium">{summary.minPrice}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Avg</dt>
            <dd className="font-medium">{summary.avgPrice}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">High</dt>
            <dd className="font-medium">{summary.maxPrice}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{summary.seasonalNote}</p>
      </CardContent>
    </Card>
  );
}
