"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Plus, X, Dog, UtensilsCrossed, Wheelchair, Wind, Accessibility } from "lucide-react"
import { cn } from "@/lib/utils"

export type WheelchairType = "ramp" | "boarding" | "cabin" | "stretcher"
export type MedicalOxygenType = "portable_concentrator" | "cylinder"
export type ServiceAnimalType = "guide_dog" | "hearing_dog" | "emotional_support" | "psychiatric" | "other"

export interface WheelchairRequest {
  type: WheelchairType
  notes?: string
}

export interface MedicalOxygenRequest {
  type: MedicalOxygenType
  flowRateLpm?: number
  quantity?: number
  notes?: string
}

export interface SpecialMealRequest {
  mealType: string
  notes?: string
}

export interface ServiceAnimalRequest {
  animalType: ServiceAnimalType
  breed?: string
  weightKg?: number
  notes?: string
}

export interface AccessibilityPreference {
  priorityBoarding: boolean
  extraLegroomPreferred: boolean
  bulkheadSeatRequired: boolean
  aisleChairRequired: boolean
  deafOrHardOfHearing: boolean
  blindOrLowVision: boolean
  cognitiveAssistance: boolean
  notes?: string
}

export interface SpecialAssistanceData {
  requiresWheelchair: boolean
  wheelchair?: WheelchairRequest
  requiresMedicalOxygen: boolean
  medicalOxygen?: MedicalOxygenRequest
  specialMeal: boolean
  meal?: SpecialMealRequest
  hasServiceAnimal: boolean
  serviceAnimal?: ServiceAnimalRequest
  accessibilityNeeds?: AccessibilityPreference
  otherNeeds?: string
}

export const SPECIAL_MEAL_OPTIONS = [
  { value: "VGML", label: "Vegan", description: "Plant-based meal, no animal products" },
  { value: "VJML", label: "Vegetarian Jain", description: "Vegetarian meal excluding root vegetables" },
  { value: "AVML", label: "Asian Vegetarian", description: "Spicy Indian-style vegetarian meal" },
  { value: "GFML", label: "Gluten Free", description: "Meal prepared without gluten-containing ingredients" },
  { value: "KSML", label: "Kosher", description: "Kosher-certified meal" },
  { value: "MOML", label: "Muslim", description: "Halal-certified meal" },
  { value: "HNML", label: "Hindu", description: "Hindu dietary preference meal, no beef" },
  { value: "BBML", label: "Baby", description: "Baby food meal" },
  { value: "CHML", label: "Child", description: "Meal designed for children" },
  { value: "LPML", label: "Low Protein", description: "Meal with controlled protein content" },
  { value: "LSML", label: "Low Salt", description: "Low sodium meal" },
  { value: "LCML", label: "Low Calorie", description: "Low calorie meal option" },
  { value: "DBML", label: "Diabetic", description: "Meal suitable for diabetic passengers" },
  { value: "NLML", label: "Non-Lactose", description: "Lactose-free meal" },
  { value: "PFML", label: "Peanut Free", description: "Prepared without peanuts or peanut oil" },
  { value: "SFML", label: "Seafood Free", description: "No fish or shellfish ingredients" },
  { value: "BLML", label: "Bland", description: "Plain easily digestible meal" },
  { value: "FPML", label: "Fruit Platter", description: "Fresh fruit selection" },
]

const WHEELCHAIR_OPTIONS: { value: WheelchairType; label: string; description: string }[] = [
  { value: "ramp", label: "Ramp Assistance", description: "Assistance to/from gate" },
  { value: "boarding", label: "Boarding Assistance", description: "Assistance to/from seat" },
  { value: "cabin", label: "Onboard Wheelchair", description: "Wheelchair accessible cabin seat" },
  { value: "stretcher", label: "Stretcher", description: "Medical stretcher accommodation" },
]

const OXYGEN_OPTIONS: { value: MedicalOxygenType; label: string; description: string }[] = [
  { value: "portable_concentrator", label: "Portable Concentrator", description: "Battery-operated POC" },
  { value: "cylinder", label: "Oxygen Cylinder", description: "Compressed oxygen cylinder" },
]

const SERVICE_ANIMAL_OPTIONS: { value: ServiceAnimalType; label: string; description: string }[] = [
  { value: "guide_dog", label: "Guide Dog", description: "Trained guide dog for visual impairment" },
  { value: "hearing_dog", label: "Hearing Dog", description: "Assistance dog for hearing impairment" },
  { value: "emotional_support", label: "Emotional Support", description: "Emotional support animal" },
  { value: "psychiatric", label: "Psychiatric Service", description: "Service dog for psychiatric disability" },
  { value: "other", label: "Other", description: "Other type of service animal" },
]

interface SpecialAssistanceFormProps {
  passengerIndex: number
  data: SpecialAssistanceData
  onChange: (passengerIndex: number, data: SpecialAssistanceData) => void
  errors?: Record<string, string>
}

function AssistanceSection({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={cn("border rounded-lg p-4 space-y-3", enabled && "border-primary/40 bg-primary/5")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5", enabled ? "text-primary" : "text-muted-foreground")}>{icon}</div>
          <div>
            <p className="font-medium text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && <div className="space-y-3 pt-1">{children}</div>}
    </div>
  )
}

export function SpecialAssistanceForm({ passengerIndex, data, onChange, errors }: SpecialAssistanceFormProps) {
  const update = useCallback(
    (patch: Partial<SpecialAssistanceData>) => {
      onChange(passengerIndex, { ...data, ...patch })
    },
    [passengerIndex, data, onChange],
  )

  const needsCount = [
    data.requiresWheelchair,
    data.requiresMedicalOxygen,
    data.specialMeal,
    data.hasServiceAnimal,
    data.accessibilityNeeds && Object.values(data.accessibilityNeeds).some(Boolean),
  ].filter(Boolean).length

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Accessibility className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-serif">Special Assistance</CardTitle>
          </div>
          {needsCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {needsCount} need{needsCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AssistanceSection
          icon={<Wheelchair className="h-4 w-4" />}
          title="Wheelchair Assistance"
          description="Request wheelchair service at the airport and during boarding"
          enabled={data.requiresWheelchair}
          onToggle={(v) => update({ requiresWheelchair: v, wheelchair: v ? data.wheelchair || { type: "ramp" } : undefined })}
        >
          <div className="space-y-2">
            <Label>Type of Assistance</Label>
            <Select
              value={data.wheelchair?.type || "ramp"}
              onValueChange={(v) => update({ wheelchair: { ...data.wheelchair!, type: v as WheelchairType } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WHEELCHAIR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{opt.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`wc-notes-${passengerIndex}`}>Additional Notes</Label>
            <Input
              id={`wc-notes-${passengerIndex}`}
              placeholder="Any specific requirements..."
              value={data.wheelchair?.notes || ""}
              onChange={(e) => update({ wheelchair: { ...data.wheelchair!, notes: e.target.value } })}
            />
          </div>
        </AssistanceSection>

        <AssistanceSection
          icon={<Wind className="h-4 w-4" />}
          title="Medical Oxygen"
          description="Request medical oxygen during the flight"
          enabled={data.requiresMedicalOxygen}
          onToggle={(v) => update({ requiresMedicalOxygen: v, medicalOxygen: v ? data.medicalOxygen || { type: "portable_concentrator" } : undefined })}
        >
          <div className="space-y-2">
            <Label>Oxygen Type</Label>
            <Select
              value={data.medicalOxygen?.type || "portable_concentrator"}
              onValueChange={(v) => update({ medicalOxygen: { ...data.medicalOxygen!, type: v as MedicalOxygenType } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OXYGEN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{opt.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`o2-flow-${passengerIndex}`}>Flow Rate (L/min)</Label>
              <Input
                id={`o2-flow-${passengerIndex}`}
                type="number"
                min={1}
                max={15}
                placeholder="2"
                value={data.medicalOxygen?.flowRateLpm || ""}
                onChange={(e) => update({ medicalOxygen: { ...data.medicalOxygen!, flowRateLpm: parseInt(e.target.value) || undefined } })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`o2-qty-${passengerIndex}`}>Quantity</Label>
              <Input
                id={`o2-qty-${passengerIndex}`}
                type="number"
                min={1}
                max={10}
                placeholder="1"
                value={data.medicalOxygen?.quantity || ""}
                onChange={(e) => update({ medicalOxygen: { ...data.medicalOxygen!, quantity: parseInt(e.target.value) || undefined } })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`o2-notes-${passengerIndex}`}>Medical Notes</Label>
            <Input
              id={`o2-notes-${passengerIndex}`}
              placeholder="Medical condition, prescription details..."
              value={data.medicalOxygen?.notes || ""}
              onChange={(e) => update({ medicalOxygen: { ...data.medicalOxygen!, notes: e.target.value } })}
            />
          </div>
        </AssistanceSection>

        <AssistanceSection
          icon={<UtensilsCrossed className="h-4 w-4" />}
          title="Special Meal"
          description="Request a meal to accommodate dietary restrictions or religious requirements"
          enabled={data.specialMeal}
          onToggle={(v) => update({ specialMeal: v, meal: v ? data.meal || { mealType: "VGML" } : undefined })}
        >
          <div className="space-y-2">
            <Label>Meal Type</Label>
            <Select
              value={data.meal?.mealType || "VGML"}
              onValueChange={(v) => update({ meal: { ...data.meal!, mealType: v } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPECIAL_MEAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">({opt.description})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {errors?.meal && (
            <p className="text-xs text-destructive">{errors.meal}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`meal-notes-${passengerIndex}`}>Notes (optional)</Label>
            <Input
              id={`meal-notes-${passengerIndex}`}
              placeholder="Allergies, preferences..."
              value={data.meal?.notes || ""}
              onChange={(e) => update({ meal: { ...data.meal!, notes: e.target.value } })}
            />
          </div>
        </AssistanceSection>

        <AssistanceSection
          icon={<Dog className="h-4 w-4" />}
          title="Service Animal"
          description="Traveling with a service animal or emotional support animal"
          enabled={data.hasServiceAnimal}
          onToggle={(v) => update({ hasServiceAnimal: v, serviceAnimal: v ? data.serviceAnimal || { animalType: "guide_dog" } : undefined })}
        >
          <div className="space-y-2">
            <Label>Animal Type</Label>
            <Select
              value={data.serviceAnimal?.animalType || "guide_dog"}
              onValueChange={(v) => update({ serviceAnimal: { ...data.serviceAnimal!, animalType: v as ServiceAnimalType } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_ANIMAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{opt.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`animal-breed-${passengerIndex}`}>Breed</Label>
              <Input
                id={`animal-breed-${passengerIndex}`}
                placeholder="e.g. Labrador Retriever"
                value={data.serviceAnimal?.breed || ""}
                onChange={(e) => update({ serviceAnimal: { ...data.serviceAnimal!, breed: e.target.value } })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`animal-weight-${passengerIndex}`}>Weight (kg)</Label>
              <Input
                id={`animal-weight-${passengerIndex}`}
                type="number"
                min={1}
                max={200}
                placeholder="30"
                value={data.serviceAnimal?.weightKg || ""}
                onChange={(e) => update({ serviceAnimal: { ...data.serviceAnimal!, weightKg: parseInt(e.target.value) || undefined } })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`animal-notes-${passengerIndex}`}>Notes</Label>
            <Input
              id={`animal-notes-${passengerIndex}`}
              placeholder="Vaccination records, certification..."
              value={data.serviceAnimal?.notes || ""}
              onChange={(e) => update({ serviceAnimal: { ...data.serviceAnimal!, notes: e.target.value } })}
            />
          </div>
        </AssistanceSection>

        <AssistanceSection
          icon={<Accessibility className="h-4 w-4" />}
          title="Accessibility Preferences"
          description="Additional accessibility accommodations"
          enabled={!!data.accessibilityNeeds && Object.values(data.accessibilityNeeds).some((v) => typeof v === "boolean" ? v : false)}
          onToggle={(v) =>
            update({
              accessibilityNeeds: v
                ? data.accessibilityNeeds || {
                    priorityBoarding: false,
                    extraLegroomPreferred: false,
                    bulkheadSeatRequired: false,
                    aisleChairRequired: false,
                    deafOrHardOfHearing: false,
                    blindOrLowVision: false,
                    cognitiveAssistance: false,
                  }
                : undefined,
            })
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {([
              { key: "priorityBoarding", label: "Priority Boarding" },
              { key: "extraLegroomPreferred", label: "Extra Legroom" },
              { key: "bulkheadSeatRequired", label: "Bulkhead Seat" },
              { key: "aisleChairRequired", label: "Aisle Chair" },
              { key: "deafOrHardOfHearing", label: "Deaf / Hard of Hearing" },
              { key: "blindOrLowVision", label: "Blind / Low Vision" },
              { key: "cognitiveAssistance", label: "Cognitive Assistance" },
            ] as const).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Switch
                  id={`${key}-${passengerIndex}`}
                  checked={!!(data.accessibilityNeeds as any)?.[key]}
                  onCheckedChange={(v) => {
                    const needs = data.accessibilityNeeds || {
                      priorityBoarding: false,
                      extraLegroomPreferred: false,
                      bulkheadSeatRequired: false,
                      aisleChairRequired: false,
                      deafOrHardOfHearing: false,
                      blindOrLowVision: false,
                      cognitiveAssistance: false,
                    }
                    update({ accessibilityNeeds: { ...needs, [key]: v } })
                  }}
                />
                <Label htmlFor={`${key}-${passengerIndex}`} className="text-sm cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-1">
            <Label htmlFor={`access-notes-${passengerIndex}`}>Accessibility Notes</Label>
            <Textarea
              id={`access-notes-${passengerIndex}`}
              placeholder="Describe any additional accessibility needs..."
              value={data.accessibilityNeeds?.notes || ""}
              onChange={(e) =>
                update({
                  accessibilityNeeds: {
                    ...(data.accessibilityNeeds || {
                      priorityBoarding: false,
                      extraLegroomPreferred: false,
                      bulkheadSeatRequired: false,
                      aisleChairRequired: false,
                      deafOrHardOfHearing: false,
                      blindOrLowVision: false,
                      cognitiveAssistance: false,
                    }),
                    notes: e.target.value,
                  },
                })
              }
            />
          </div>
        </AssistanceSection>

        <div className="space-y-2">
          <Label htmlFor={`other-needs-${passengerIndex}`}>Other Needs</Label>
          <Textarea
            id={`other-needs-${passengerIndex}`}
            placeholder="Any other medical or special assistance requirements..."
            value={data.otherNeeds || ""}
            onChange={(e) => update({ otherNeeds: e.target.value })}
          />
        </div>

        {errors?.otherNeeds && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            {errors.otherNeeds}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export const EMPTY_SPECIAL_ASSISTANCE: SpecialAssistanceData = {
  requiresWheelchair: false,
  requiresMedicalOxygen: false,
  specialMeal: false,
  hasServiceAnimal: false,
}
