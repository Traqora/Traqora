'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PriceTrendData {
  dataPoints: Array<{ date: string; price: number; currency: string }>;
  summary: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    currentPrice: number | null;
    dataPointCount: number;
    seasonalNote?: string;
  };
}

interface PricePrediction {
  estimatedPrice: number;
  currency: string;
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  trendDirection: 'rising' | 'falling' | 'stable';
  recommendation: 'buy_now' | 'wait';
  dataPointCount: number;
}

interface Props {
  flightId: string;
  currentPrice: number;
}

export function PriceTrendChart({ flightId, currentPrice }: Props) {
  const [trendData, setTrendData] = useState<PriceTrendData | null>(null);
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        
        // Fetch trend data
        const trendResponse = await fetch(
          `${apiUrl}/api/v1/analytics/fare-trends/${flightId}?window=30`
        );
        if (trendResponse.ok) {
          const trendResult = await trendResponse.json();
          setTrendData(trendResult);
        }

        // Fetch prediction
        const [origin, dest, date] = flightId.split('-');
        const predictionResponse = await fetch(
          `${apiUrl}/api/v1/analytics/price-prediction?origin=${origin}&destination=${dest}&date=${date}`
        );
        if (predictionResponse.ok) {
          const predResult = await predictionResponse.json();
          setPrediction(predResult.prediction);
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to load price trends');
        setLoading(false);
      }
    };

    fetchData();
  }, [flightId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Trends</CardTitle>
          <CardDescription>Loading historical data...</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !trendData || trendData.summary.dataPointCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Trends</CardTitle>
          <CardDescription>No historical data available yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">
              Price history will be available once this route has active price alerts.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    if (!prediction) return <Minus className="h-4 w-4" />;
    switch (prediction.trendDirection) {
      case 'rising':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'falling':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRecommendationColor = () => {
    if (!prediction) return 'default';
    return prediction.recommendation === 'buy_now' ? 'default' : 'secondary';
  };

  const confidenceColor = prediction?.confidenceLabel === 'high' ? 'text-green-600' : 
                          prediction?.confidenceLabel === 'medium' ? 'text-yellow-600' : 
                          'text-gray-600';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Price Trends & Prediction</CardTitle>
            <CardDescription>Last 30 days of price data</CardDescription>
          </div>
          {prediction && (
            <div className="flex items-center gap-2">
              {getTrendIcon()}
              <Badge variant={getRecommendationColor()}>
                {prediction.recommendation === 'buy_now' ? 'Book Now' : 'Wait for Better Price'}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData.dataPoints}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value: number) => [`$${value}`, 'Price']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <ReferenceLine 
                y={trendData.summary.avgPrice} 
                stroke="#888" 
                strokeDasharray="3 3"
                label={{ value: 'Avg', position: 'right', fontSize: 12 }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#8884d8" 
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Price</p>
            <p className="text-lg font-bold">${trendData.summary.currentPrice || currentPrice}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Average Price</p>
            <p className="text-lg font-bold">${trendData.summary.avgPrice}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Min Price</p>
            <p className="text-lg font-bold text-green-600">${trendData.summary.minPrice}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Max Price</p>
            <p className="text-lg font-bold text-red-600">${trendData.summary.maxPrice}</p>
          </div>
        </div>

        {prediction && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Predicted Price</span>
              <span className="text-lg font-bold">${prediction.estimatedPrice}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Confidence</span>
              <span className={`text-sm font-semibold ${confidenceColor}`}>
                {prediction.confidenceLabel.toUpperCase()} ({Math.round(prediction.confidence * 100)}%)
              </span>
            </div>
            {trendData.summary.seasonalNote && (
              <p className="text-xs text-muted-foreground mt-2">
                {trendData.summary.seasonalNote}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
