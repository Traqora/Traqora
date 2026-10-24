"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Leaf, TreePine, Sun, Users, Check, X, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getOffsetProjects,
  calculateOffsetCost,
  OffsetProject,
  OffsetProjectType,
  OffsetCost,
} from "@/lib/api"

interface CarbonOffsetSelectorProps {
  footprintKg: number | null
  flightId: string
  isCarbonNeutral: boolean
  onToggleCarbonNeutral: (neutral: boolean) => void
  onOffsetSelected: (projectId: string | null, costCents: number) => void
}

const projectIcons: Record<OffsetProjectType, React.ReactNode> = {
  reforestation: <TreePine className="h-5 w-5 text-green-600" />,
  renewable: <Sun className="h-5 w-5 text-yellow-500" />,
  community: <Users className="h-5 w-5 text-blue-500" />,
}

const projectColors: Record<OffsetProjectType, string> = {
  reforestation: "border-green-200 bg-green-50/50",
  renewable: "border-yellow-200 bg-yellow-50/50",
  community: "border-blue-200 bg-blue-50/50",
}

export function CarbonOffsetSelector({
  footprintKg,
  flightId,
  isCarbonNeutral,
  onToggleCarbonNeutral,
  onOffsetSelected,
}: CarbonOffsetSelectorProps) {
  const [projects, setProjects] = useState<OffsetProject[]>([])
  const [costs, setCosts] = useState<Record<string, OffsetCost>>({})
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    getOffsetProjects()
      .then((data) => {
        if (!cancelled) setProjects(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Failed to load offset projects")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!footprintKg || !projects.length) return

    let cancelled = false

    Promise.all(
      projects.map(async (p) => {
        try {
          const cost = await calculateOffsetCost(footprintKg!, p.id)
          return { id: p.id, cost }
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const costMap: Record<string, OffsetCost> = {}
      for (const r of results) {
        if (r) costMap[r.id] = r.cost
      }
      setCosts(costMap)
    })

    return () => { cancelled = true }
  }, [footprintKg, projects])

  const handleToggle = (projectId: string) => {
    const newSelected = selectedProjectId === projectId ? null : projectId
    setSelectedProjectId(newSelected)
    const cost = newSelected && costs[newSelected] ? costs[newSelected].costCents : 0
    onOffsetSelected(newSelected, cost)
    if (!newSelected) {
      onToggleCarbonNeutral(false)
    }
  }

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

  if (!footprintKg) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Leaf className="h-5 w-5 text-green-600" />
        <h3 className="text-xl font-bold">Carbon Offsets</h3>
        <Badge variant="outline" className="text-xs">Optional</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Make your flight carbon-neutral by investing in verified offset projects.
        Your contribution supports renewable energy, reforestation, and community initiatives.
      </p>

      <div className="flex items-center space-x-2 pb-2">
        <Checkbox
          id="carbon-neutral"
          checked={isCarbonNeutral}
          onCheckedChange={(checked) => {
            onToggleCarbonNeutral(checked as boolean)
            if (!checked) {
              setSelectedProjectId(null)
              onOffsetSelected(null, 0)
            }
          }}
        />
        <label htmlFor="carbon-neutral" className="text-sm font-medium cursor-pointer">
          Make this booking carbon-neutral
        </label>
      </div>

      {isCarbonNeutral && (
        <>
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          )}

          {loadError && <p className="text-sm text-destructive">{loadError}</p>}

          {!isLoading && !loadError && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {projects.map((project) => {
                const isSelected = selectedProjectId === project.id
                const cost = costs[project.id]
                return (
                  <Card
                    key={project.id}
                    className={cn(
                      "cursor-pointer transition-all border-2",
                      isSelected
                        ? "border-green-500 shadow-lg"
                        : "border-transparent hover:border-border",
                    )}
                    onClick={() => handleToggle(project.id)}
                  >
                    <CardHeader className={cn("pb-3 rounded-t-lg", projectColors[project.type])}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {projectIcons[project.type]}
                          <CardTitle className="text-sm">{project.name}</CardTitle>
                        </div>
                        {isSelected && <Check className="h-5 w-5 text-green-600" />}
                      </div>
                      <CardDescription className="text-xs mt-1">
                        {project.type.charAt(0).toUpperCase() + project.type.slice(1)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-3">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {project.description}
                      </p>
                      <div className="text-lg font-bold text-green-700">
                        {cost ? formatCents(cost.costCents) : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {cost ? `${cost.tonsToOffset} ton(s) CO₂` : `${formatCents(project.pricePerTonCents)}/ton`}
                      </div>
                      {project.certifications.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {project.certifications.map((cert) => (
                            <Badge key={cert} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {cert}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
