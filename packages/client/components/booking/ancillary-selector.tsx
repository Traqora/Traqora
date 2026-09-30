'use client';

import { useEffect, useMemo, useState } from 'react';
import { Armchair, Check, Crown, DoorOpen, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AncillaryCatalogItem,
  AncillaryServiceType,
  fetchAncillaryCatalog,
} from '@/lib/ancillary-api';
import { CurrencyCode, formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

const serviceIcons: Record<AncillaryServiceType, typeof Armchair> = {
  seat_upgrade: Crown,
  priority_boarding: Sparkles,
  lounge_access: DoorOpen,
  extra_legroom: Armchair,
};

interface AncillarySelectorProps {
  cabinClass: string;
  airport?: string;
  selectedCodes: string[];
  onSelectionChange: (items: AncillaryCatalogItem[]) => void;
  displayCurrency?: CurrencyCode;
  rates?: Record<string, number>;
}

export function AncillarySelector({
  cabinClass,
  airport,
  selectedCodes,
  onSelectionChange,
  displayCurrency = 'USD',
  rates,
}: AncillarySelectorProps) {
  const [catalog, setCatalog] = useState<AncillaryCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    fetchAncillaryCatalog(cabinClass, airport)
      .then((items) => {
        if (active) setCatalog(items);
      })
      .catch(() => {
        if (active) setError('Extras are temporarily unavailable. You can continue without them.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [airport, cabinClass]);

  const selected = useMemo(
    () => catalog.filter((item) => selectedCodes.includes(item.code)),
    [catalog, selectedCodes],
  );
  const totalCents = selected.reduce((sum, item) => sum + item.priceCents, 0);

  const formatPrice = (priceCents: number) => {
    const rate = displayCurrency === 'USD' ? 1 : rates?.[displayCurrency] || 1;
    return formatCurrency((priceCents / 100) * rate, displayCurrency);
  };

  const toggle = (item: AncillaryCatalogItem) => {
    const next = selectedCodes.includes(item.code)
      ? selected.filter((candidate) => candidate.code !== item.code)
      : [...selected, item];
    onSelectionChange(next);
  };

  return (
    <section aria-labelledby="ancillary-heading" className="space-y-5">
      <div>
        <h2 id="ancillary-heading" className="text-2xl font-bold">Make the trip yours</h2>
        <p className="text-muted-foreground">
          Add optional comfort and airport services. You can skip this step.
        </p>
      </div>

      {error && <p role="status" className="rounded-lg bg-muted p-4 text-sm">{error}</p>}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Loading available extras…</p>}

      {!isLoading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {catalog.map((item) => {
            const Icon = serviceIcons[item.type];
            const isSelected = selectedCodes.includes(item.code);
            return (
              <Card
                key={item.code}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'border-primary bg-primary/5',
                )}
                onClick={() => toggle(item)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(item)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${item.name}`}
                    />
                  </div>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="font-semibold text-primary">{formatPrice(item.priceCents)}</span>
                  {item.availableAtGate && <Badge variant="outline">Also at gate</Badge>}
                  {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <span className="text-sm text-muted-foreground">
          {selected.length} {selected.length === 1 ? 'extra' : 'extras'} selected
        </span>
        <span className="font-bold">+{formatPrice(totalCents)}</span>
      </div>
    </section>
  );
}
