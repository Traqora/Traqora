"use client"

import { JourneyBuilder } from "@/components/journey/journey-builder"
import { JourneyTripPlanner } from "@/components/journey/journey-trip-planner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function JourneyPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Tabs defaultValue="multi-city" className="space-y-6">
        <TabsList>
          <TabsTrigger value="multi-city">Multi-City Flights</TabsTrigger>
          <TabsTrigger value="builder">Itinerary Builder</TabsTrigger>
        </TabsList>
        <TabsContent value="multi-city">
          <JourneyTripPlanner />
        </TabsContent>
        <TabsContent value="builder">
          <JourneyBuilder />
        </TabsContent>
      </Tabs>
    </div>
  )
}
