"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Armchair, Plane, Crown, Users, IndianRupee } from "lucide-react"
import { cn } from "@/lib/utils"

interface AncillaryProduct {
  id: string
  name: string
  description: string
  priceCents: number
  currency: string
  category: "seat" | "boarding" | "lounge" | "legroom"
}

interface AncillarySelectorProps {
  bookingId: string
  onAncillariesChange?: (totalCents: number, items: Array<{ productId: string; quantity: number }>) => void
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  seat: Armchair,
  boarding: Plane,
  lounge: Crown,
  legroom: Users,
}

export function AncillarySelector({ bookingId, onAncillariesChange }: AncillarySelectorProps) {
  const [catalog, setCatalog] = useState<AncillaryProduct[]>([])
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch("/api/v1/ancillaries")
      .then((res) => res.json())
      .then((data) => setCatalog(data.ancillaries || []))
      .catch(() => setCatalog([]))
  }, [])

  const toggle = (productId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[productId]) {
        delete next[productId]
      } else {
        next[productId] = 1
      }
      return next
    })
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const items = Object.entries(selected).map(([productId, quantity]) => ({
        productId,
        quantity,
      }))

      const res = await fetch("/api/v1/ancillaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, items }),
      })

      if (!res.ok) throw new Error("Failed to save ancillaries")

      const data = await res.json()
      onAncillariesChange?.(data.totalCents, items)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const selectedItems = catalog.filter((p) => selected[p.id])
  const totalCents = selectedItems.reduce((sum, p) => sum + p.priceCents * (selected[p.id] || 0), 0)

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-primary" />
          Ancillary Services
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {catalog.map((product) => {
            const Icon = CATEGORY_ICONS[product.category] || Armchair
            const isSelected = !!selected[product.id]

            return (
              <button
                key={product.id}
                onClick={() => toggle(product.id)}
                className={cn(
                  "flex flex-col items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", isSelected ? "bg-primary text-primary-foreground" : "bg-muted")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                    </div>
                  </div>
                  <Badge variant={isSelected ? "default" : "outline"}>
                    ${(product.priceCents / 100).toFixed(2)}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>

        {selectedItems.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Selected Ancillaries</span>
                <span className="font-medium">${(totalCents / 100).toFixed(2)}</span>
              </div>
              {selectedItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.name} {selected[item.id] > 1 ? `× ${selected[item.id]}` : ""}
                  </span>
                  <span className="font-medium">${((item.priceCents * (selected[item.id] || 1)) / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={loading || selectedItems.length === 0} className="w-full">
          {loading ? "Saving..." : "Add Selected Services"}
        </Button>
      </CardContent>
    </Card>
  )
}
