"use client"

import { Calendar } from "@/components/ui/calendar"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plane, Clock, Users, Luggage, Shield, Wallet, CheckCircle, QrCode, ExternalLink, Download } from "lucide-react"

// Mock flight data - in real app this would come from API
const mockFlightDetails = {
  id: "1",
  airline: "Delta Airlines",
  logo: "/delta-airlines-logo.png",
  flightNumber: "DL 1234",
  from: "JFK",
  to: "LAX",
  fromCity: "New York",
  toCity: "Los Angeles",
  departure: "08:30",
  arrival: "11:45",
  date: "December 15, 2024",
  duration: "6h 15m",
  stops: "Non-stop",
  price: "450",
  currency: "USDC",
  class: "Economy",
  aircraft: "Boeing 737-800",
  amenities: ["WiFi", "In-flight entertainment", "Complimentary snacks"],
  baggage: {
    carry: "1 carry-on bag (22 x 14 x 9 in)",
    checked: "1 checked bag (50 lbs) - $30 extra",
  },
  refundPolicy: "Free cancellation up to 24 hours before departure",
  seatSelection: "Seat selection available for $15-45",
}

type BookingStep = "details" | "wallet" | "confirm" | "success"

export default function BookFlightPage() {
  const params = useParams()
  const [currentStep, setCurrentStep] = useState<BookingStep>("details")
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<string>("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [bookingId, setBookingId] = useState("")
  const [processingStage, setProcessingStage] = useState("")
  const [showReceipt, setShowReceipt] = useState(false)

  const flight = mockFlightDetails

  const handleConnectWallet = async (walletType: string) => {
    setIsProcessing(true)
    setSelectedWallet(walletType)
    setProcessingStage("Connecting to wallet...")

    setTimeout(() => {
      setProcessingStage("Verifying wallet connection...")
    }, 800)

    setTimeout(() => {
      setProcessingStage("Wallet connected successfully!")
      setIsWalletConnected(true)
      setIsProcessing(false)
      setCurrentStep("confirm")
    }, 2000)
  }

  const handleConfirmBooking = async () => {
    setIsProcessing(true)
    setProcessingStage("Preparing transaction...")

    setTimeout(() => {
      setProcessingStage("Submitting to Starknet...")
    }, 1000)

    setTimeout(() => {
      setProcessingStage("Waiting for confirmation...")
    }, 2000)

    setTimeout(() => {
      setProcessingStage("Generating booking receipt...")
    }, 2800)

    setTimeout(() => {
      setBookingId("0x" + Math.random().toString(16).substr(2, 8))
      setCurrentStep("success")
      setIsProcessing(false)
      setProcessingStage("")
    }, 3500)
  }

  const handleDownloadReceipt = () => {
    const receiptData = {
      bookingId: bookingId.toUpperCase(),
      flight: flight,
      timestamp: new Date().toISOString(),
      transactionHash: `${bookingId}...abc123`,
      gasFee: "0.001 ETH ($0.02)",
    }

    const dataStr = JSON.stringify(receiptData, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `traqora-receipt-${bookingId.toUpperCase()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const getStepProgress = () => {
    switch (currentStep) {
      case "details":
        return 25
      case "wallet":
        return 50
      case "confirm":
        return 75
      case "success":
        return 100
      default:
        return 0
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="px-3 py-1">
                {isWalletConnected ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2 text-secondary" />
                    {selectedWallet} Connected
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4 mr-2" />
                    Wallet Disconnected
                  </>
                )}
              </Badge>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Bar */}
        <div className="mb-8 animate-fade-in-slow">
          <div className="flex justify-between items-center mb-4">
            <h1 className="font-serif font-bold text-2xl text-foreground">Complete Your Booking</h1>
            <Badge variant="secondary" className="animate-scale-bounce">
              {getStepProgress()}% Complete
            </Badge>
          </div>
          <Progress value={getStepProgress()} className="h-3 transition-all duration-700 ease-out" />
          <div className="flex justify-between text-sm text-muted-foreground mt-2">
            <span
              className={`transition-all duration-300 ${currentStep === "details" ? "text-primary font-medium scale-105" : ""}`}
            >
              Flight Details
            </span>
            <span
              className={`transition-all duration-300 ${currentStep === "wallet" ? "text-primary font-medium scale-105" : ""}`}
            >
              Connect Wallet
            </span>
            <span
              className={`transition-all duration-300 ${currentStep === "confirm" ? "text-primary font-medium scale-105" : ""}`}
            >
              Confirm Booking
            </span>
            <span
              className={`transition-all duration-300 ${currentStep === "success" ? "text-primary font-medium scale-105" : ""}`}
            >
              Booking Complete
            </span>
          </div>
        </div>

        {/* Step 1: Flight Details */}
        {currentStep === "details" && (
          <div className="space-y-6 animate-slide-up">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <img
                    src={flight.logo || "/placeholder.svg"}
                    alt={`${flight.airline} logo`}
                    className="w-10 h-10 rounded-lg"
                  />
                  <div>
                    <h2 className="text-xl font-bold">{flight.airline}</h2>
                    <p className="text-muted-foreground">{flight.flightNumber}</p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Flight Route */}
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="font-bold text-2xl">{flight.departure}</p>
                    <p className="text-lg font-medium">{flight.from}</p>
                    <p className="text-muted-foreground">{flight.fromCity}</p>
                  </div>

                  <div className="flex-1 flex items-center justify-center px-8">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-3 h-3 bg-primary rounded-full"></div>
                      <div className="flex-1 h-px bg-border"></div>
                      <Plane className="h-5 w-5 text-primary" />
                      <div className="flex-1 h-px bg-border"></div>
                      <div className="w-3 h-3 bg-primary rounded-full"></div>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="font-bold text-2xl">{flight.arrival}</p>
                    <p className="text-lg font-medium">{flight.to}</p>
                    <p className="text-muted-foreground">{flight.toCity}</p>
                  </div>
                </div>

                <Separator />

                {/* Flight Info */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Date</p>
                        <p className="text-muted-foreground">{flight.date}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Duration</p>
                        <p className="text-muted-foreground">
                          {flight.duration} • {flight.stops}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Class</p>
                        <p className="text-muted-foreground">{flight.class}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Plane className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Aircraft</p>
                        <p className="text-muted-foreground">{flight.aircraft}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Luggage className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Baggage</p>
                        <p className="text-muted-foreground">{flight.baggage.carry}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Refund Policy</p>
                        <p className="text-muted-foreground">{flight.refundPolicy}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Amenities */}
                <div>
                  <h3 className="font-medium mb-3">Included Amenities</h3>
                  <div className="flex flex-wrap gap-2">
                    {flight.amenities.map((amenity, index) => (
                      <Badge key={index} variant="secondary">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Price Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Price Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Base fare (1 passenger)</span>
                    <span>
                      {flight.price} {flight.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxes & fees</span>
                    <span className="text-secondary">0 {flight.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform fee</span>
                    <span className="text-secondary">0 {flight.currency}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>
                      {flight.price} {flight.currency}
                    </span>
                  </div>
                </div>

                <Alert className="mt-4">
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Smart contract will automatically process refunds according to airline policy. No hidden fees or
                    intermediary charges.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Button
              size="lg"
              className="w-full hover-lift-3d transition-all duration-300"
              onClick={() => setCurrentStep("wallet")}
            >
              Proceed to Payment
              <Plane className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Step 2: Wallet Connection */}
        {currentStep === "wallet" && (
          <div className="space-y-6 animate-slide-up">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Connect Your Starknet Wallet</CardTitle>
                <p className="text-muted-foreground">
                  Choose your preferred Starknet wallet to complete the booking transaction.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-16 justify-start gap-4 bg-transparent hover-lift-3d transition-all duration-300"
                    onClick={() => handleConnectWallet("ArgentX")}
                    disabled={isProcessing}
                  >
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Wallet className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">ArgentX</p>
                      <p className="text-sm text-muted-foreground">Most popular Starknet wallet</p>
                    </div>
                    {isProcessing && selectedWallet === "ArgentX" && (
                      <div className="ml-auto">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                      </div>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    className="h-16 justify-start gap-4 bg-transparent hover-lift-3d transition-all duration-300"
                    onClick={() => handleConnectWallet("Braavos")}
                    disabled={isProcessing}
                  >
                    <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                      <Shield className="h-6 w-6 text-secondary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Braavos</p>
                      <p className="text-sm text-muted-foreground">Advanced security features</p>
                    </div>
                    {isProcessing && selectedWallet === "Braavos" && (
                      <div className="ml-auto">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-secondary"></div>
                      </div>
                    )}
                  </Button>
                </div>

                {isProcessing && (
                  <Alert className="animate-fade-in-slow">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <AlertDescription className="animate-pulse">{processingStage}</AlertDescription>
                    </div>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Confirm Booking */}
        {currentStep === "confirm" && (
          <div className="space-y-6 animate-slide-up">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-6 w-6 text-secondary" />
                  Wallet Connected
                </CardTitle>
                <p className="text-muted-foreground">
                  {selectedWallet} wallet connected successfully. Review and confirm your booking.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Connected Wallet</p>
                      <p className="text-sm text-muted-foreground">0x1234...5678</p>
                    </div>
                    <Badge variant="secondary">{selectedWallet}</Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Flight Cost</span>
                      <span>
                        {flight.price} {flight.currency}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated Gas Fee</span>
                      <span className="text-secondary">~0.001 ETH ($0.02)</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total Transaction</span>
                      <span>
                        {flight.price} {flight.currency} + Gas
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Your booking will be secured by a smart contract on Starknet. The transaction is irreversible once
                confirmed, but refunds are automatically processed according to airline policies.
              </AlertDescription>
            </Alert>

            <Button
              size="lg"
              className="w-full hover-lift-3d transition-all duration-300"
              onClick={handleConfirmBooking}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-2"></div>
                  {processingStage || "Processing Transaction..."}
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5 mr-2" />
                  Confirm Booking & Pay
                </>
              )}
            </Button>

            {isProcessing && (
              <Alert className="animate-fade-in-slow">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <AlertDescription className="animate-pulse">{processingStage}</AlertDescription>
                </div>
              </Alert>
            )}
          </div>
        )}

        {/* Step 4: Success */}
        {currentStep === "success" && (
          <div className="space-y-6 text-center animate-scale-bounce">
            <Card className="glass-card">
              <CardContent className="pt-8 pb-8">
                <div className="space-y-8">
                  {/* Success Icon */}
                  <div className="w-24 h-24 bg-secondary/10 rounded-full flex items-center justify-center mx-auto animate-glow-pulse">
                    <CheckCircle className="h-12 w-12 text-secondary" />
                  </div>

                  {/* Success Message */}
                  <div className="space-y-3">
                    <h2 className="font-serif font-bold text-3xl text-foreground">Booking Confirmed!</h2>
                    <p className="text-lg text-muted-foreground">
                      Your flight has been successfully booked and secured on the blockchain.
                    </p>
                  </div>

                  {/* Flight Summary */}
                  <div className="bg-muted/50 p-6 rounded-xl border border-border/50">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={flight.logo || "/placeholder.svg"}
                          alt={`${flight.airline} logo`}
                          className="w-8 h-8 rounded"
                        />
                        <div className="text-left">
                          <p className="font-bold text-lg">{flight.airline}</p>
                          <p className="text-sm text-muted-foreground">{flight.flightNumber}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="px-3 py-1">
                        {flight.class}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="text-center">
                        <p className="font-bold text-xl">{flight.departure}</p>
                        <p className="text-sm text-muted-foreground">{flight.from}</p>
                      </div>
                      <div className="flex-1 flex items-center justify-center px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                          <div className="flex-1 h-px bg-border"></div>
                          <Plane className="h-4 w-4 text-primary" />
                          <div className="flex-1 h-px bg-border"></div>
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-xl">{flight.arrival}</p>
                        <p className="text-sm text-muted-foreground">{flight.to}</p>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">{flight.date}</p>
                    </div>
                  </div>

                  {/* Receipt Details */}
                  <div className="bg-background p-6 rounded-xl border border-border shadow-sm">
                    <h3 className="font-bold text-lg mb-4 text-left">Booking Receipt</h3>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Booking ID</span>
                        <span className="font-mono font-bold">{bookingId.toUpperCase()}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Transaction Hash</span>
                        <span className="font-mono text-sm">{bookingId}...abc123</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Flight Cost</span>
                        <span className="font-bold">
                          {flight.price} {flight.currency}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Gas Fee</span>
                        <span>0.001 ETH ($0.02)</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Booking Date</span>
                        <span>{new Date().toLocaleDateString()}</span>
                      </div>

                      <Separator />

                      <div className="flex justify-between items-center text-lg font-bold">
                        <span>Total Paid</span>
                        <span>
                          {flight.price} {flight.currency}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* QR Code Section */}
                  <div className="bg-muted/30 p-6 rounded-xl">
                    <div className="flex items-center justify-center gap-6">
                      <div className="w-32 h-32 bg-background rounded-xl flex items-center justify-center shadow-sm">
                        <QrCode className="h-20 w-20 text-foreground" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-lg mb-2">Digital Ticket</h4>
                        <p className="text-sm text-muted-foreground mb-3">Present this QR code at airport check-in</p>
                        <Badge variant="outline" className="text-xs">
                          Blockchain Verified
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Button
                      variant="outline"
                      className="gap-2 bg-transparent hover-lift-3d"
                      onClick={handleDownloadReceipt}
                    >
                      <Download className="h-4 w-4" />
                      Download Receipt
                    </Button>

                    <Button variant="outline" className="gap-2 bg-transparent hover-lift-3d">
                      <ExternalLink className="h-4 w-4" />
                      View on Blockscout
                    </Button>

                    <Button asChild className="hover-lift-3d">
                      <a href="/dashboard">View My Bookings</a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Alert className="animate-fade-in-slow delay-500">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Your booking is now immutable and stored on Starknet. Automatic refunds will be processed if eligible
                according to the airline's policy. A confirmation email has been sent to your registered address.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  )
}
