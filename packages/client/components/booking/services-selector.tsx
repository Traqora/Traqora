"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Wifi, Luggage, Play, Plus, X } from "lucide-react";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  type: "wifi" | "baggage" | "entertainment";
}

interface ServiceOrder {
  serviceId: string;
  name: string;
  type: "wifi" | "baggage" | "entertainment";
  quantity: number;
  price: number;
}

interface ServicesSelectorProps {
  wifiServices: Service[];
  baggageServices: Service[];
  entertainmentServices: Service[];
  selectedServices: ServiceOrder[];
  onServiceAdd: (service: ServiceOrder) => void;
  onServiceRemove: (serviceId: string) => void;
  displayCurrency?: CurrencyCode;
  rates?: Record<string, number>;
}

export function ServicesSelector({
  wifiServices,
  baggageServices,
  entertainmentServices,
  selectedServices,
  onServiceAdd,
  onServiceRemove,
  displayCurrency = "USD",
  rates,
}: ServicesSelectorProps) {
  const [selectedTab, setSelectedTab] = useState("wifi");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const convertPrice = (priceInCents: number): number => {
    if (displayCurrency === "USD" || !rates) return priceInCents / 100;
    return (priceInCents / 100) * (rates[displayCurrency] || 1);
  };

  const handleAddService = (service: Service): void => {
    const qty = quantities[service.id] || 1;
    const order: ServiceOrder = {
      serviceId: service.id,
      name: service.name,
      type: service.type,
      quantity: qty,
      price: service.price,
    };
    onServiceAdd(order);
    setQuantities({ ...quantities, [service.id]: 1 });
  };

  const updateQuantity = (serviceId: string, qty: number): void => {
    setQuantities({
      ...quantities,
      [serviceId]: Math.max(1, Math.min(10, qty)),
    });
  };

  const totalServiceCost = selectedServices.reduce(
    (sum, s) => sum + (s.price / 100) * s.quantity,
    0,
  );

  const renderServiceCard = (service: Service): JSX.Element => {
    const isSelected = selectedServices.some((s) => s.serviceId === service.id);

    return (
      <div
        key={service.id}
        className={cn(
          "p-4 rounded-lg border-2 transition-all",
          isSelected
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
        )}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{service.name}</h4>
              <p className="text-xs text-muted-foreground">
                {service.description}
              </p>
            </div>
            <p className="font-bold text-primary text-right ml-2">
              +{formatCurrency(convertPrice(service.price), displayCurrency)}
            </p>
          </div>

          {!isSelected ? (
            <div className="flex gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuantity(
                      service.id,
                      (quantities[service.id] || 1) - 1,
                    )
                  }
                  className="h-7 w-7 p-0 text-xs"
                >
                  −
                </Button>
                <span className="w-6 text-center text-xs font-medium">
                  {quantities[service.id] || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuantity(
                      service.id,
                      (quantities[service.id] || 1) + 1,
                    )
                  }
                  className="h-7 w-7 p-0 text-xs"
                >
                  +
                </Button>
              </div>
              <Button
                onClick={() => handleAddService(service)}
                className="flex-1 h-7 text-xs"
                size="sm"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => onServiceRemove(service.id)}
              variant="destructive"
              size="sm"
              className="w-full h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0">
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          <span>Add-On Services</span>
          <Badge variant="secondary" className="ml-auto">
            Optional
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0 space-y-6">
        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="wifi" className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              <span className="hidden sm:inline">WiFi</span>
            </TabsTrigger>
            <TabsTrigger value="baggage" className="flex items-center gap-2">
              <Luggage className="h-4 w-4" />
              <span className="hidden sm:inline">Baggage</span>
            </TabsTrigger>
            <TabsTrigger
              value="entertainment"
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Entertainment</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wifi" className="space-y-4 mt-4">
            {wifiServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No WiFi services available
              </p>
            ) : (
              <div className="grid gap-3">
                {wifiServices.map(renderServiceCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="baggage" className="space-y-4 mt-4">
            {baggageServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No baggage services available
              </p>
            ) : (
              <div className="grid gap-3">
                {baggageServices.map(renderServiceCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="entertainment" className="space-y-4 mt-4">
            {entertainmentServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entertainment services available
              </p>
            ) : (
              <div className="grid gap-3">
                {entertainmentServices.map(renderServiceCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {selectedServices.length > 0 && (
          <div className="space-y-3 bg-primary/5 p-4 rounded-lg border border-primary/10">
            <h4 className="font-semibold text-sm">Selected Services</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {selectedServices.map((service) => (
                <div
                  key={service.serviceId}
                  className="flex items-center justify-between text-sm p-2 bg-background rounded border border-border"
                >
                  <div className="flex-1">
                    <p className="font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty: {service.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">
                      {formatCurrency(
                        convertPrice(service.price * service.quantity),
                        displayCurrency,
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onServiceRemove(service.serviceId)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-primary/10 flex justify-between text-sm font-semibold">
              <span>Subtotal</span>
              <span>{formatCurrency(totalServiceCost, displayCurrency)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
