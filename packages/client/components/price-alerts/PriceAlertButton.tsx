'use client';

import { useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface PriceAlertButtonProps {
  flightId: string;
  currentPrice: number;
  userId?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
}

export function PriceAlertButton({
  flightId,
  currentPrice,
  userId,
  className,
  variant = 'outline',
}: PriceAlertButtonProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [hasAlert, setHasAlert] = useState(false);

  const handleCreateAlert = async () => {
    if (!userId) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to create price alerts.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          flightId,
          targetPrice: currentPrice * 0.9, // 10% below current price as default
          currency: 'USD',
          notificationMethod: 'both',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create alert');
      }

      setHasAlert(true);
      toast({
        title: 'Alert created!',
        description: `You'll be notified when flight ${flightId} drops below $${(currentPrice * 0.9).toFixed(2)}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create price alert.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleCreateAlert}
      disabled={isLoading || hasAlert}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : hasAlert ? (
        <>
          <BellOff className="h-4 w-4 mr-1" />
          Alert Set
        </>
      ) : (
        <>
          <Bell className="h-4 w-4 mr-1" />
          Set Alert
        </>
      )}
    </Button>
  );
}