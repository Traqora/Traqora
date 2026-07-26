"use client"

import { JourneyPlanner } from "@/components/journey-planner"
import { Plane } from "lucide-react"

export default function JourneyPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Journey Planner</h1>
          <p className="text-muted-foreground">
            Build complex multi-stop trips with route optimization and time management.
          </p>
        </div>

        <JourneyPlanner />
      </div>
    </div>
  )
}
