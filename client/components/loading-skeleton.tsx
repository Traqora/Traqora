import { Card, CardContent } from "@/components/ui/card"

export function FlightCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 bg-muted rounded-lg"></div>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-32"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-center space-y-2">
                <div className="h-6 bg-muted rounded w-16"></div>
                <div className="h-4 bg-muted rounded w-12"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-muted rounded-full"></div>
                  <div className="flex-1 h-px bg-muted"></div>
                  <div className="w-4 h-4 bg-muted rounded"></div>
                  <div className="flex-1 h-px bg-muted"></div>
                  <div className="w-2 h-2 bg-muted rounded-full"></div>
                </div>
              </div>

              <div className="text-center space-y-2">
                <div className="h-6 bg-muted rounded w-16"></div>
                <div className="h-4 bg-muted rounded w-12"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-4">
              <div className="h-4 bg-muted rounded w-20"></div>
              <div className="h-4 bg-muted rounded w-16"></div>
            </div>
          </div>

          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 lg:min-w-[200px]">
            <div className="text-right space-y-2">
              <div className="h-8 bg-muted rounded w-24"></div>
              <div className="h-3 bg-muted rounded w-16"></div>
              <div className="h-5 bg-muted rounded w-20"></div>
            </div>
            <div className="h-10 bg-muted rounded w-24"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BookingCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 bg-muted rounded-lg"></div>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-32"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </div>
              <div className="h-6 bg-muted rounded w-20"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-muted rounded"></div>
                <div className="space-y-1">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-muted rounded"></div>
                <div className="space-y-1">
                  <div className="h-4 bg-muted rounded w-20"></div>
                  <div className="h-3 bg-muted rounded w-28"></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-muted rounded"></div>
                <div className="space-y-1">
                  <div className="h-4 bg-muted rounded w-16"></div>
                  <div className="h-3 bg-muted rounded w-24"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:min-w-[200px]">
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-8 bg-muted rounded"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-20"></div>
                <div className="h-8 bg-muted rounded w-16"></div>
              </div>
              <div className="w-8 h-8 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
