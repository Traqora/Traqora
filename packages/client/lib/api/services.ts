/**
 * Client-side API functions for booking services
 */

import { CurrencyCode } from "./currency";

export interface SeatAvailability {
  flightId: string;
  totalSeats: number;
  occupiedSeats: number;
  availableSeats: number;
  seatMap: Record<
    number,
    Record<
      string,
      {
        available: boolean;
        type: string;
        price: number;
        locked?: { until: Date; by: string };
      }
    >
  >;
  timestamp: Date;
}

export interface ServicesCatalog {
  meals: MealService[];
  wifi: WiFiService[];
  baggage: BaggageService[];
  entertainment: EntertainmentService[];
  timestamp: Date;
}

export interface MealService {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  dietaryRestrictions: string[];
  availableClasses: string[];
  servingTime: string;
  calories?: number;
  allergens?: string[];
  spiceLevel?: string;
}

export interface WiFiService {
  id: string;
  code: string;
  name: string;
  description: string;
  packageType: string;
  price: number;
  speedMbps: number;
  deviceLimit: number;
  availableClasses: string[];
}

export interface BaggageService {
  id: string;
  code: string;
  name: string;
  description: string;
  baggageType: string;
  price: number;
  maxWeightKg: number;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  allowedClasses: string[];
  quantity: number;
}

export interface EntertainmentService {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  category: string;
  availableClasses: string[];
  duration?: number;
}

export interface ServicePricingBreakdown {
  seatPrice: number;
  mealPrice: number;
  wifiPrice: number;
  baggagePrice: number;
  entertainmentPrice: number;
  totalServicesCents: number;
  subtotalWithBasesCents: number;
  taxesCents: number;
  totalCents: number;
  currency: string;
  breakdown: Array<{
    label: string;
    amount: number;
    description: string;
  }>;
}

// Seat Management
export async function getSeatAvailability(
  flightId: string,
  cabinClass?: string,
): Promise<SeatAvailability> {
  const params = new URLSearchParams();
  if (cabinClass) params.append("cabinClass", cabinClass);

  const res = await fetch(`/api/services/seats/${flightId}?${params}`);
  if (!res.ok) throw new Error("Failed to fetch seat availability");
  return res.json();
}

export async function getAvailableSeats(
  flightId: string,
  cabinClass: string,
): Promise<Array<{ seatNumber: string; price: number }>> {
  const res = await fetch(
    `/api/services/seats/${flightId}/available?cabinClass=${cabinClass}`,
  );
  if (!res.ok) throw new Error("Failed to fetch available seats");
  const data = await res.json();
  return data.availableSeats;
}

export async function lockSeat(
  flightId: string,
  seatNumber: string,
  bookingId: string,
): Promise<void> {
  const res = await fetch("/api/services/seat/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flightId, seatNumber, bookingId }),
  });
  if (!res.ok) throw new Error("Failed to lock seat");
}

export async function unlockSeat(
  flightId: string,
  seatNumber: string,
  bookingId: string,
): Promise<void> {
  const res = await fetch("/api/services/seat/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flightId, seatNumber, bookingId }),
  });
  if (!res.ok) throw new Error("Failed to unlock seat");
}

export async function selectSeat(
  bookingId: string,
  seatNumber: string,
  preference?: string,
): Promise<void> {
  const res = await fetch("/api/services/seat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, seatNumber, preference }),
  });
  if (!res.ok) throw new Error("Failed to select seat");
}

// Services Catalog
export async function getServicesCatalog(
  cabinClass: string,
): Promise<ServicesCatalog> {
  const res = await fetch(`/api/services/catalog?cabinClass=${cabinClass}`);
  if (!res.ok) throw new Error("Failed to fetch services catalog");
  return res.json();
}

// Meals
export async function addMeals(
  bookingId: string,
  meals: Array<{
    mealId: string;
    dietary?: string;
    quantity: number;
    specialInstructions?: string;
  }>,
): Promise<void> {
  const res = await fetch("/api/services/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, meals }),
  });
  if (!res.ok) throw new Error("Failed to add meals");
}

// WiFi
export async function addWiFi(
  bookingId: string,
  wifi: Array<{
    wifiId: string;
    packageType: string;
    quantity: number;
  }>,
): Promise<void> {
  const res = await fetch("/api/services/wifi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, wifi }),
  });
  if (!res.ok) throw new Error("Failed to add WiFi");
}

// Baggage
export async function addBaggage(
  bookingId: string,
  baggage: Array<{
    baggageId: string;
    pieces: number;
    baggageType: string;
  }>,
): Promise<void> {
  const res = await fetch("/api/services/baggage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, baggage }),
  });
  if (!res.ok) throw new Error("Failed to add baggage");
}

// Entertainment
export async function addEntertainment(
  bookingId: string,
  entertainment: Array<{
    entertainmentId: string;
    quantity: number;
  }>,
): Promise<void> {
  const res = await fetch("/api/services/entertainment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, entertainment }),
  });
  if (!res.ok) throw new Error("Failed to add entertainment");
}

// Get all services for booking
export async function getBookingServices(bookingId: string): Promise<any> {
  const res = await fetch(`/api/services/inflight/${bookingId}`);
  if (!res.ok) throw new Error("Failed to fetch booking services");
  return res.json();
}

// Pricing
export async function calculateServicePricing(
  bookingId: string,
): Promise<ServicePricingBreakdown> {
  const res = await fetch("/api/services/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId }),
  });
  if (!res.ok) throw new Error("Failed to calculate pricing");
  return res.json();
}

// Remove service
export async function removeService(
  bookingId: string,
  serviceType: string,
  serviceId: string,
): Promise<void> {
  const res = await fetch(
    `/api/services/${bookingId}/${serviceType}/${serviceId}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) throw new Error("Failed to remove service");
}
