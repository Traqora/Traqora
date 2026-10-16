"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Utensils, Info, Plus, X } from "lucide-react";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";

interface Meal {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  dietaryRestrictions: string[];
  servingTime: "breakfast" | "lunch" | "dinner" | "snack";
  calories?: number;
  spiceLevel?: "mild" | "medium" | "hot";
}

interface MealOrder {
  mealId: string;
  name: string;
  dietary?: string;
  quantity: number;
  price: number;
  specialInstructions?: string;
}

interface MealSelectorProps {
  meals: Meal[];
  selectedMeals: MealOrder[];
  onMealAdd: (meal: MealOrder) => void;
  onMealRemove: (mealId: string) => void;
  displayCurrency?: CurrencyCode;
  rates?: Record<string, number>;
}

const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "gluten_free", label: "Gluten Free" },
  { value: "dairy_free", label: "Dairy Free" },
  { value: "nut_free", label: "Nut Free" },
  { value: "low_sodium", label: "Low Sodium" },
  { value: "diabetic", label: "Diabetic" },
];

export function MealSelector({
  meals,
  selectedMeals,
  onMealAdd,
  onMealRemove,
  displayCurrency = "USD",
  rates,
}: MealSelectorProps) {
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [selectedDietary, setSelectedDietary] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const convertPrice = (priceInCents: number): number => {
    if (displayCurrency === "USD" || !rates) return priceInCents / 100;
    return (priceInCents / 100) * (rates[displayCurrency] || 1);
  };

  const handleAddMeal = (meal: Meal): void => {
    const newMeal: MealOrder = {
      mealId: meal.id,
      name: meal.name,
      dietary: selectedDietary || undefined,
      quantity,
      price: meal.price,
      specialInstructions: specialInstructions || undefined,
    };

    onMealAdd(newMeal);
    setSelectedMealId(null);
    setSelectedDietary("");
    setQuantity(1);
    setSpecialInstructions("");
  };

  const totalMealCost = selectedMeals.reduce(
    (sum, meal) => sum + (meal.price / 100) * meal.quantity,
    0,
  );

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0">
        <CardTitle className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-primary" />
          <span>In-Flight Meals</span>
          <Badge variant="secondary" className="ml-auto">
            Optional
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0 space-y-6">
        {/* Meal Selection */}
        <div className="space-y-4">
          <label className="text-sm font-medium">Available Meals</label>
          <div className="grid gap-3 max-h-96 overflow-y-auto pr-2">
            {meals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No meals available for this cabin class
              </p>
            ) : (
              meals.map((meal) => (
                <div
                  key={meal.id}
                  onClick={() =>
                    setSelectedMealId(
                      meal.id === selectedMealId ? null : meal.id,
                    )
                  }
                  className={cn(
                    "p-4 rounded-lg border-2 cursor-pointer transition-all",
                    selectedMealId === meal.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30",
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedMealId(
                        meal.id === selectedMealId ? null : meal.id,
                      );
                    }
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{meal.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {meal.description}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="font-bold text-primary">
                          +
                          {formatCurrency(
                            convertPrice(meal.price),
                            displayCurrency,
                          )}
                          /meal
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {meal.servingTime && (
                        <Badge variant="outline" className="text-xs">
                          {meal.servingTime}
                        </Badge>
                      )}
                      {meal.calories && (
                        <Badge variant="outline" className="text-xs">
                          {meal.calories} cal
                        </Badge>
                      )}
                      {meal.spiceLevel && (
                        <Badge variant="outline" className="text-xs">
                          {meal.spiceLevel}
                        </Badge>
                      )}
                    </div>

                    {selectedMealId === meal.id && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {/* Dietary Selection */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium">
                            Dietary Preference
                          </label>
                          <Select
                            value={selectedDietary}
                            onValueChange={setSelectedDietary}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select dietary option" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {DIETARY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Quantity */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium">
                            Quantity
                          </label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setQuantity(Math.max(1, quantity - 1))
                              }
                              className="h-8 w-8 p-0"
                            >
                              −
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setQuantity(Math.min(10, quantity + 1))
                              }
                              className="h-8 w-8 p-0"
                            >
                              +
                            </Button>
                          </div>
                        </div>

                        {/* Special Instructions */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium">
                            Special Instructions
                          </label>
                          <textarea
                            value={specialInstructions}
                            onChange={(e) =>
                              setSpecialInstructions(e.target.value)
                            }
                            placeholder="e.g., No onions, extra sauce"
                            className="w-full h-16 px-3 py-2 text-sm border rounded-md"
                            maxLength={500}
                          />
                        </div>

                        <Button
                          onClick={() => handleAddMeal(meal)}
                          className="w-full h-8 text-sm"
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add to Booking
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Selected Meals Summary */}
        {selectedMeals.length > 0 && (
          <div className="space-y-3 bg-primary/5 p-4 rounded-lg border border-primary/10">
            <h4 className="font-semibold text-sm">Selected Meals</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {selectedMeals.map((meal) => (
                <div
                  key={`${meal.mealId}-${meal.dietary || "none"}`}
                  className="flex items-center justify-between text-sm p-2 bg-background rounded border border-border"
                >
                  <div className="flex-1">
                    <p className="font-medium">{meal.name}</p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {meal.dietary && <span>• {meal.dietary}</span>}
                      <span>• Qty: {meal.quantity}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">
                      {formatCurrency(
                        convertPrice(meal.price * meal.quantity),
                        displayCurrency,
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMealRemove(meal.mealId)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-primary/10 flex justify-between text-sm font-semibold">
              <span>Subtotal</span>
              <span>{formatCurrency(totalMealCost, displayCurrency)}</span>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 p-3 rounded-lg">
          <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <p>
            Pre-order meals to guarantee your preference. Orders are subject to
            availability during flight.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
