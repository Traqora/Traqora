'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Shield, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InsuranceQuote {
  coverageType: 'basic' | 'standard' | 'premium';
  premiumCents: number;
  currency: string;
  coverageDetails: {
    medicalExpenses: string;
    tripCancellation: string;
    baggageLoss: string;
    flightDelay: string;
  };
}

interface Props {
  bookingId?: string;
  tripCostCents: number;
  destination: string;
  onSelect: (coverageType: string, premiumCents: number) => void;
}

export function InsuranceSelector({ bookingId, tripCostCents, destination, onSelect }: Props) {
  const [quotes, setQuotes] = useState<InsuranceQuote[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchQuotes();
  }, [tripCostCents, destination]);

  const fetchQuotes = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/v1/insurance/quotes?tripCostCents=${tripCostCents}&destination=${destination}`
      );

      if (response.ok) {
        const result = await response.json();
        setQuotes(result.data);
      }
      setLoading(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load insurance quotes',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleSelect = (quote: InsuranceQuote) => {
    setSelectedType(quote.coverageType);
    onSelect(quote.coverageType, quote.premiumCents);
  };

  const getTierLabel = (type: string) => {
    switch (type) {
      case 'basic':
        return { label: 'Basic', color: 'default' as const };
      case 'standard':
        return { label: 'Standard', color: 'secondary' as const };
      case 'premium':
        return { label: 'Premium', color: 'default' as const };
      default:
        return { label: type, color: 'default' as const };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Travel Insurance
          </CardTitle>
          <CardDescription>Protect your trip with travel insurance</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Travel Insurance (Optional)
        </CardTitle>
        <CardDescription>Protect your trip against unexpected events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {quotes.map((quote) => {
            const tier = getTierLabel(quote.coverageType);
            const isSelected = selectedType === quote.coverageType;

            return (
              <Card
                key={quote.coverageType}
                className={`relative cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary shadow-md'
                    : 'hover:border-gray-400'
                }`}
                onClick={() => handleSelect(quote)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant={tier.color}>{tier.label}</Badge>
                    {isSelected && (
                      <div className="bg-primary text-primary-foreground rounded-full p-1">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-2xl">
                    ${(quote.premiumCents / 100).toFixed(2)}
                  </CardTitle>
                  <CardDescription>per person</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="space-y-1 text-sm">
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>{quote.coverageDetails.medicalExpenses}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>{quote.coverageDetails.tripCancellation}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>{quote.coverageDetails.baggageLoss}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>{quote.coverageDetails.flightDelay}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Important Information</p>
              <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
                <li>Coverage begins at the time of purchase</li>
                <li>Full refund available within 24 hours of purchase</li>
                <li>Claims must be submitted within 30 days of the incident</li>
              </ul>
            </div>
          </div>
        </div>

        {selectedType && (
          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              Selected: <span className="font-medium capitalize">{selectedType}</span> coverage
            </p>
          </div>
        )}

        {!selectedType && (
          <Button
            variant="ghost"
            className="w-full mt-4"
            onClick={() => onSelect('none', 0)}
          >
            Skip Insurance
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
