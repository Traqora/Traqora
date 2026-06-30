'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plane,
  Clock,
  DollarSign,
  Star,
  X,
  Plus,
  ArrowRight,
  Users,
  Calendar,
  BarChart3,
  Zap,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Flight } from './flight-search/flight-card';

interface FlightComparisonProps {
  flights: Flight[];
  selectedFlights?: string[];
  onSelect?: (flightIds: string[]) => void;
  maxCompare?: number;
  className?: string;
}

interface ComparisonMetric {
  label: string;
  key: string;
  format: (value: any) => string;
  icon?: React.ReactNode;
}

const comparisonMetrics: ComparisonMetric[] = [
  {
    label: 'Price',
    key: 'price',
    format: (v) => `$${v}`,
    icon: <DollarSign className="h-4 w-4" />,
  },
  {
    label: 'Duration',
    key: 'duration',
    format: (v) => `${Math.floor(v / 60)}h ${v % 60}m`,
    icon: <Clock className="h-4 w-4" />,
  },
  {
    label: 'Stops',
    key: 'stops',
    format: (v) => (v === 0 ? 'Non-stop' : `${v} stop${v > 1 ? 's' : ''}`),
    icon: <Plane className="h-4 w-4" />,
  },
  {
    label: 'Rating',
    key: 'rating',
    format: (v) => `${v} ★`,
    icon: <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />,
  },
  {
    label: 'Available Seats',
    key: 'available_seats',
    format: (v) => `${v} seats`,
    icon: <Users className="h-4 w-4" />,
  },
];

export function FlightComparison({
  flights,
  selectedFlights: initialSelected = [],
  onSelect,
  maxCompare = 4,
  className,
}: FlightComparisonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [compareView, setCompareView] = useState<'table' | 'chart'>('table');

  const selectedFlights = flights.filter((f) => selectedIds.includes(f.id));
  const availableFlights = flights.filter((f) => !selectedIds.includes(f.id));

  const handleSelect = useCallback(
    (flightId: string) => {
      if (selectedIds.includes(flightId)) {
        const newIds = selectedIds.filter((id) => id !== flightId);
        setSelectedIds(newIds);
        onSelect?.(newIds);
        return;
      }

      if (selectedIds.length >= maxCompare) {
        toast({
          title: 'Maximum comparison reached',
          description: `You can compare up to ${maxCompare} flights at a time.`,
          variant: 'destructive',
        });
        return;
      }

      const newIds = [...selectedIds, flightId];
      setSelectedIds(newIds);
      onSelect?.(newIds);
    },
    [selectedIds, maxCompare, onSelect, toast]
  );

  const handleRemove = useCallback(
    (flightId: string) => {
      const newIds = selectedIds.filter((id) => id !== flightId);
      setSelectedIds(newIds);
      onSelect?.(newIds);
    },
    [selectedIds, onSelect]
  );

  const handleClearAll = useCallback(() => {
    setSelectedIds([]);
    onSelect?.([]);
  }, [onSelect]);

  const handleBookNow = useCallback(
    (flightId: string) => {
      router.push(`/book/${flightId}`);
    },
    [router]
  );

  const handleQuickBook = useCallback(
    (flightId: string) => {
      router.push(`/book/${flightId}`);
    },
    [router]
  );

  const getBestValue = (key: string): 'min' | 'max' | null => {
    if (selectedFlights.length === 0) return null;

    const values = selectedFlights.map((f) => {
      switch (key) {
        case 'price':
          return f.price;
        case 'duration':
          return f.duration;
        case 'rating':
          return f.rating;
        case 'available_seats':
          return f.available_seats;
        case 'stops':
          return f.stops;
        default:
          return 0;
      }
    });

    switch (key) {
      case 'price':
      case 'duration':
      case 'stops':
        return values.indexOf(Math.min(...values)) === 0 ? 'min' : null;
      case 'rating':
      case 'available_seats':
        return values.indexOf(Math.max(...values)) === 0 ? 'max' : null;
      default:
        return null;
    }
  };

  const getBestValueLabel = (key: string): string => {
    const best = getBestValue(key);
    if (best === 'min') return 'Best Price';
    if (best === 'max') return 'Best Value';
    return '';
  };

  const renderFlightCell = (flight: Flight, metric: ComparisonMetric) => {
    const value = flight[metric.key as keyof Flight];
    const best = getBestValue(metric.key);

    let bgColor = '';
    if (best === 'min' || best === 'max') {
      bgColor = 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
    }

    return (
      <td className={cn('p-4 text-center', bgColor)}>
        <div className="font-medium">{metric.format(value)}</div>
        {best && (
          <Badge variant="secondary" className="text-[10px] mt-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
            {getBestValueLabel(metric.key)}
          </Badge>
        )}
      </td>
    );
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Compare Flights
          </h2>
          <p className="text-sm text-muted-foreground">
            {selectedIds.length === 0
              ? 'Select flights to compare side by side'
              : `Comparing ${selectedIds.length} of ${maxCompare} flights`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear All
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Flight
              </Button>
            </>
          )}
          {selectedIds.length > 1 && (
            <Select
              value={compareView}
              onValueChange={(v: 'table' | 'chart') => setCompareView(v)}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="View" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="table">Table View</SelectItem>
                <SelectItem value="chart">Chart View</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Empty State */}
      {selectedIds.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No Flights Selected</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Select up to {maxCompare} flights from your search results to compare prices, durations, amenities, and more.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                // Find flights that are visible in search results
                const visibleFlights = flights.slice(0, 2);
                if (visibleFlights.length > 0) {
                  const ids = visibleFlights.map((f) => f.id);
                  setSelectedIds(ids);
                  onSelect?.(ids);
                } else {
                  toast({
                    title: 'No flights available',
                    description: 'Please search for flights first.',
                    variant: 'destructive',
                  });
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Auto-select for comparison
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Comparison View */}
      {selectedIds.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {compareView === 'table' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-4 text-left font-semibold min-w-[120px]">Flight</th>
                    <th className="p-4 text-left font-semibold">Airline</th>
                    <th className="p-4 text-left font-semibold">Departure</th>
                    <th className="p-4 text-left font-semibold">Arrival</th>
                    {comparisonMetrics.map((metric) => (
                      <th key={metric.key} className="p-4 text-center font-semibold">
                        <div className="flex items-center justify-center gap-1">
                          {metric.icon}
                          {metric.label}
                        </div>
                      </th>
                    ))}
                    <th className="p-4 text-center font-semibold">Action</th>
                    <th className="p-4 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFlights.map((flight, index) => (
                    <tr
                      key={flight.id}
                      className={cn(
                        'border-b border-border/50 hover:bg-muted/10 transition-colors',
                        index === 0 && 'bg-primary/5'
                      )}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            #{index + 1}
                          </Badge>
                          <span className="font-medium">{flight.airline}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">{flight.airline}</div>
                        <div className="text-xs text-muted-foreground">{flight.class}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{formatTime(flight.departure_time)}</div>
                        <div className="text-xs text-muted-foreground">{flight.from}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">
                          {flight.arrival_time ? formatTime(flight.arrival_time) : '--:--'}
                        </div>
                        <div className="text-xs text-muted-foreground">{flight.to}</div>
                      </td>
                      {comparisonMetrics.map((metric) => (
                        <td key={`${flight.id}-${metric.key}`} className="p-4 text-center">
                          {renderFlightCell(flight, metric)}
                        </td>
                      ))}
                      <td className="p-4 text-center">
                        <Button size="sm" onClick={() => handleQuickBook(flight.id)}>
                          <Zap className="h-3 w-3 mr-1" />
                          Book
                        </Button>
                      </td>
                      <td className="p-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(flight.id)}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 space-y-6">
                {/* Price Comparison Chart */}
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Price Comparison
                  </h4>
                  <div className="space-y-3">
                    {selectedFlights.map((flight) => {
                      const maxPrice = Math.max(...selectedFlights.map((f) => f.price));
                      const percentage = (flight.price / maxPrice) * 100;

                      return (
                        <div key={`price-${flight.id}`} className="flex items-center gap-3">
                          <div className="w-24 text-sm font-medium truncate">
                            {flight.airline}
                          </div>
                          <div className="flex-1">
                            <Progress
                              value={percentage}
                              className="h-4 bg-muted"
                              indicatorClassName={cn(
                                flight.price === Math.min(...selectedFlights.map((f) => f.price))
                                  ? 'bg-green-500'
                                  : 'bg-primary'
                              )}
                            />
                          </div>
                          <div className="w-20 text-right text-sm font-medium">
                            ${flight.price}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Duration Comparison */}
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Duration Comparison
                  </h4>
                  <div className="space-y-3">
                    {selectedFlights.map((flight) => {
                      const maxDuration = Math.max(...selectedFlights.map((f) => f.duration));
                      const percentage = (flight.duration / maxDuration) * 100;

                      return (
                        <div key={`duration-${flight.id}`} className="flex items-center gap-3">
                          <div className="w-24 text-sm font-medium truncate">
                            {flight.airline}
                          </div>
                          <div className="flex-1">
                            <Progress
                              value={percentage}
                              className="h-4 bg-muted"
                              indicatorClassName={cn(
                                flight.duration === Math.min(...selectedFlights.map((f) => f.duration))
                                  ? 'bg-green-500'
                                  : 'bg-blue-500'
                              )}
                            />
                          </div>
                          <div className="w-20 text-right text-sm font-medium">
                            {Math.floor(flight.duration / 60)}h {flight.duration % 60}m
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Rating Comparison */}
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-400" />
                    Rating Comparison
                  </h4>
                  <div className="space-y-3">
                    {selectedFlights.map((flight) => {
                      const maxRating = Math.max(...selectedFlights.map((f) => f.rating));
                      const percentage = (flight.rating / 5) * 100;

                      return (
                        <div key={`rating-${flight.id}`} className="flex items-center gap-3">
                          <div className="w-24 text-sm font-medium truncate">
                            {flight.airline}
                          </div>
                          <div className="flex-1">
                            <Progress
                              value={percentage}
                              className="h-4 bg-muted"
                              indicatorClassName={cn(
                                flight.rating === Math.max(...selectedFlights.map((f) => f.rating))
                                  ? 'bg-green-500'
                                  : 'bg-yellow-400'
                              )}
                            />
                          </div>
                          <div className="w-20 text-right text-sm font-medium">
                            {flight.rating} ★
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Flight Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Add Flight to Comparison</DialogTitle>
            <DialogDescription>
              Select a flight to add to your comparison list.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {availableFlights.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  No more flights available to compare
                </div>
              ) : (
                availableFlights.slice(0, 10).map((flight) => (
                  <button
                    key={flight.id}
                    className="w-full p-3 text-left rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between"
                    onClick={() => {
                      handleSelect(flight.id);
                      setShowAddDialog(false);
                    }}
                  >
                    <div>
                      <div className="font-medium">{flight.airline}</div>
                      <div className="text-sm text-muted-foreground">
                        {flight.from} → {flight.to} • ${flight.price}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop`}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Action Buttons */}
      {selectedIds.length > 1 && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push('/compare')} className="flex-1">
            <BarChart3 className="h-4 w-4 mr-2" />
            Open Full Comparison
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // Select the best flight based on price
              const bestPrice = Math.min(...selectedFlights.map((f) => f.price));
              const bestFlight = selectedFlights.find((f) => f.price === bestPrice);
              if (bestFlight) {
                toast({
                  title: 'Best price found!',
                  description: `${bestFlight.airline} at $${bestFlight.price} is the cheapest option.`,
                });
              }
            }}
          >
            Find Best Price
          </Button>
        </div>
      )}
    </div>
  );
}

export default FlightComparison;