"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Plane, Download, Wallet } from "lucide-react"
import { apiClient, CheckInRecord } from "@/lib/api"

interface BoardingPassCardProps {
  bookingId: string
  checkIn: CheckInRecord
  fromAirport?: string
  toAirport?: string
}

export function BoardingPassCard({ bookingId, checkIn, fromAirport, toAirport }: BoardingPassCardProps) {
  const pdfUrl = apiClient.getBoardingPassPdfUrl(bookingId)

  return (
    <Card className="overflow-hidden border-none shadow-xl">
      <CardHeader className="bg-primary text-primary-foreground p-6">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl font-serif flex items-center gap-2">
              <Plane className="h-5 w-5" />
              Boarding Pass
            </CardTitle>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-none capitalize">
            {checkIn.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {(fromAirport || toAirport) && (
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold">{fromAirport}</p>
            <Plane className="h-4 w-4 text-muted-foreground" />
            <p className="text-2xl font-bold">{toAirport}</p>
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Seat</p>
            <p className="font-medium">{checkIn.seatNumber || "Not assigned"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Boarding Pass Code</p>
            <p className="font-mono font-medium">{checkIn.boardingPassCode}</p>
          </div>
        </div>

        {checkIn.status === "checked_in" && (
          <div className="flex flex-col gap-2 pt-2">
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <Download className="h-4 w-4 mr-2" />
                Download PDF Boarding Pass
              </Button>
            </a>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent text-xs"
                onClick={async () => {
                  const response = await apiClient.getWalletPass(bookingId)
                  if (response.success) {
                    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `apple-boarding-pass-${bookingId}.pkpass.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }
                }}
              >
                <Wallet className="h-4 w-4 mr-2 text-blue-500" />
                Apple Wallet Pass
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent text-xs"
                onClick={async () => {
                  const response = await apiClient.getGoogleWalletPass(bookingId)
                  if (response.success) {
                    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `google-boarding-pass-${bookingId}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }
                }}
              >
                <Wallet className="h-4 w-4 mr-2 text-emerald-500" />
                Google Pay Pass
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
