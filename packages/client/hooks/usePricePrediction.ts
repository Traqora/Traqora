'use client';

import { useState, useEffect } from 'react';

interface PricePrediction {
  estimatedPrice: number;
  currency: string;
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  trendDirection: 'rising' | 'falling' | 'stable';
  recommendation: 'buy_now' | 'wait';
  dataPointCount: number;
}

interface PredictionResponse {
  route: {
    origin: string;
    destination: string;
    date: string;
    passengers: number;
  };
  prediction: PricePrediction;
  generatedAt: string;
  note: string;
}

export function usePricePrediction(origin: string, destination: string, date: string, passengers: number = 1) {
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !destination || !date) return;

    const fetchPrediction = async () => {
      setLoading(true);
      setError(null);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(
          `${apiUrl}/api/v1/analytics/price-prediction?origin=${origin}&destination=${destination}&date=${date}&passengers=${passengers}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch prediction');
        }

        const data: PredictionResponse = await response.json();
        setPrediction(data.prediction);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load prediction');
      } finally {
        setLoading(false);
      }
    };

    fetchPrediction();
  }, [origin, destination, date, passengers]);

  return { prediction, loading, error };
}
