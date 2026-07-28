/**
 * Central export file for Traqora backend services
 * Exposes all public APIs and services
 */

// Services
export { BookingOrchestrationService } from "./services/bookingOrchestrationService";
export { FareRulesService } from "./services/fareRulesService";
export {
  InflightServicesService,
  inflightServicesService,
} from "./services/inflightServicesService";
export {
  SeatAvailabilityService,
  seatAvailabilityService,
} from "./services/seatAvailabilityService";

// Types
export type {
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
  SeatAvailability,
  ServiceDelivery,
  SeatSelection,
  SeatType,
  SeatPreference,
  DietaryRestriction,
  WiFiPackage,
  BaggageType,
} from "./types/services";

// Entities
export { Booking } from "./db/entities/Booking";
export { Flight } from "./db/entities/Flight";
export { Passenger } from "./db/entities/Passenger";
export { TravelDocument } from "./db/entities/TravelDocument";

// Utilities
export { AppDataSource } from "./db/dataSource";
export { logger } from "./utils/logger";
export { asyncHandler } from "./utils/errorHandler";
export { BadRequestError, NotFoundError } from "./utils/errors";
