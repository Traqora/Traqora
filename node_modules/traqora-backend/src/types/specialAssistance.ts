export type WheelchairType = 'ramp' | 'boarding' | 'cabin' | 'stretcher';

export type MedicalOxygenType = 'portable_concentrator' | 'cylinder';

export type SpecialMealType =
  | 'VGML' | 'Vegan Meal'
  | 'VJML' | 'Vegetarian Jain Meal'
  | 'AVML' | 'Asian Vegetarian Meal'
  | 'GFML' | 'Gluten Free Meal'
  | 'KSML' | 'Kosher Meal'
  | 'MOML' | 'Muslim Meal'
  | 'HNML' | 'Hindu Meal'
  | 'BBML' | 'Baby Meal'
  | 'CHML' | 'Child Meal'
  | 'LPML' | 'Low Protein Meal'
  | 'LSML' | 'Low Salt Meal'
  | 'LCML' | 'Low Calorie Meal'
  | 'DBML' | 'Diabetic Meal'
  | 'NLML' | 'Non-Lactose Meal'
  | 'PFML' | 'Peanut Free Meal'
  | 'SFML' | 'Seafood Free Meal'
  | 'BLML' | 'Bland Meal'
  | 'FPML' | 'Fruit Platter Meal';

export type ServiceAnimalType = 'guide_dog' | 'hearing_dog' | 'emotional_support' | 'psychiatric' | 'other';

export interface WheelchairRequest {
  type: WheelchairType;
  notes?: string;
}

export interface MedicalOxygenRequest {
  type: MedicalOxygenType;
  flowRateLpm?: number;
  quantity?: number;
  notes?: string;
}

export interface SpecialMealRequest {
  mealType: SpecialMealType;
  notes?: string;
}

export interface ServiceAnimalRequest {
  animalType: ServiceAnimalType;
  breed?: string;
  weightKg?: number;
  notes?: string;
}

export interface AccessibilityPreference {
  priorityBoarding: boolean;
  extraLegroomPreferred: boolean;
  bulkheadSeatRequired: boolean;
  aisleChairRequired: boolean;
  deafOrHardOfHearing: boolean;
  blindOrLowVision: boolean;
  cognitiveAssistance: boolean;
  notes?: string;
}

export interface SpecialAssistanceRequest {
  requiresWheelchair: boolean;
  wheelchair?: WheelchairRequest;
  requiresMedicalOxygen: boolean;
  medicalOxygen?: MedicalOxygenRequest;
  specialMeal: boolean;
  meal?: SpecialMealRequest;
  hasServiceAnimal: boolean;
  serviceAnimal?: ServiceAnimalRequest;
  accessibilityNeeds?: AccessibilityPreference;
  otherNeeds?: string;
}

export interface AirlineNotification {
  airlineCode: string;
  notifiedAt: Date;
  acknowledged: boolean;
  message?: string;
  categories: string[];
}

export const WHEELCHAIR_TYPES: WheelchairType[] = ['ramp', 'boarding', 'cabin', 'stretcher'];
export const MEDICAL_OXYGEN_TYPES: MedicalOxygenType[] = ['portable_concentrator', 'cylinder'];
export const SERVICE_ANIMAL_TYPES: ServiceAnimalType[] = ['guide_dog', 'hearing_dog', 'emotional_support', 'psychiatric', 'other'];

export const SPECIAL_MEAL_OPTIONS: { value: SpecialMealType; label: string; description: string }[] = [
  { value: 'VGML', label: 'Vegan', description: 'Plant-based meal, no animal products' },
  { value: 'VJML', label: 'Vegetarian Jain', description: 'Vegetarian meal excluding root vegetables' },
  { value: 'AVML', label: 'Asian Vegetarian', description: 'Spicy Indian-style vegetarian meal' },
  { value: 'GFML', label: 'Gluten Free', description: 'Meal prepared without gluten-containing ingredients' },
  { value: 'KSML', label: 'Kosher', description: 'Kosher-certified meal' },
  { value: 'MOML', label: 'Muslim', description: 'Halal-certified meal' },
  { value: 'HNML', label: 'Hindu', description: 'Hindu dietary preference meal, no beef' },
  { value: 'BBML', label: 'Baby', description: 'Baby food meal' },
  { value: 'CHML', label: 'Child', description: 'Meal designed for children' },
  { value: 'LPML', label: 'Low Protein', description: 'Meal with controlled protein content' },
  { value: 'LSML', label: 'Low Salt', description: 'Low sodium meal' },
  { value: 'LCML', label: 'Low Calorie', description: 'Low calorie meal option' },
  { value: 'DBML', label: 'Diabetic', description: 'Meal suitable for diabetic passengers' },
  { value: 'NLML', label: 'Non-Lactose', description: 'Lactose-free meal' },
  { value: 'PFML', label: 'Peanut Free', description: 'Prepared without peanuts or peanut oil' },
  { value: 'SFML', label: 'Seafood Free', description: 'No fish or shellfish ingredients' },
  { value: 'BLML', label: 'Bland', description: 'Plain easily digestible meal' },
  { value: 'FPML', label: 'Fruit Platter', description: 'Fresh fruit selection' },
];
