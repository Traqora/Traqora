"use client";

import { useCallback, useState } from "react";
import { MealSelector } from "./meal-selector";
import { ServicesSelector } from "./services-selector";
import type {
  MealService,
  WiFiService,
  BaggageService,
  EntertainmentService,
} from "@/lib/api/services";

interface ServiceIntegrationProps {
  bookingId: string;
  flightId: string;
  cabinClass: string;
  displayCurrency?: string;
  rates?: Record<string, number>;
  onServicesUpdated?: (totalCents: number) => void;
}

interface SelectedMeal {
  mealId: string;
  name: string;
  dietary?: string;
  quantity: number;
  price: number;
  specialInstructions?: string;
}

interface SelectedService {
  serviceId: string;
  name: string;
  type: "wifi" | "baggage" | "entertainment";
  quantity: number;
  price: number;
}

export function ServicesIntegration({
  bookingId,
  flightId,
  cabinClass,
  displayCurrency = "USD",
  rates,
  onServicesUpdated,
}: ServiceIntegrationProps) {
  const [selectedMeals, setSelectedMeals] = useState<SelectedMeal[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<{
    meals: MealService[];
    wifi: WiFiService[];
    baggage: BaggageService[];
    entertainment: EntertainmentService[];
  } | null>(null);

  // Fetch catalog on mount
  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/services/catalog?cabinClass=${cabinClass}`);
      if (res.ok) {
        setCatalog(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch catalog:", error);
    } finally {
      setLoading(false);
    }
  }, [cabinClass]);

  const handleAddMeal = useCallback(
    async (meal: SelectedMeal) => {
      try {
        setLoading(true);
        await fetch("/api/services/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId,
            meals: [
              {
                mealId: meal.mealId,
                dietary: meal.dietary,
                quantity: meal.quantity,
                specialInstructions: meal.specialInstructions,
              },
            ],
          }),
        });

        setSelectedMeals([...selectedMeals, meal]);
        const totalCents =
          selectedMeals.reduce((sum, m) => sum + m.price * m.quantity, 0) +
          meal.price * meal.quantity;
        onServicesUpdated?.(totalCents);
      } catch (error) {
        console.error("Failed to add meal:", error);
      } finally {
        setLoading(false);
      }
    },
    [bookingId, selectedMeals, onServicesUpdated],
  );

  const handleRemoveMeal = useCallback(
    (mealId: string) => {
      const updated = selectedMeals.filter((m) => m.mealId !== mealId);
      setSelectedMeals(updated);
      const totalCents = updated.reduce(
        (sum, m) => sum + m.price * m.quantity,
        0,
      );
      onServicesUpdated?.(totalCents);
    },
    [selectedMeals, onServicesUpdated],
  );

  const handleAddService = useCallback(
    async (service: SelectedService) => {
      try {
        setLoading(true);

        if (service.type === "wifi") {
          await fetch("/api/services/wifi", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              wifi: [
                {
                  wifiId: service.serviceId,
                  packageType: "fullFlight",
                  quantity: service.quantity,
                },
              ],
            }),
          });
        } else if (service.type === "baggage") {
          await fetch("/api/services/baggage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              baggage: [
                {
                  baggageId: service.serviceId,
                  pieces: service.quantity,
                  baggageType: "standard",
                },
              ],
            }),
          });
        } else if (service.type === "entertainment") {
          await fetch("/api/services/entertainment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              entertainment: [
                {
                  entertainmentId: service.serviceId,
                  quantity: service.quantity,
                },
              ],
            }),
          });
        }

        setSelectedServices([...selectedServices, service]);
        const totalCents =
          selectedServices.reduce((sum, s) => sum + s.price * s.quantity, 0) +
          service.price * service.quantity;
        onServicesUpdated?.(totalCents);
      } catch (error) {
        console.error("Failed to add service:", error);
      } finally {
        setLoading(false);
      }
    },
    [bookingId, selectedServices, onServicesUpdated],
  );

  const handleRemoveService = useCallback(
    (serviceId: string) => {
      const updated = selectedServices.filter((s) => s.serviceId !== serviceId);
      setSelectedServices(updated);
      const totalCents = updated.reduce(
        (sum, s) => sum + s.price * s.quantity,
        0,
      );
      onServicesUpdated?.(totalCents);
    },
    [selectedServices, onServicesUpdated],
  );

  if (!catalog) {
    fetchCatalog();
  }

  if (loading || !catalog) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading services...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <MealSelector
        meals={catalog.meals}
        selectedMeals={selectedMeals}
        onMealAdd={handleAddMeal}
        onMealRemove={handleRemoveMeal}
        displayCurrency={displayCurrency as any}
        rates={rates}
      />

      <ServicesSelector
        wifiServices={catalog.wifi.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          price: w.price,
          type: "wifi" as const,
        }))}
        baggageServices={catalog.baggage.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          price: b.price,
          type: "baggage" as const,
        }))}
        entertainmentServices={catalog.entertainment.map((e) => ({
          id: e.id,
          name: e.name,
          description: e.description,
          price: e.price,
          type: "entertainment" as const,
        }))}
        selectedServices={selectedServices}
        onServiceAdd={handleAddService}
        onServiceRemove={handleRemoveService}
        displayCurrency={displayCurrency as any}
        rates={rates}
      />
    </div>
  );
}
