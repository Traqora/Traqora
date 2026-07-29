'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Plane,
  Loader2,
  AlertCircle,
  Share2,
  Copy,
  Check,
  Star,
  Clock,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FlightComparison } from '@/components/flight-comparison';
import { useToast } from '@/hooks/use-toast';
import { Flight } from '@/components/flight-search/flight-card';

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Get flight IDs from URL
  const flightIds = searchParams.get('ids')?.split(',') || [];

  useEffect(() => {
    const fetchFlights = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // If no flight IDs, try to get from localStorage
        let ids = flightIds;
        if (ids.length === 0) {
          const stored = localStorage.getItem('comparison_flights');
          if (stored) {
            ids = JSON.parse(stored);
          }
        }

        if (ids.length === 0) {
          // Load some default flights for demo
          const defaultFlights: Flight[] = [
            {
              id: '1',
              from: 'JFK',
              to: 'LAX',
              fromCity: 'New York',
              toCity: 'Los Angeles',
              departure_time: '2024-12-15T08:30:00Z',
              arrival_time: '2024-12-15T11:45:00Z',
              airline: 'AA',
              airline_name: 'American Airlines',
              stops: 0,
              duration: 375,
              price: 450,
              rating: 4.2,
              available_seats: 12,
              class: 'economy',
              aircraft: 'Boeing 737-800',
              amenities: ['WiFi', 'In-flight entertainment', 'Complimentary snacks'],
            },
            {
              id: '2',
              from: 'JFK',
              to: 'LAX',
              fromCity: 'New York',
              toCity: 'Los Angeles',
              departure_time: '2024-12-15T09:15:00Z',
              arrival_time: '2024-12-15T12:30:00Z',
              airline: 'DL',
              airline_name: 'Delta Air Lines',
              stops: 1,
              duration: 315,
              price: 380,
              rating: 4.5,
              available_seats: 8,
              class: 'economy',
              aircraft: 'Airbus A320',
              amenities: ['WiFi', 'USB charging', 'Complimentary snacks'],
            },
            {
              id: '3',
              from: 'JFK',
              to: 'LAX',
              fromCity: 'New York',
              toCity: 'Los Angeles',
              departure_time: '2024-12-15T07:00:00Z',
              arrival_time: '2024-12-15T10:15:00Z',
              airline: 'UA',
              airline_name: 'United Airlines',
              stops: 0,
              duration: 345,
              price: 520,
              rating: 4.0,
              available_seats: 5,
              class: 'economy',
              aircraft: 'Boeing 737-900',
              amenities: ['WiFi', 'In-flight entertainment', 'Meals included'],
            },
          ];

          // Set default selection
          const defaultSelected = defaultFlights.slice(0, 2).map((f) => f.id);
          setSelectedIds(defaultSelected);
          localStorage.setItem('comparison_flights', JSON.stringify(defaultSelected));
          setFlights(defaultFlights);
          setIsLoading(false);
          return;
        }

        // Fetch flights from API
        const fetchPromises = ids.map((id) =>
          fetch(`/api/v1/flights/${id}`).then((res) => {
            if (!res.ok) throw new Error(`Failed to fetch flight ${id}`);
            return res.json();
          })
        );

        const results = await Promise.allSettled(fetchPromises);
        const fetchedFlights: Flight[] = [];

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            fetchedFlights.push(result.value.data);
          } else {
            console.error(`Failed to fetch flight ${ids[index]}:`, result.reason);
          }
        });

        if (fetchedFlights.length === 0) {
          throw new Error('No flights could be loaded');
        }

        setFlights(fetchedFlights);
        setSelectedIds(fetchedFlights.map((f) => f.id));
      } catch (err: any) {
        setError(err.message || 'Failed to load flights');
        toast({
          title: 'Error',
          description: err.message || 'Failed to load flights for comparison.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchFlights();
  }, [flightIds, toast]);

  const handleCopyShareLink = () => {
    const ids = selectedIds.join(',');
    const url = `${window.location.origin}/compare?ids=${ids}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({
      title: 'Link copied!',
      description: 'Share this link to show your flight comparison.',
    });
    setTimeout(() => setCopied(false), 3000);
  };

  const handleShare = async () => {
    const ids = selectedIds.join(',');
    const url = `${window.location.origin}/compare?ids=${ids}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Flight Comparison',
          text: 'Check out this flight comparison!',
          url,
        });
      } catch (error) {
        console.log('Share cancelled');
      }
    } else {
      handleCopyShareLink();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading flights...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/search">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Search
              </Button>
            </Link>
            <div>
              <h1 className="font-serif font-bold text-3xl text-foreground flex items-center gap-2">
                <BarChart3 className="h-8 w-8 text-primary" />
                Flight Comparison
              </h1>
              <p className="text-muted-foreground mt-1">
                Compare {selectedIds.length} flights side by side
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyShareLink}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Link
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          </div>
        </div>

        {/* Flight Comparison */}
        <FlightComparison
          flights={flights}
          selectedFlights={selectedIds}
          onSelect={setSelectedIds}
          maxCompare={4}
        />

        {/* Additional Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Comparison Tips</CardTitle>
            <CardDescription>
              How to choose the best flight for your needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  Best Price
                </div>
                <p className="text-sm text-muted-foreground">
                  Look for the flight with the lowest total price, but consider the value
                  of included amenities and flight duration.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Shortest Duration
                </div>
                <p className="text-sm text-muted-foreground">
                  Choose non-stop or fewer stop flights for the quickest journey.
                  Sometimes paying a bit more saves significant travel time.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Star className="h-4 w-4 text-yellow-400" />
                  Best Rated
                </div>
                <p className="text-sm text-muted-foreground">
                  Check passenger ratings for insights on comfort, service quality,
                  and overall experience.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}