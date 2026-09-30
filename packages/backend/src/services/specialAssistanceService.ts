import { AppDataSource } from '../db/dataSource';
import { Passenger } from '../db/entities/Passenger';
import { Booking } from '../db/entities/Booking';
import { getLogger } from './logger';
import type { SpecialAssistanceRequest, AirlineNotification, WheelchairType, MedicalOxygenType, ServiceAnimalType, SpecialMealType } from '../types/specialAssistance';

const logger = getLogger({ component: 'special-assistance-service' });

function asWheelchairType(v: string): WheelchairType {
  const valid: WheelchairType[] = ['ramp', 'boarding', 'cabin', 'stretcher'];
  return valid.includes(v as WheelchairType) ? (v as WheelchairType) : 'ramp';
}

function asOxygenType(v: string): MedicalOxygenType {
  const valid: MedicalOxygenType[] = ['portable_concentrator', 'cylinder'];
  return valid.includes(v as MedicalOxygenType) ? (v as MedicalOxygenType) : 'portable_concentrator';
}

function asAnimalType(v: string): ServiceAnimalType {
  const valid: ServiceAnimalType[] = ['guide_dog', 'hearing_dog', 'emotional_support', 'psychiatric', 'other'];
  return valid.includes(v as ServiceAnimalType) ? (v as ServiceAnimalType) : 'guide_dog';
}

function asMealType(v: string): SpecialMealType {
  return v as SpecialMealType;
}

export function mapPassengerToRequest(passenger: Passenger): SpecialAssistanceRequest {
  const request: SpecialAssistanceRequest = {
    requiresWheelchair: false,
    requiresMedicalOxygen: false,
    specialMeal: false,
    hasServiceAnimal: false,
  };

  if (passenger.wheelchairType) {
    request.requiresWheelchair = true;
    request.wheelchair = { type: asWheelchairType(passenger.wheelchairType), notes: passenger.wheelchairNotes || undefined };
  }

  if (passenger.medicalOxygenType) {
    request.requiresMedicalOxygen = true;
    request.medicalOxygen = {
      type: asOxygenType(passenger.medicalOxygenType),
      flowRateLpm: passenger.oxygenFlowRateLpm || undefined,
      quantity: passenger.oxygenQuantity || undefined,
      notes: passenger.oxygenNotes || undefined,
    };
  }

  if (passenger.specialMealType) {
    request.specialMeal = true;
    request.meal = { mealType: asMealType(passenger.specialMealType), notes: passenger.specialMealNotes || undefined };
  }

  if (passenger.serviceAnimalType) {
    request.hasServiceAnimal = true;
    request.serviceAnimal = {
      animalType: asAnimalType(passenger.serviceAnimalType),
      breed: passenger.serviceAnimalBreed || undefined,
      weightKg: passenger.serviceAnimalWeightKg || undefined,
      notes: passenger.serviceAnimalNotes || undefined,
    };
  }

  if (
    passenger.priorityBoarding || passenger.extraLegroomPreferred ||
    passenger.bulkheadSeatRequired || passenger.aisleChairRequired ||
    passenger.deafOrHardOfHearing || passenger.blindOrLowVision ||
    passenger.cognitiveAssistance || passenger.accessibilityNotes
  ) {
    request.accessibilityNeeds = {
      priorityBoarding: passenger.priorityBoarding,
      extraLegroomPreferred: passenger.extraLegroomPreferred,
      bulkheadSeatRequired: passenger.bulkheadSeatRequired,
      aisleChairRequired: passenger.aisleChairRequired,
      deafOrHardOfHearing: passenger.deafOrHardOfHearing,
      blindOrLowVision: passenger.blindOrLowVision,
      cognitiveAssistance: passenger.cognitiveAssistance,
      notes: passenger.accessibilityNotes || undefined,
    };
  }

  request.otherNeeds = passenger.otherNeeds || undefined;

  return request;
}

export function applyRequestToPassenger(passenger: Passenger, request: SpecialAssistanceRequest): Passenger {
  passenger.requiresSpecialAssistance = !!(request.requiresWheelchair || request.requiresMedicalOxygen ||
    request.specialMeal || request.hasServiceAnimal || request.otherNeeds);

  if (request.requiresWheelchair && request.wheelchair) {
    passenger.wheelchairType = request.wheelchair.type;
    passenger.wheelchairNotes = request.wheelchair.notes || null;
  } else if (!request.requiresWheelchair) {
    passenger.wheelchairType = null;
    passenger.wheelchairNotes = null;
  }

  if (request.requiresMedicalOxygen && request.medicalOxygen) {
    passenger.medicalOxygenType = request.medicalOxygen.type;
    passenger.oxygenFlowRateLpm = request.medicalOxygen.flowRateLpm ?? null;
    passenger.oxygenQuantity = request.medicalOxygen.quantity ?? null;
    passenger.oxygenNotes = request.medicalOxygen.notes || null;
  } else if (!request.requiresMedicalOxygen) {
    passenger.medicalOxygenType = null;
    passenger.oxygenFlowRateLpm = null;
    passenger.oxygenQuantity = null;
    passenger.oxygenNotes = null;
  }

  if (request.specialMeal && request.meal) {
    passenger.specialMealType = request.meal.mealType;
    passenger.specialMealNotes = request.meal.notes || null;
  } else if (!request.specialMeal) {
    passenger.specialMealType = null;
    passenger.specialMealNotes = null;
  }

  if (request.hasServiceAnimal && request.serviceAnimal) {
    passenger.serviceAnimalType = request.serviceAnimal.animalType;
    passenger.serviceAnimalBreed = request.serviceAnimal.breed || null;
    passenger.serviceAnimalWeightKg = request.serviceAnimal.weightKg ?? null;
    passenger.serviceAnimalNotes = request.serviceAnimal.notes || null;
  } else if (!request.hasServiceAnimal) {
    passenger.serviceAnimalType = null;
    passenger.serviceAnimalBreed = null;
    passenger.serviceAnimalWeightKg = null;
    passenger.serviceAnimalNotes = null;
  }

  if (request.accessibilityNeeds) {
    passenger.priorityBoarding = request.accessibilityNeeds.priorityBoarding;
    passenger.extraLegroomPreferred = request.accessibilityNeeds.extraLegroomPreferred;
    passenger.bulkheadSeatRequired = request.accessibilityNeeds.bulkheadSeatRequired;
    passenger.aisleChairRequired = request.accessibilityNeeds.aisleChairRequired;
    passenger.deafOrHardOfHearing = request.accessibilityNeeds.deafOrHardOfHearing;
    passenger.blindOrLowVision = request.accessibilityNeeds.blindOrLowVision;
    passenger.cognitiveAssistance = request.accessibilityNeeds.cognitiveAssistance;
    passenger.accessibilityNotes = request.accessibilityNeeds.notes || null;
  } else {
    passenger.priorityBoarding = false;
    passenger.extraLegroomPreferred = false;
    passenger.bulkheadSeatRequired = false;
    passenger.aisleChairRequired = false;
    passenger.deafOrHardOfHearing = false;
    passenger.blindOrLowVision = false;
    passenger.cognitiveAssistance = false;
    passenger.accessibilityNotes = null;
  }

  passenger.otherNeeds = request.otherNeeds || null;

  return passenger;
}

export function determineAirlineNotificationCategories(request: SpecialAssistanceRequest): string[] {
  const categories: string[] = [];
  if (request.requiresWheelchair) categories.push('wheelchair');
  if (request.requiresMedicalOxygen) categories.push('medical_oxygen');
  if (request.specialMeal) categories.push('special_meal');
  if (request.hasServiceAnimal) categories.push('service_animal');
  if (request.accessibilityNeeds?.priorityBoarding) categories.push('priority_boarding');
  if (request.accessibilityNeeds?.aisleChairRequired) categories.push('aisle_chair');
  if (request.accessibilityNeeds?.deafOrHardOfHearing) categories.push('deaf_hard_of_hearing');
  if (request.accessibilityNeeds?.blindOrLowVision) categories.push('blind_low_vision');
  if (request.accessibilityNeeds?.cognitiveAssistance) categories.push('cognitive_assistance');
  if (request.otherNeeds) categories.push('other');
  return categories;
}

export function generateAirlineMessage(request: SpecialAssistanceRequest): string {
  const parts: string[] = [];
  if (request.requiresWheelchair) {
    parts.push(`Wheelchair: ${request.wheelchair?.type}`);
  }
  if (request.requiresMedicalOxygen) {
    parts.push(`Medical oxygen: ${request.medicalOxygen?.type}`);
  }
  if (request.specialMeal) {
    parts.push(`Meal: ${request.meal?.mealType}`);
  }
  if (request.hasServiceAnimal) {
    parts.push(`Service animal: ${request.serviceAnimal?.animalType}`);
  }
  if (request.otherNeeds) {
    parts.push(`Other: ${request.otherNeeds}`);
  }
  return parts.join('; ');
}

export function notifyAirlineOfAssistance(
  booking: Booking,
  passenger: Passenger,
  request: SpecialAssistanceRequest,
): AirlineNotification {
  const categories = determineAirlineNotificationCategories(request);
  const airlineCode = (booking as unknown as Record<string, unknown>).airlineCode as string
    || ((booking.flight as unknown as Record<string, unknown>)?.airline as string)
    || 'UNKNOWN';
  const notification: AirlineNotification = {
    airlineCode,
    notifiedAt: new Date(),
    acknowledged: false,
    categories,
    message: generateAirlineMessage(request),
  };

  const existing = (passenger.airlineNotifications || []) as AirlineNotification[];
  existing.push(notification);
  passenger.airlineNotifications = existing as unknown as object[];

  logger.info('Airline notified of special assistance', {
    passengerId: passenger.id,
    categories,
  });

  return notification;
}

export class SpecialAssistanceService {
  async updateAssistance(
    bookingId: string,
    passengerId: string,
    request: SpecialAssistanceRequest,
  ): Promise<{ passenger: Passenger; notification: AirlineNotification }> {
    const repo = AppDataSource.getRepository(Passenger);
    const bookingRepo = AppDataSource.getRepository(Booking);

    const passenger = await repo.findOne({ where: { id: passengerId } });
    if (!passenger) throw new Error('Passenger not found');

    const booking = await bookingRepo.findOne({ where: { id: bookingId }, relations: ['flight'] });
    if (!booking) throw new Error('Booking not found');

    applyRequestToPassenger(passenger, request);
    await repo.save(passenger);

    const notification = notifyAirlineOfAssistance(booking, passenger, request);
    await repo.save(passenger);

    logger.info('Special assistance updated', { bookingId, passengerId });

    return { passenger, notification };
  }

  getAssistance(passenger: Passenger): {
    request: SpecialAssistanceRequest;
    notifications: AirlineNotification[];
  } {
    const request = mapPassengerToRequest(passenger);
    const notifications = (passenger.airlineNotifications || []) as AirlineNotification[];
    return { request, notifications };
  }

  validateAssistanceRequest(request: SpecialAssistanceRequest): string[] {
    const errors: string[] = [];

    if (request.requiresWheelchair && !request.wheelchair) {
      errors.push('Wheelchair type is required when wheelchair assistance is requested');
    }
    if (request.requiresMedicalOxygen && !request.medicalOxygen) {
      errors.push('Medical oxygen type is required when oxygen is requested');
    }
    if (request.specialMeal && !request.meal) {
      errors.push('Meal type is required when a special meal is requested');
    }
    if (request.hasServiceAnimal && !request.serviceAnimal) {
      errors.push('Service animal type is required when a service animal is declared');
    }

    if (request.requiresWheelchair && request.wheelchair) {
      const validWheelchairTypes = ['ramp', 'boarding', 'cabin', 'stretcher'];
      if (!validWheelchairTypes.includes(request.wheelchair.type)) {
        errors.push(`Invalid wheelchair type: ${request.wheelchair.type}`);
      }
    }

    if (request.requiresMedicalOxygen && request.medicalOxygen) {
      const validOxygenTypes = ['portable_concentrator', 'cylinder'];
      if (!validOxygenTypes.includes(request.medicalOxygen.type)) {
        errors.push(`Invalid medical oxygen type: ${request.medicalOxygen.type}`);
      }
    }

    if (request.hasServiceAnimal && request.serviceAnimal) {
      const validAnimalTypes = ['guide_dog', 'hearing_dog', 'emotional_support', 'psychiatric', 'other'];
      if (!validAnimalTypes.includes(request.serviceAnimal.animalType)) {
        errors.push(`Invalid service animal type: ${request.serviceAnimal.animalType}`);
      }
    }

    return errors;
  }
}

export const specialAssistanceService = new SpecialAssistanceService();
