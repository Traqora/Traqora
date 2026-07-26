"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import {
  Plane,
  CheckCircle,
  Wallet,
  Shield,
  Leaf,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  QrCode,
  Download,
  ExternalLink,
  FileText
} from "lucide-react"

import { SeatSelector } from "@/components/booking/seat-selector"
import { BookingSummary } from "@/components/booking/booking-summary"
import { InsuranceSelector } from "@/components/booking/insurance-selector"
import { CarbonFootprintDisplay } from "@/components/booking/carbon-footprint-display"
import { CarbonOffsetSelector } from "@/components/booking/carbon-offset-selector"
import { FareRulesSummary, FareRule } from "@/components/booking/fare-rules-summary"
import { CurrencySelector } from "@/components/currency-selector"
import { PassengerDetailsForm, PassengerData, validatePassengers } from "@/components/booking/passenger-details-form"
import { useBooking } from "@/hooks/use-booking"
import { useFlightSearch } from "@/hooks/use-flight-search"
import { useWallet, useWalletStore } from "@/lib/stellar-wallet-connect"
import { cn } from "@/lib/utils"
import {
  InsuranceCoverageType,
  InsurancePolicy,
  purchaseInsurance,
  estimateFootprint,
  purchaseOffset,
  CarbonFootprint,
} from "@/lib/api"
import {
  type CurrencyCode,
  getCurrencyFromStorage,
  setCurrencyToStorage,
} from "@/lib/currency"

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
}

type BookingStep = "details" | "seats" | "insurance" | "carbon" | "wallet" | "confirm" | "success"

export default function BookFlightPage() {
  const params = useParams()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<BookingStep>("details")
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("USD")
  const [rates, setRates] = useState<Record<string, number> | undefined>(undefined)
  
  const { 
    isProcessing, 
    selectedSeat, 
    selectSeat,
    connectWallet,
    createBooking,
    signAndSubmitTransaction,
    booking
  } = useBooking()

  const { flights } = useFlightSearch()
  const { isConnected: isWalletConnected, address, walletType } = useWalletStore()
  const { handleConnect } = useWallet()

  const [bookingId, setBookingId] = useState("")
  const [selectedCoverage, setSelectedCoverage] = useState<InsuranceCoverageType | null>(null)
  const [insurancePolicy, setInsurancePolicy] = useState<InsurancePolicy | null>(null)
  const [isPurchasingInsurance, setIsPurchasingInsurance] = useState(false)
  const [isCarbonNeutral, setIsCarbonNeutral] = useState(false)
  const [carbonFootprint, setCarbonFootprint] = useState<CarbonFootprint | null>(null)
  const [isFootprintLoading, setIsFootprintLoading] = useState(false)
  const [selectedOffsetProjectId, setSelectedOffsetProjectId] = useState<string | null>(null)
  const [offsetCostCents, setOffsetCostCents] = useState(0)
  const [offsetCertificate, setOffsetCertificate] = useState<any>(null)
  const [isPurchasingOffset, setIsPurchasingOffset] = useState(false)
  const [passengers, setPassengers] = useState<PassengerData[]>([
    { firstName: "", lastName: "", email: "", phone: "" },
  ])
  const [passengerErrors, setPassengerErrors] = useState<ReturnType<typeof validatePassengers>>([])
  const [fareRules, setFareRules] = useState<FareRule[]>([])

  useEffect(() => {
    const airlineCode = flight.airline.substring(0, 2).toUpperCase()
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
    fetch(`${apiBase}/api/flights/fare-rules?airline=${encodeURIComponent(airlineCode)}&class=${encodeURIComponent(flight.class)}`)
      .then(res => res.json())
      .then(body => {
        if (body.success && body.data) {
          setFareRules(body.data)
        }
      })
      .catch(() => {})
  }, [flight.airline, flight.class])

  useEffect(() => {
    const stored = getCurrencyFromStorage()
    setDisplayCurrency(stored)
  }, [])

  useEffect(() => {
    if (displayCurrency === "USD") {
      setRates(undefined)
      return
    }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
    fetch(`${apiBase}/api/flights/currencies/rates?base=USD`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setRates(data.data.rates)
        }
      })
      .catch(() => {
        setRates(undefined)
      })
  }, [displayCurrency])

  useEffect(() => {
    if (!(flight as any).id) return
    setIsFootprintLoading(true)
    estimateFootprint((flight as any).id, (flight as any).class || "economy")
      .then((data) => setCarbonFootprint(data))
      .catch(() => {})
      .finally(() => setIsFootprintLoading(false))
  }, [(flight as any).id, (flight as any).class])

  const handleCurrencyChange = (currency: CurrencyCode) => {
    setDisplayCurrency(currency)
    setCurrencyToStorage(currency)
  }

  const flight = flights.find(f => f.id === params.id) || mockFlightDetails

  const steps: { id: BookingStep; label: string }[] = [
    { id: "details", label: "Flight Details" },
    { id: "seats", label: "Seat Selection" },
    { id: "insurance", label: "Travel Insurance" },
    { id: "carbon", label: "Carbon Offsets" },
    { id: "wallet", label: "Connect Wallet" },
    { id: "confirm", label: "Confirmation" },
    { id: "success", label: "Success" }
  ]

  const getStepProgress = () => {
    const index = steps.findIndex(s => s.id === currentStep)
    return ((index + 1) / steps.length) * 100
  }

  const nextStep = () => {
    const index = steps.findIndex(s => s.id === currentStep)
    if (index < steps.length - 1) {
      setCurrentStep(steps[index + 1].id)
    }
  }

  const prevStep = () => {
    const index = steps.findIndex(s => s.id === currentStep)
    if (index > 0) {
      setCurrentStep(steps[index - 1].id)
    }
  }

  const handleWalletConnect = async () => {
    try {
      await handleConnect()
      if (useWalletStore.getState().isConnected) {
        setCurrentStep("confirm")
      }
    } catch (error) {
      console.error("Wallet connection failed", error)
    }
  }

  const handlePassengerChange = (index: number, data: PassengerData) => {
    const updated = [...passengers]
    updated[index] = data
    setPassengers(updated)
  }

  const handleAddPassenger = () => {
    setPassengers([...passengers, { firstName: "", lastName: "", email: "", phone: "" }])
  }

  const handleRemovePassenger = (index: number) => {
    if (passengers.length <= 1) return
    setPassengers(passengers.filter((_, i) => i !== index))
  }

  const validateStep = (step: BookingStep): boolean => {
    if (step === "details") {
      const errors = validatePassengers(passengers)
      setPassengerErrors(errors)
      return errors.every((e) => Object.keys(e).length === 0)
    }
    return true
  }

  const handleNextStep = () => {
    if (!validateStep(currentStep)) return
    nextStep()
  }

  const handleFinalConfirm = async () => {
    const newBookingId = "TRAQ-" + Math.random().toString(36).substring(2, 9).toUpperCase()
    setBookingId(newBookingId)

    if (selectedCoverage) {
      setIsPurchasingInsurance(true)
      try {
        const policy = await purchaseInsurance({
          bookingId: newBookingId,
          tripCostCents: Math.round(parseFloat(flight.price) * 100),
          destination: flight.to,
          coverageType: selectedCoverage,
        })
        setInsurancePolicy(policy)
      } catch (error) {
        console.error("Insurance purchase failed", error)
      } finally {
        setIsPurchasingInsurance(false)
      }
    }

    if (isCarbonNeutral && selectedOffsetProjectId && carbonFootprint) {
      setIsPurchasingOffset(true)
      try {
        const walletState = useWalletStore.getState()
        const userId = walletState.address || "anonymous"
        const cert = await purchaseOffset({
          userId,
          flightId: (flight as any).id,
          projectId: selectedOffsetProjectId,
          amountCents: offsetCostCents,
          bookingId: newBookingId,
        })
        setOffsetCertificate(cert)
      } catch (error) {
        console.error("Offset purchase failed", error)
      } finally {
        setIsPurchasingOffset(false)
      }
    }

    setCurrentStep("success")
  }

  return (
    <div className="min-h-screen bg-background">
      <header role="banner">
        <nav aria-label="Main navigation" className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-2 cursor-pointer" onClick={() => router.push("/")} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") router.push("/") }} aria-label="Go to homepage">
                <Plane className="h-8 w-8 text-primary" aria-hidden="true" />
                <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
              </div>
              <div className="flex items-center space-x-4">
                <CurrencySelector value={displayCurrency} onValueChange={handleCurrencyChange} />
                <Badge variant={isWalletConnected ? "secondary" : "outline"} className="px-3 py-1">
                  {isWalletConnected ? (
                    <><CheckCircle className="h-4 w-4 mr-2 text-green-500" aria-hidden="true" /> {walletType} Connected</>
                  ) : (
                    <><Wallet className="h-4 w-4 mr-2" aria-hidden="true" /> Wallet Disconnected</>
                  )}
                </Badge>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-12">
            <div className="flex justify-between items-center mb-6">
              <h1 className="font-serif font-bold text-3xl text-foreground">
                {steps.find(s => s.id === currentStep)?.label}
              </h1>
              <Badge variant="outline" className="text-sm font-medium px-4 py-1" aria-label={`Step ${steps.findIndex(s => s.id === currentStep) + 1} of ${steps.length}`}>
                Step {steps.findIndex(s => s.id === currentStep) + 1} of {steps.length}
              </Badge>
            </div>
          
          <div className="relative">
            <Progress value={getStepProgress()} className="h-2" />
            <div className="absolute top-0 left-0 w-full flex justify-between -translate-y-1/2 mt-1">
              {steps.map((s, i) => (
                <div 
                  key={s.id} 
                  className={cn(
                    "w-4 h-4 rounded-full border-2 transition-all duration-300",
                    steps.findIndex(step => step.id === currentStep) >= i 
                      ? "bg-primary border-primary scale-110 shadow-glow" 
                      : "bg-background border-muted"
                  )}
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-between mt-4">
            {steps.map((s, i) => (
              <span 
                key={s.id} 
                className={cn(
                  "text-xs font-medium uppercase tracking-wider hidden sm:block",
                  currentStep === s.id ? "text-primary" : "text-muted-foreground/60"
                )}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-8">
            
            {currentStep === "details" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <BookingSummary flight={flight} passengerCount={passengers.length} displayCurrency={displayCurrency} rates={rates} />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Passenger Details</h3>
                    <Button variant="outline" size="sm" onClick={handleAddPassenger}>
                      Add Passenger
                    </Button>
                  </div>
                  {passengers.map((p, i) => (
                    <PassengerDetailsForm
                      key={i}
                      passenger={p}
                      index={i}
                      onChange={handlePassengerChange}
                      onRemove={handleRemovePassenger}
                      showRemove={passengers.length > 1}
                      errors={passengerErrors[i]}
                      airline={flight.airline}
                    />
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button size="lg" onClick={handleNextStep} className="group px-8">
                    Select Seats
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>
            )}

            {currentStep === "seats" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <SeatSelector 
                  cabinClass={flight.class} 
                  onSeatSelect={(seat) => selectSeat(seat.id, seat.price)}
                  selectedSeatId={selectedSeat?.id}
                  displayCurrency={displayCurrency}
                  rates={rates}
                />
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={prevStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button size="lg" onClick={nextStep} disabled={!selectedSeat}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Travel Insurance */}
            {currentStep === "insurance" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <InsuranceSelector
                  tripCostCents={Math.round(parseFloat(flight.price) * 100)}
                  destination={flight.to}
                  selectedCoverage={selectedCoverage}
                  onSelectCoverage={setSelectedCoverage}
                />
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={prevStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button size="lg" onClick={nextStep}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Carbon Offsets */}
            {currentStep === "carbon" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <CarbonFootprintDisplay
                  totalCO2kg={carbonFootprint?.totalCO2kg ?? null}
                  distanceKm={carbonFootprint?.distanceKm ?? null}
                  cabinClassFactor={carbonFootprint?.cabinClassFactor ?? null}
                  calculationMethod={carbonFootprint?.calculationMethod ?? null}
                  isLoading={isFootprintLoading}
                />
                <CarbonOffsetSelector
                  footprintKg={carbonFootprint?.totalCO2kg ?? null}
                  flightId={(flight as any).id}
                  isCarbonNeutral={isCarbonNeutral}
                  onToggleCarbonNeutral={setIsCarbonNeutral}
                  onOffsetSelected={(projectId, costCents) => {
                    setSelectedOffsetProjectId(projectId)
                    setOffsetCostCents(costCents)
                  }}
                />
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={prevStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button size="lg" onClick={nextStep}>
                    Continue to Payment
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Wallet Connection */}
            {currentStep === "wallet" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
                <div className="max-w-md mx-auto space-y-8">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <Wallet className="h-10 w-10 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Secure Your Booking</h2>
                    <p className="text-muted-foreground">
                      Traqora uses blockchain technology to ensure your tickets are authentic and refunds are automated. Connect your Stellar wallet to proceed.
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    variant="default" 
                    className="w-full h-14 text-lg shadow-xl" 
                    onClick={handleWalletConnect}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Connecting..." : "Connect Stellar Wallet"}
                  </Button>
                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Encrypted</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Verified</span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === "confirm" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Alert className="bg-primary/5 border-primary/20">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-primary font-medium">
                    Wallet connected: {address?.slice(0, 8)}...{address?.slice(-4)} ({walletType})
                  </AlertDescription>
                </Alert>

                <div className="bg-card rounded-2xl border border-border p-6 space-y-6 shadow-sm">
                  <h3 className="text-xl font-bold">Payment Method</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 border-2 border-primary bg-primary/5 rounded-xl flex items-center gap-4 cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold">USDC on Stellar</p>
                        <p className="text-xs text-muted-foreground">Instant & low fee</p>
                      </div>
                    </div>
                    <div className="p-4 border-2 border-transparent bg-muted/50 rounded-xl flex items-center gap-4 cursor-not-allowed opacity-50">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                        <Plane className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold">XLM Lumens</p>
                        <p className="text-xs text-muted-foreground">Coming soon</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={prevStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleFinalConfirm}
                    disabled={isPurchasingInsurance || isPurchasingOffset}
                    className="px-12 shadow-lg bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isPurchasingInsurance || isPurchasingOffset ? "Processing..." : "Confirm & Pay"}
                  </Button>
                </div>
              </div>
            )}

            {currentStep === "success" && (
              <div className="space-y-8 animate-in zoom-in duration-500">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                  </div>
                  <h2 className="text-3xl font-bold font-serif">Booking Confirmed!</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Your flight to {flight.toCity} is all set. We've sent a confirmation to your email and secured your ticket on the blockchain.
                  </p>
                </div>

                <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-2xl">
                  <div className="bg-primary p-6 text-primary-foreground flex justify-between items-center">
                    <div>
                      <p className="text-xs uppercase tracking-widest opacity-80">Booking Reference</p>
                      <p className="text-2xl font-mono font-bold">{bookingId}</p>
                    </div>
                    <QrCode className="h-12 w-12" />
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-bold">Passenger</p>
                        <p className="font-medium">John Doe</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-bold">Seat</p>
                        <p className="font-medium">{selectedSeat?.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-bold">Departure</p>
                        <p className="font-medium">{flight.date} at {flight.departure}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-bold">Terminal</p>
                        <p className="font-medium">Terminal 4, Gate B23</p>
                      </div>
                    </div>
                    <Separator className="my-6" />
                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1">
                        <Download className="mr-2 h-4 w-4" /> Receipt
                      </Button>
                      <Button variant="outline" className="flex-1">
                        <ExternalLink className="mr-2 h-4 w-4" /> Explorer
                      </Button>
                    </div>
                  </div>
                </div>

                {insurancePolicy && (
                  <div className="bg-card rounded-2xl border border-border p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        <span className="font-bold">Travel Insurance</span>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Insured &middot; {insurancePolicy.coverageType}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Policy {insurancePolicy.providerPolicyRef} is active. Premium is fully refundable until{" "}
                      {new Date(insurancePolicy.refundEligibleUntil).toLocaleString()}.
                    </p>
                    <div className="flex gap-3">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/v1/insurance/policy/${insurancePolicy.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <FileText className="mr-2 h-4 w-4" /> Download Policy PDF
                        </Button>
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/insurance/claims?policyId=${insurancePolicy.id}`)}
                      >
                        File a Claim
                      </Button>
                    </div>
                  </div>
                )}

                {offsetCertificate && (
                  <div className="bg-card rounded-2xl border border-green-200 p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Leaf className="h-5 w-5 text-green-600" />
                        <span className="font-bold">Carbon Offset</span>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Carbon Neutral
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This flight has been offset through {offsetCertificate.projectName}.
                      {offsetCertificate.co2Kg} kg CO₂ offset &middot; Certificate: {offsetCertificate.certificateRef}
                    </p>
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/v1/carbon/certificate/${offsetCertificate.purchaseId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="outline" size="sm">
                        <FileText className="mr-2 h-4 w-4" /> Download Certificate
                      </Button>
                    </a>
                  </div>
                )}

                <Button className="w-full h-12" variant="secondary" onClick={() => router.push("/dashboard")}>
                  Go to Dashboard
                </Button>
              </div>
            )}
          </div>

          {currentStep !== "success" && (
            <div className="lg:col-span-1 sticky top-24 space-y-6">
              <BookingSummary
                flight={flight}
                passengerCount={passengers.length}
                selectedSeat={selectedSeat || undefined}
                insurance={
                  selectedCoverage
                    ? {
                        coverageType: selectedCoverage,
                        premiumCents:
                          insurancePolicy?.premiumCents ??
                          Math.round(parseFloat(flight.price) * 100 * 0.05),
                      }
                    : undefined
                }
                carbonOffset={
                  isCarbonNeutral && offsetCostCents > 0
                    ? { costCents: offsetCostCents }
                    : undefined
                }
                displayCurrency={displayCurrency}
                rates={rates}
                className="bg-card shadow-2xl"
              />
              
              {fareRules.length > 0 && (
                <FareRulesSummary fareRules={fareRules} airlineName={flight.airline} />
              )}

              <div className="p-4 bg-muted/30 rounded-xl border border-border/50 text-[10px] text-muted-foreground flex items-start gap-2">
                <Shield className="h-3 w-3 shrink-0 text-primary mt-0.5" />
                <p>Traqora Smart Contract V2.1. Verified by OpenZeppelin. Audited 2024.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
