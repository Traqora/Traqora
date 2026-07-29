/**
 * Unit tests for In-flight Services Service
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { InflightServicesService } from "./inflightServicesService";
import type { InflightServiceOrder } from "../types/services";

describe("InflightServicesService", () => {
  let service: InflightServicesService;

  beforeAll(() => {
    service = new InflightServicesService();
  });

  describe("getServicesCatalog", () => {
    it("should return filtered catalog for economy class", async () => {
      const catalog = await service.getServicesCatalog("economy");
      expect(catalog).toBeDefined();
      expect(catalog.meals).toBeDefined();
      expect(catalog.wifi).toBeDefined();
      expect(catalog.baggage).toBeDefined();
      expect(catalog.entertainment).toBeDefined();
      expect(catalog.meals.length).toBeGreaterThan(0);
    });

    it("should return filtered catalog for first class", async () => {
      const catalog = await service.getServicesCatalog("first");
      expect(catalog.meals.length).toBeGreaterThan(0);
      // First class should have premium meals
      expect(
        catalog.meals.some((m) => m.name.includes("Tenderloin")),
      ).toBeTruthy();
    });

    it("should have correct timestamp", async () => {
      const catalog = await service.getServicesCatalog("business");
      expect(catalog.timestamp).toBeInstanceOf(Date);
      expect(catalog.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("calculateServicePricing", () => {
    it("should calculate meal pricing correctly", () => {
      const services: Partial<InflightServiceOrder> = {
        meals: [
          {
            mealId: "meal_chicken_001",
            quantity: 2,
            dietary: undefined,
            addedAt: new Date(),
          },
        ],
      };

      const pricing = service.calculateServicePricing(services);

      expect(pricing.mealPrice).toBe(1500 * 2); // $15 per meal
      expect(pricing.totalServicesCents).toBe(pricing.mealPrice);
      expect(pricing.taxesCents).toBe(Math.round(pricing.mealPrice * 0.08));
    });

    it("should include taxes in total", () => {
      const services: Partial<InflightServiceOrder> = {
        meals: [
          {
            mealId: "meal_chicken_001",
            quantity: 1,
            dietary: undefined,
            addedAt: new Date(),
          },
        ],
        wifi: [
          {
            wifiId: "wifi_daily_001",
            packageType: "fullFlight",
            quantity: 1,
            addedAt: new Date(),
          },
        ],
      };

      const pricing = service.calculateServicePricing(services);

      const subtotal = pricing.mealPrice + pricing.wifiPrice;
      expect(pricing.taxesCents).toBe(Math.round(subtotal * 0.08));
      expect(pricing.totalCents).toBe(subtotal + pricing.taxesCents);
    });

    it("should return breakdown array", () => {
      const services: Partial<InflightServiceOrder> = {
        meals: [
          {
            mealId: "meal_chicken_001",
            quantity: 1,
            dietary: undefined,
            addedAt: new Date(),
          },
        ],
      };

      const pricing = service.calculateServicePricing(services);

      expect(pricing.breakdown.length).toBeGreaterThan(0);
      expect(pricing.breakdown[0]).toHaveProperty("label");
      expect(pricing.breakdown[0]).toHaveProperty("amount");
      expect(pricing.breakdown[0]).toHaveProperty("description");
    });

    it("should handle empty services", () => {
      const services: Partial<InflightServiceOrder> = {};
      const pricing = service.calculateServicePricing(services);

      expect(pricing.totalServicesCents).toBe(0);
      expect(pricing.taxesCents).toBe(0);
      expect(pricing.totalCents).toBe(0);
    });
  });

  describe("getServicesCatalog with cabin classes", () => {
    it("should filter meals by cabin class availability", async () => {
      const economyCatalog = await service.getServicesCatalog("economy");
      const businessCatalog = await service.getServicesCatalog("business");

      // Business meals should include premium options
      expect(businessCatalog.meals.length).toBeGreaterThanOrEqual(
        economyCatalog.meals.length,
      );
    });

    it("should include all service types in catalog", async () => {
      const catalog = await service.getServicesCatalog("business");

      expect(catalog.meals.length).toBeGreaterThan(0);
      expect(catalog.wifi.length).toBeGreaterThan(0);
      expect(catalog.baggage.length).toBeGreaterThan(0);
      expect(catalog.entertainment.length).toBeGreaterThan(0);
    });
  });

  describe("service properties", () => {
    it("meals should have dietary restrictions", async () => {
      const catalog = await service.getServicesCatalog("economy");
      const meal = catalog.meals[0];

      expect(meal).toHaveProperty("id");
      expect(meal).toHaveProperty("code");
      expect(meal).toHaveProperty("name");
      expect(meal).toHaveProperty("price");
      expect(Array.isArray(meal.dietaryRestrictions)).toBeTruthy();
    });

    it("wifi should have speed specifications", async () => {
      const catalog = await service.getServicesCatalog("economy");
      const wifi = catalog.wifi[0];

      expect(wifi).toHaveProperty("speedMbps");
      expect(wifi).toHaveProperty("deviceLimit");
      expect(wifi.speedMbps).toBeGreaterThan(0);
      expect(wifi.deviceLimit).toBeGreaterThan(0);
    });

    it("baggage should have weight and dimensions", async () => {
      const catalog = await service.getServicesCatalog("economy");
      const baggage = catalog.baggage[0];

      expect(baggage).toHaveProperty("maxWeightKg");
      expect(baggage.maxWeightKg).toBeGreaterThan(0);
    });

    it("entertainment should have category", async () => {
      const catalog = await service.getServicesCatalog("economy");
      const ent = catalog.entertainment[0];

      expect(ent).toHaveProperty("category");
      expect(["movie", "music", "games", "sports", "documentary"]).toContain(
        ent.category,
      );
    });
  });
});
