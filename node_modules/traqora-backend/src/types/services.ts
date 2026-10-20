/**
 * In-flight Services Type Definitions
 * Covers seat selection, meals, WiFi, baggage, and entertainment
 */

export type SeatType = "economy" | "premium_economy" | "business" | "first";
export type SeatPreference =
  | "window"
  | "aisle"
  | "middle"
  | "extra_legroom"
  | null;

export interface SeatSelection {
  seatNumber: string; // Format: "12A"
  seatType: SeatType;
  price: number; // in cents
  preference?: SeatPreference;
  selectedAt: Date;
}

// Meal Service Types
export type DietaryRestriction =
  | "vegetarian"
  | "vegan"
  | "halal"
  | "kosher"
  | "gluten_free"
  | "dairy_free"
  | "nut_free"
  | "low_sodium"
  | "diabetic";

export interface MealService {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number; // in cents
  dietaryRestrictions: DietaryRestriction[];
  availableClasses: SeatType[];
  servingTime: "breakfast" | "lunch" | "dinner" | "snack";
  calories?: number;
  allergens?: string[];
  spiceLevel?: "mild" | "medium" | "hot";
}

export interface MealOrder {
  mealId: string;
  dietary?: DietaryRestriction;
  quantity: number; // per passenger or group
  specialInstructions?: string;
  addedAt: Date;
}

// WiFi Service Types
export type WiFiPackage = "hourly" | "daily" | "monthly" | "fullFlight";

export interface WiFiService {
  id: string;
  code: string;
  name: string;
  description: string;
  packageType: WiFiPackage;
  price: number; // in cents
  speedMbps: number;
  deviceLimit: number; // devices per pass
  availableClasses: SeatType[];
}

export interface WiFiOrder {
  wifiId: string;
  packageType: WiFiPackage;
  quantity: number; // passes
  addedAt: Date;
}

// Baggage Service Types
export type BaggageType =
  | "standard"
  | "oversized"
  | "sports_equipment"
  | "fragile";

export interface BaggageService {
  id: string;
  code: string;
  name: string;
  description: string;
  baggageType: BaggageType;
  price: number; // in cents per piece
  maxWeightKg: number;
  dimensions?: {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
  allowedClasses: SeatType[];
  quantity: number; // included pieces per booking
}

export interface BaggageOrder {
  baggageId: string;
  pieces: number; // additional pieces beyond included
  baggageType: BaggageType;
  addedAt: Date;
}

// Entertainment Service Types
export interface EntertainmentService {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number; // in cents
  category: "movie" | "music" | "games" | "sports" | "documentary";
  availableClasses: SeatType[];
  duration?: number; // in minutes
}

export interface EntertainmentOrder {
  entertainmentId: string;
  quantity: number; // per passenger or access count
  addedAt: Date;
}

// Aggregate Service Orders
export interface InflightServiceOrder {
  bookingId: string;
  seat?: SeatSelection;
  meals: MealOrder[];
  wifi: WiFiOrder[];
  baggage: BaggageOrder[];
  entertainment: EntertainmentOrder[];
  totalServicesCents: number;
  createdAt: Date;
  updatedAt: Date;
}

// Service Pricing
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

// Service Catalog Response
export interface ServicesCatalog {
  meals: MealService[];
  wifi: WiFiService[];
  baggage: BaggageService[];
  entertainment: EntertainmentService[];
  timestamp: Date;
}

// Seat Availability Map
export interface SeatAvailability {
  flightId: string;
  totalSeats: number;
  occupiedSeats: number;
  availableSeats: number;
  seatMap: {
    [row: number]: {
      [seatLetter: string]: {
        available: boolean;
        type: SeatType;
        price: number;
        locked?: {
          until: Date;
          by: string; // booking ID
        };
      };
    };
  };
  timestamp: Date;
}

// Service Delivery & Fulfillment
export interface ServiceDelivery {
  bookingId: string;
  serviceType: "meal" | "wifi" | "baggage" | "entertainment";
  serviceId: string;
  status: "pending" | "confirmed" | "delivered" | "failed" | "refunded";
  deliveredAt?: Date;
  confirmationCode?: string;
  notes?: string;
}
