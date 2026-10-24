"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Leaf, Plane, Ruler, Calculator } from "lucide-react"

interface CarbonFootprintDisplayProps {
  totalCO2kg: number | null
  distanceKm: number | null
  cabinClassFactor: number | null
  calculationMethod: string | null
  isLoading: boolean
}

export function CarbonFootprintDisplay({
  totalCO2kg,
  distanceKm,
  cabinClassFactor,
  calculationMethod,
  isLoading,
}: CarbonFootprintDisplayProps) {
  const formatKg = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)} tonnes`
    return `${kg.toFixed(0)} kg`
  }

  const getComparison = (kg: number) => {
    const trees = Math.round(kg / 21)
    const phoneCharges = Math.round(kg / 0.02)
    return { trees, phoneCharges }
  }

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Leaf className="h-5 w-5 text-green-600" />
          Carbon Footprint
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : totalCO2kg !== null ? (
          <div className="space-y-4">
            <div className="text-3xl font-bold text-green-700">
              {formatKg(totalCO2kg)}
              <span className="text-sm font-normal text-muted-foreground ml-2">CO₂</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Ruler className="h-4 w-4" />
                <span>{distanceKm?.toLocaleString()} km</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Plane className="h-4 w-4" />
                <span>{cabinClassFactor}x factor</span>
              </div>
            </div>

            {(() => {
              const cmp = getComparison(totalCO2kg)
              return (
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-green-200">
                  <p>Equivalent to <strong>{cmp.trees}</strong> trees absorbing CO₂ for a year</p>
                  <p>Or <strong>{cmp.phoneCharges.toLocaleString()}</strong> smartphones charged</p>
                </div>
              )
            })()}

            {calculationMethod && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
                <Calculator className="h-3 w-3" />
                {calculationMethod}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to calculate carbon footprint for this flight.</p>
        )}
      </CardContent>
    </Card>
  )
}
