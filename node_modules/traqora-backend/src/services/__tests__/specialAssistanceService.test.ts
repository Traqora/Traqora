import { Passenger } from '../../db/entities/Passenger';
import {
  applyRequestToPassenger,
  mapPassengerToRequest,
  determineAirlineNotificationCategories,
  generateAirlineMessage,
} from '../specialAssistanceService';

function createMockPassenger(overrides: Partial<Passenger> = {}): Passenger {
  const p = new Passenger();
  p.id = 'test-passenger-id';
  p.email = 'test@test.com';
  p.firstName = 'John';
  p.lastName = 'Doe';
  p.sorobanAddress = 'GB...';
  p.requiresSpecialAssistance = false;
  p.priorityBoarding = false;
  p.extraLegroomPreferred = false;
  p.bulkheadSeatRequired = false;
  p.aisleChairRequired = false;
  p.deafOrHardOfHearing = false;
  p.blindOrLowVision = false;
  p.cognitiveAssistance = false;
  Object.assign(p, overrides);
  return p;
}

describe('SpecialAssistanceService', () => {
  describe('applyRequestToPassenger', () => {
    it('should set wheelchair fields', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: true,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
        wheelchair: { type: 'ramp', notes: 'Gate assistance' },
      });
      expect(result.requiresSpecialAssistance).toBe(true);
      expect(result.wheelchairType).toBe('ramp');
      expect(result.wheelchairNotes).toBe('Gate assistance');
    });

    it('should clear wheelchair fields when toggled off', () => {
      const p = createMockPassenger({ wheelchairType: 'boarding', wheelchairNotes: 'old notes' });
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
      });
      expect(result.wheelchairType).toBeNull();
      expect(result.wheelchairNotes).toBeNull();
    });

    it('should set medical oxygen fields', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: true,
        specialMeal: false,
        hasServiceAnimal: false,
        medicalOxygen: { type: 'cylinder', flowRateLpm: 3, quantity: 2, notes: 'Prescription on file' },
      });
      expect(result.requiresSpecialAssistance).toBe(true);
      expect(result.medicalOxygenType).toBe('cylinder');
      expect(result.oxygenFlowRateLpm).toBe(3);
      expect(result.oxygenQuantity).toBe(2);
      expect(result.oxygenNotes).toBe('Prescription on file');
    });

    it('should set special meal fields', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: true,
        hasServiceAnimal: false,
        meal: { mealType: 'VGML', notes: 'Vegan meal requested' },
      });
      expect(result.requiresSpecialAssistance).toBe(true);
      expect(result.specialMealType).toBe('VGML');
      expect(result.specialMealNotes).toBe('Vegan meal requested');
    });

    it('should set service animal fields', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: true,
        serviceAnimal: { animalType: 'guide_dog', breed: 'Labrador', weightKg: 30 },
      });
      expect(result.requiresSpecialAssistance).toBe(true);
      expect(result.serviceAnimalType).toBe('guide_dog');
      expect(result.serviceAnimalBreed).toBe('Labrador');
      expect(result.serviceAnimalWeightKg).toBe(30);
    });

    it('should set accessibility preferences', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
        accessibilityNeeds: {
          priorityBoarding: true,
          extraLegroomPreferred: true,
          bulkheadSeatRequired: false,
          aisleChairRequired: false,
          deafOrHardOfHearing: false,
          blindOrLowVision: false,
          cognitiveAssistance: false,
          notes: 'Requires extra time to board',
        },
      });
      expect(result.priorityBoarding).toBe(true);
      expect(result.extraLegroomPreferred).toBe(true);
      expect(result.accessibilityNotes).toBe('Requires extra time to board');
    });

    it('should clear accessibility preferences when not provided', () => {
      const p = createMockPassenger({
        priorityBoarding: true,
        extraLegroomPreferred: true,
        bulkheadSeatRequired: true,
      });
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
      });
      expect(result.priorityBoarding).toBe(false);
      expect(result.extraLegroomPreferred).toBe(false);
      expect(result.bulkheadSeatRequired).toBe(false);
    });

    it('should set other needs', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
        otherNeeds: 'Requires translator',
      });
      expect(result.otherNeeds).toBe('Requires translator');
    });

    it('should not set requiresSpecialAssistance when no needs', () => {
      const p = createMockPassenger();
      const result = applyRequestToPassenger(p, {
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
      });
      expect(result.requiresSpecialAssistance).toBe(false);
    });
  });

  describe('mapPassengerToRequest', () => {
    it('should map wheelchair passenger to request', () => {
      const p = createMockPassenger({
        wheelchairType: 'cabin',
        wheelchairNotes: 'Needs cabin wheelchair',
      });
      const req = mapPassengerToRequest(p);
      expect(req.requiresWheelchair).toBe(true);
      expect(req.wheelchair?.type).toBe('cabin');
      expect(req.wheelchair?.notes).toBe('Needs cabin wheelchair');
    });

    it('should map medical oxygen passenger to request', () => {
      const p = createMockPassenger({
        medicalOxygenType: 'portable_concentrator',
        oxygenFlowRateLpm: 2,
        oxygenNotes: 'Medical condition',
      });
      const req = mapPassengerToRequest(p);
      expect(req.requiresMedicalOxygen).toBe(true);
      expect(req.medicalOxygen?.type).toBe('portable_concentrator');
      expect(req.medicalOxygen?.flowRateLpm).toBe(2);
    });

    it('should map special meal passenger to request', () => {
      const p = createMockPassenger({
        specialMealType: 'KSML',
        specialMealNotes: 'Kosher meal',
      });
      const req = mapPassengerToRequest(p);
      expect(req.specialMeal).toBe(true);
      expect(req.meal?.mealType).toBe('KSML');
    });

    it('should map service animal passenger to request', () => {
      const p = createMockPassenger({
        serviceAnimalType: 'emotional_support',
        serviceAnimalBreed: 'Golden Retriever',
        serviceAnimalWeightKg: 25,
      });
      const req = mapPassengerToRequest(p);
      expect(req.hasServiceAnimal).toBe(true);
      expect(req.serviceAnimal?.animalType).toBe('emotional_support');
      expect(req.serviceAnimal?.breed).toBe('Golden Retriever');
    });

    it('should map accessibility preferences', () => {
      const p = createMockPassenger({
        priorityBoarding: true,
        deafOrHardOfHearing: true,
        cognitiveAssistance: true,
        accessibilityNotes: 'Sign language interpreter needed',
      });
      const req = mapPassengerToRequest(p);
      expect(req.accessibilityNeeds?.priorityBoarding).toBe(true);
      expect(req.accessibilityNeeds?.deafOrHardOfHearing).toBe(true);
      expect(req.accessibilityNeeds?.cognitiveAssistance).toBe(true);
      expect(req.accessibilityNeeds?.notes).toBe('Sign language interpreter needed');
    });

    it('should return empty request for passenger with no needs', () => {
      const p = createMockPassenger();
      const req = mapPassengerToRequest(p);
      expect(req.requiresWheelchair).toBe(false);
      expect(req.requiresMedicalOxygen).toBe(false);
      expect(req.specialMeal).toBe(false);
      expect(req.hasServiceAnimal).toBe(false);
    });
  });

  describe('determineAirlineNotificationCategories', () => {
    it('should return categories for all needs', () => {
      const categories = determineAirlineNotificationCategories({
        requiresWheelchair: true,
        requiresMedicalOxygen: true,
        specialMeal: true,
        hasServiceAnimal: true,
        wheelchair: { type: 'ramp' },
        medicalOxygen: { type: 'cylinder' },
        meal: { mealType: 'VGML' },
        serviceAnimal: { animalType: 'guide_dog' },
        accessibilityNeeds: {
          priorityBoarding: true,
          aisleChairRequired: true,
          deafOrHardOfHearing: true,
          blindOrLowVision: true,
          cognitiveAssistance: true,
        },
        otherNeeds: 'Extra assistance',
      });
      expect(categories).toContain('wheelchair');
      expect(categories).toContain('medical_oxygen');
      expect(categories).toContain('special_meal');
      expect(categories).toContain('service_animal');
      expect(categories).toContain('priority_boarding');
      expect(categories).toContain('aisle_chair');
      expect(categories).toContain('deaf_hard_of_hearing');
      expect(categories).toContain('blind_low_vision');
      expect(categories).toContain('cognitive_assistance');
      expect(categories).toContain('other');
    });

    it('should return empty for no needs', () => {
      const categories = determineAirlineNotificationCategories({
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
      });
      expect(categories).toEqual([]);
    });
  });

  describe('generateAirlineMessage', () => {
    it('should generate message with all needs', () => {
      const msg = generateAirlineMessage({
        requiresWheelchair: true,
        requiresMedicalOxygen: true,
        specialMeal: true,
        hasServiceAnimal: true,
        wheelchair: { type: 'ramp' },
        medicalOxygen: { type: 'cylinder' },
        meal: { mealType: 'VGML' },
        serviceAnimal: { animalType: 'guide_dog' },
        otherNeeds: 'Extra pillows',
      });
      expect(msg).toContain('Wheelchair: ramp');
      expect(msg).toContain('Medical oxygen: cylinder');
      expect(msg).toContain('Meal: VGML');
      expect(msg).toContain('Service animal: guide_dog');
      expect(msg).toContain('Other: Extra pillows');
    });

    it('should generate message with partial needs', () => {
      const msg = generateAirlineMessage({
        requiresWheelchair: true,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
        wheelchair: { type: 'boarding' },
      });
      expect(msg).toContain('Wheelchair: boarding');
      expect(msg).not.toContain('Medical oxygen');
    });
  });

  describe('validateAssistanceRequest', () => {
    const service = require('../specialAssistanceService').specialAssistanceService;

    it('should pass valid wheelchair request', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: true,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
        wheelchair: { type: 'ramp' },
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail when wheelchair type is missing', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: true,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
      });
      expect(errors).toContain('Wheelchair type is required when wheelchair assistance is requested');
    });

    it('should fail on invalid wheelchair type', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: true,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: false,
        wheelchair: { type: 'invalid_type' as any },
      });
      expect(errors).toContain('Invalid wheelchair type: invalid_type');
    });

    it('should fail when medical oxygen type is missing', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: false,
        requiresMedicalOxygen: true,
        specialMeal: false,
        hasServiceAnimal: false,
      });
      expect(errors).toContain('Medical oxygen type is required when oxygen is requested');
    });

    it('should fail when meal type is missing', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: true,
        hasServiceAnimal: false,
      });
      expect(errors).toContain('Meal type is required when a special meal is requested');
    });

    it('should fail when service animal type is missing', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: true,
      });
      expect(errors).toContain('Service animal type is required when a service animal is declared');
    });

    it('should fail on invalid oxygen type', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: false,
        requiresMedicalOxygen: true,
        specialMeal: false,
        hasServiceAnimal: false,
        medicalOxygen: { type: 'invalid' as any },
      });
      expect(errors).toContain('Invalid medical oxygen type: invalid');
    });

    it('should fail on invalid animal type', () => {
      const errors = service.validateAssistanceRequest({
        requiresWheelchair: false,
        requiresMedicalOxygen: false,
        specialMeal: false,
        hasServiceAnimal: true,
        serviceAnimal: { animalType: 'invalid' as any },
      });
      expect(errors).toContain('Invalid service animal type: invalid');
    });
  });
});
