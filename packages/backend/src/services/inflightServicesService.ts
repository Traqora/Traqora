/**
 * In-flight Services Management Service
 * Handles meals, WiFi, baggage, and entertainment services
 */

import { AppDataSource } from "../db/dataSource";
import { Booking } from "../db/entities/Booking";
import { logger } from "../utils/logger";
import { BadRequestError, NotFoundError } from "../utils/errors";
import type {
  MealService,
  WiFiService,
  BaggageService,
  EntertainmentService,
  MealOrder,
  WiFiOrder,
  BaggageOrder,
  EntertainmentOrder,
  InflightServiceOrder,
  ServicePricingBreakdown,
  ServicesCatalog,
  SeatType,
  ServiceDelivery,
} from "../types/services";

/**
 * Service catalog with predefined offerings
 * In production, these would be fetched from a service inventory database
 */
const MEAL_CATALOG: Record<string, MealService> = {
  VEGAN_SANDWICH: {
    id: "meal_vegan_001",
    code: "VSAN",
    name: "Vegan Sandwich",
    description: "Organic vegetables, plant-based protein, whole grain bread",
    price: 1200, // $12.00
    dietaryRestrictions: ["vegan", "gluten_free"],
    availableClasses: ["economy", "premium_economy", "business", "first"],
    servingTime: "lunch",
    calories: 350,
    spiceLevel: "mild",
  },
  GRILLED_CHICKEN: {
    id: "meal_chicken_001",
    code: "GRCH",
    name: "Grilled Chicken Meal",
    description: "Herb-grilled chicken breast with seasonal vegetables",
    price: 1500, // $15.00
    dietaryRestrictions: [],
    availableClasses: ["economy", "premium_economy", "business", "first"],
    servingTime: "lunch",
    calories: 450,
    spiceLevel: "mild",
  },
  BEEF_TENDERLOIN: {
    id: "meal_beef_001",
    code: "BTND",
    name: "Beef Tenderloin",
    description: "Premium beef tenderloin with truffle sauce and sides",
    price: 2500, // $25.00
    dietaryRestrictions: [],
    availableClasses: ["business", "first"],
    servingTime: "dinner",
    calories: 650,
    spiceLevel: "mild",
  },
  HALAL_LAMB: {
    id: "meal_halal_001",
    code: "HLAL",
    name: "Halal Lamb Kebab",
    description: "Certified halal lamb kebab with rice and yogurt sauce",
    price: 1800, // $18.00
    dietaryRestrictions: ["halal"],
    availableClasses: ["premium_economy", "business", "first"],
    servingTime: "lunch",
    calories: 520,
    spiceLevel: "medium",
  },
};

const WIFI_CATALOG: Record<string, WiFiService> = {
  HOURLY_PASS: {
    id: "wifi_hourly_001",
    code: "WIFH",
    name: "1-Hour WiFi Pass",
    description: "High-speed internet access for 1 hour",
    packageType: "hourly",
    price: 700, // $7.00
    speedMbps: 25,
    deviceLimit: 1,
    availableClasses: ["economy", "premium_economy", "business", "first"],
  },
  DAILY_PASS: {
    id: "wifi_daily_001",
    code: "WIFD",
    name: "Full-Flight WiFi Pass",
    description: "Unlimited internet for the entire flight",
    packageType: "fullFlight",
    price: 1200, // $12.00
    speedMbps: 50,
    deviceLimit: 2,
    availableClasses: ["economy", "premium_economy", "business", "first"],
  },
  PREMIUM_WIFI: {
    id: "wifi_premium_001",
    code: "WIFP",
    name: "Premium WiFi (Priority Speed)",
    description: "Premium WiFi with priority bandwidth and video streaming",
    packageType: "fullFlight",
    price: 1800, // $18.00
    speedMbps: 100,
    deviceLimit: 4,
    availableClasses: ["business", "first"],
  },
};

const BAGGAGE_CATALOG: Record<string, BaggageService> = {
  STANDARD_BAG: {
    id: "bag_standard_001",
    code: "BSTD",
    name: "Additional Checked Baggage",
    description: "Standard checked baggage (23 kg / 50 lbs)",
    baggageType: "standard",
    price: 3500, // $35.00 per piece
    maxWeightKg: 23,
    dimensions: { lengthCm: 62, widthCm: 45, heightCm: 28 },
    allowedClasses: ["economy", "premium_economy", "business", "first"],
    quantity: 1,
  },
  OVERSIZED_BAG: {
    id: "bag_oversized_001",
    code: "BOZS",
    name: "Oversized Baggage",
    description:
      "Oversized baggage for sporting equipment or large items (up to 32 kg)",
    baggageType: "oversized",
    price: 7500, // $75.00 per piece
    maxWeightKg: 32,
    dimensions: { lengthCm: 80, widthCm: 60, heightCm: 40 },
    allowedClasses: ["economy", "premium_economy", "business", "first"],
    quantity: 1,
  },
  SPORTS_EQUIPMENT: {
    id: "bag_sports_001",
    code: "BSPT",
    name: "Sports Equipment Bag",
    description: "Protected sports equipment bag (golf clubs, skis, etc.)",
    baggageType: "sports_equipment",
    price: 15000, // $150.00 per piece
    maxWeightKg: 32,
    allowedClasses: ["economy", "premium_economy", "business", "first"],
    quantity: 1,
  },
};

const ENTERTAINMENT_CATALOG: Record<string, EntertainmentService> = {
  MOVIE_BUNDLE: {
    id: "ent_movie_001",
    code: "EMOV",
    name: "Movie Bundle",
    description: "Access to 50+ movies and TV shows",
    price: 500, // $5.00
    category: "movie",
    availableClasses: ["economy", "premium_economy", "business", "first"],
    duration: 0, // All flight
  },
  MUSIC_STREAMING: {
    id: "ent_music_001",
    code: "EMUS",
    name: "Music Streaming",
    description: "Ad-free music streaming during flight",
    price: 300, // $3.00
    category: "music",
    availableClasses: ["economy", "premium_economy", "business", "first"],
    duration: 0,
  },
  GAMING_PASS: {
    id: "ent_games_001",
    code: "EGAM",
    name: "Gaming Pass",
    description: "Play 100+ games on in-flight entertainment system",
    price: 400, // $4.00
    category: "games",
    availableClasses: ["economy", "premium_economy", "business", "first"],
    duration: 0,
  },
};

export class InflightServicesService {
  /**
   * Get full service catalog for a booking
   */
  async getServicesCatalog(cabinClass: SeatType): Promise<ServicesCatalog> {
    // Filter catalog by availability for cabin class
    const meals = Object.values(MEAL_CATALOG).filter((m) =>
      m.availableClasses.includes(cabinClass),
    );
    const wifi = Object.values(WIFI_CATALOG).filter((w) =>
      w.availableClasses.includes(cabinClass),
    );
    const baggage = Object.values(BAGGAGE_CATALOG).filter((b) =>
      b.allowedClasses.includes(cabinClass),
    );
    const entertainment = Object.values(ENTERTAINMENT_CATALOG).filter((e) =>
      e.availableClasses.includes(cabinClass),
    );

    return {
      meals,
      wifi,
      baggage,
      entertainment,
      timestamp: new Date(),
    };
  }

  /**
   * Add meals to a booking
   */
  async addMeals(
    bookingId: string,
    meals: Array<{
      mealId: string;
      dietary?: string;
      quantity: number;
      specialInstructions?: string;
    }>,
  ): Promise<MealOrder[]> {
    const booking = await this.getBooking(bookingId);

    const mealOrders: MealOrder[] = meals.map((m) => ({
      mealId: m.mealId,
      dietary: m.dietary as any,
      quantity: m.quantity,
      specialInstructions: m.specialInstructions,
      addedAt: new Date(),
    }));

    const metadata = (booking as any).metadata ?? {};
    if (!metadata.inflightServices) {
      metadata.inflightServices = {};
    }
    if (!metadata.inflightServices.meals) {
      metadata.inflightServices.meals = [];
    }

    metadata.inflightServices.meals.push(...mealOrders);
    (booking as any).metadata = metadata;

    await AppDataSource.getRepository(Booking).save(booking);
    logger.info("Meals added to booking", {
      bookingId,
      count: mealOrders.length,
    });

    return mealOrders;
  }

  /**
   * Add WiFi service to a booking
   */
  async addWiFi(
    bookingId: string,
    wifi: Array<{ wifiId: string; packageType: string; quantity: number }>,
  ): Promise<WiFiOrder[]> {
    const booking = await this.getBooking(bookingId);

    const wifiOrders: WiFiOrder[] = wifi.map((w) => ({
      wifiId: w.wifiId,
      packageType: w.packageType as any,
      quantity: w.quantity,
      addedAt: new Date(),
    }));

    const metadata = (booking as any).metadata ?? {};
    if (!metadata.inflightServices) {
      metadata.inflightServices = {};
    }
    if (!metadata.inflightServices.wifi) {
      metadata.inflightServices.wifi = [];
    }

    metadata.inflightServices.wifi.push(...wifiOrders);
    (booking as any).metadata = metadata;

    await AppDataSource.getRepository(Booking).save(booking);
    logger.info("WiFi added to booking", {
      bookingId,
      count: wifiOrders.length,
    });

    return wifiOrders;
  }

  /**
   * Add baggage service to a booking
   */
  async addBaggage(
    bookingId: string,
    baggage: Array<{ baggageId: string; pieces: number; baggageType: string }>,
  ): Promise<BaggageOrder[]> {
    const booking = await this.getBooking(bookingId);

    const baggageOrders: BaggageOrder[] = baggage.map((b) => ({
      baggageId: b.baggageId,
      pieces: b.pieces,
      baggageType: b.baggageType as any,
      addedAt: new Date(),
    }));

    const metadata = (booking as any).metadata ?? {};
    if (!metadata.inflightServices) {
      metadata.inflightServices = {};
    }
    if (!metadata.inflightServices.baggage) {
      metadata.inflightServices.baggage = [];
    }

    metadata.inflightServices.baggage.push(...baggageOrders);
    (booking as any).metadata = metadata;

    await AppDataSource.getRepository(Booking).save(booking);
    logger.info("Baggage added to booking", {
      bookingId,
      count: baggageOrders.length,
    });

    return baggageOrders;
  }

  /**
   * Add entertainment service to a booking
   */
  async addEntertainment(
    bookingId: string,
    entertainment: Array<{ entertainmentId: string; quantity: number }>,
  ): Promise<EntertainmentOrder[]> {
    const booking = await this.getBooking(bookingId);

    const entertainmentOrders: EntertainmentOrder[] = entertainment.map(
      (e) => ({
        entertainmentId: e.entertainmentId,
        quantity: e.quantity,
        addedAt: new Date(),
      }),
    );

    const metadata = (booking as any).metadata ?? {};
    if (!metadata.inflightServices) {
      metadata.inflightServices = {};
    }
    if (!metadata.inflightServices.entertainment) {
      metadata.inflightServices.entertainment = [];
    }

    metadata.inflightServices.entertainment.push(...entertainmentOrders);
    (booking as any).metadata = metadata;

    await AppDataSource.getRepository(Booking).save(booking);
    logger.info("Entertainment added to booking", {
      bookingId,
      count: entertainmentOrders.length,
    });

    return entertainmentOrders;
  }

  /**
   * Calculate service pricing
   */
  calculateServicePricing(
    services: Partial<InflightServiceOrder>,
    currency: string = "USD",
  ): ServicePricingBreakdown {
    let seatPrice = 0;
    let mealPrice = 0;
    let wifiPrice = 0;
    let baggagePrice = 0;
    let entertainmentPrice = 0;

    // Seat pricing
    if (services.seat) {
      seatPrice = services.seat.price;
    }

    // Meal pricing
    if (services.meals) {
      mealPrice = services.meals.reduce((total, meal) => {
        const mealService =
          MEAL_CATALOG[meal.mealId] ||
          Object.values(MEAL_CATALOG).find((m) => m.id === meal.mealId);
        return total + (mealService?.price || 0) * meal.quantity;
      }, 0);
    }

    // WiFi pricing
    if (services.wifi) {
      wifiPrice = services.wifi.reduce((total, wifi) => {
        const wifiService =
          WIFI_CATALOG[wifi.wifiId] ||
          Object.values(WIFI_CATALOG).find((w) => w.id === wifi.wifiId);
        return total + (wifiService?.price || 0) * wifi.quantity;
      }, 0);
    }

    // Baggage pricing
    if (services.baggage) {
      baggagePrice = services.baggage.reduce((total, bag) => {
        const baggageService =
          BAGGAGE_CATALOG[bag.baggageId] ||
          Object.values(BAGGAGE_CATALOG).find((b) => b.id === bag.baggageId);
        return total + (baggageService?.price || 0) * bag.pieces;
      }, 0);
    }

    // Entertainment pricing
    if (services.entertainment) {
      entertainmentPrice = services.entertainment.reduce((total, ent) => {
        const entertainmentService =
          ENTERTAINMENT_CATALOG[ent.entertainmentId] ||
          Object.values(ENTERTAINMENT_CATALOG).find(
            (e) => e.id === ent.entertainmentId,
          );
        return total + (entertainmentService?.price || 0) * ent.quantity;
      }, 0);
    }

    const totalServicesCents =
      seatPrice + mealPrice + wifiPrice + baggagePrice + entertainmentPrice;
    const taxesCents = Math.round(totalServicesCents * 0.08); // 8% tax
    const totalCents = totalServicesCents + taxesCents;

    const breakdown = [
      ...(seatPrice > 0
        ? [
            {
              label: "Seat Selection",
              amount: seatPrice,
              description: "Premium seat upgrade",
            },
          ]
        : []),
      ...(mealPrice > 0
        ? [
            {
              label: "Meals",
              amount: mealPrice,
              description: "In-flight meals",
            },
          ]
        : []),
      ...(wifiPrice > 0
        ? [
            {
              label: "WiFi",
              amount: wifiPrice,
              description: "Internet connectivity",
            },
          ]
        : []),
      ...(baggagePrice > 0
        ? [
            {
              label: "Baggage",
              amount: baggagePrice,
              description: "Additional baggage",
            },
          ]
        : []),
      ...(entertainmentPrice > 0
        ? [
            {
              label: "Entertainment",
              amount: entertainmentPrice,
              description: "Entertainment access",
            },
          ]
        : []),
      ...(taxesCents > 0
        ? [
            {
              label: "Taxes & Fees",
              amount: taxesCents,
              description: "8% service tax",
            },
          ]
        : []),
    ];

    return {
      seatPrice,
      mealPrice,
      wifiPrice,
      baggagePrice,
      entertainmentPrice,
      totalServicesCents,
      subtotalWithBasesCents: totalServicesCents,
      taxesCents,
      totalCents,
      currency,
      breakdown,
    };
  }

  /**
   * Get all services for a booking
   */
  async getBookingServices(bookingId: string): Promise<InflightServiceOrder> {
    const booking = await this.getBooking(bookingId);
    const metadata = (booking as any).metadata ?? {};

    return {
      bookingId,
      seat: metadata.seatNumber
        ? {
            seatNumber: metadata.seatNumber,
            seatType: "economy",
            price: 0,
            selectedAt: new Date(),
          }
        : undefined,
      meals: metadata.inflightServices?.meals || [],
      wifi: metadata.inflightServices?.wifi || [],
      baggage: metadata.inflightServices?.baggage || [],
      entertainment: metadata.inflightServices?.entertainment || [],
      totalServicesCents: 0,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  /**
   * Remove a service from a booking
   */
  async removeService(
    bookingId: string,
    serviceType: string,
    serviceId: string,
  ): Promise<void> {
    const booking = await this.getBooking(bookingId);
    const metadata = (booking as any).metadata ?? {};

    if (!metadata.inflightServices) {
      throw new BadRequestError("No services found for booking");
    }

    switch (serviceType) {
      case "meal":
        metadata.inflightServices.meals = (
          metadata.inflightServices.meals || []
        ).filter((m: any) => m.mealId !== serviceId);
        break;
      case "wifi":
        metadata.inflightServices.wifi = (
          metadata.inflightServices.wifi || []
        ).filter((w: any) => w.wifiId !== serviceId);
        break;
      case "baggage":
        metadata.inflightServices.baggage = (
          metadata.inflightServices.baggage || []
        ).filter((b: any) => b.baggageId !== serviceId);
        break;
      case "entertainment":
        metadata.inflightServices.entertainment = (
          metadata.inflightServices.entertainment || []
        ).filter((e: any) => e.entertainmentId !== serviceId);
        break;
      default:
        throw new BadRequestError(`Unknown service type: ${serviceType}`);
    }

    (booking as any).metadata = metadata;
    await AppDataSource.getRepository(Booking).save(booking);
    logger.info("Service removed from booking", {
      bookingId,
      serviceType,
      serviceId,
    });
  }

  /**
   * Helper: Get booking or throw
   */
  private async getBooking(bookingId: string): Promise<Booking> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }
    return booking;
  }
}

export const inflightServicesService = new InflightServicesService();
