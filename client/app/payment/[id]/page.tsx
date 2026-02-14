"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Plane, CreditCard, Wallet, Shield, CheckCircle, ArrowLeft, Lock, Zap } from "lucide-react"

// Mock flight data
const mockFlightDetails = {
  id: "1",
  airline: "Delta Airlines",
  flightNumber: "DL 1234",
  from: "JFK",
  to: "LAX",
  fromCity: "New York",
  toCity: "Los Angeles",
  departure: "08:30",
  arrival: "11:45",
  date: "December 15, 2024",
  price: "450",
  currency: "USDC",
}

type PaymentMethod = "crypto" | "card"

export default function PaymentPage() {
  const params = useParams()
  const router = useRouter()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("crypto")
  const [selectedCrypto, setSelectedCrypto] = useState("USDC")
  const [isProcessing, setIsProcessing] = useState(false)
  const [walletConnected, setWalletConnected] = useState(false)

  const flight = mockFlightDetails

  const cryptoOptions = [
    { symbol: "USDC", name: "USD Coin", price: flight.price, icon: "💰" },
    { symbol: "ETH", name: "Ethereum", price: "0.18", icon: "⟠" },
    { symbol: "XLM", name: "Stellar Lumens", price: "850", icon: "⭐" },
  ]

  const handleConnectWallet = async () => {
    setIsProcessing(true)
    // Simulate wallet connection
    setTimeout(() => {
      setWalletConnected(true)
      setIsProcessing(false)
    }, 2000)
  }

  const handlePayment = async () => {
    setIsProcessing(true)
    // Simulate payment processing
    setTimeout(() => {
      router.push(`/book/${params.id}?step=success`)
    }, 3000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center space-x-2">
                <Plane className="h-8 w-8 text-primary" />
                <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
              </div>
            </div>
            <Badge variant="outline" className="px-3 py-1">
              <Lock className="h-4 w-4 mr-2" />
              Secure Payment
            </Badge>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Payment Form */}
          <div className="space-y-6">
            <div>
              <h1 className="font-serif font-bold text-2xl text-foreground mb-2">Complete Payment</h1>
              <p className="text-muted-foreground">Choose your preferred payment method to secure your booking.</p>
            </div>

            {/* Payment Method Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                  <div className="flex items-center space-x-2 p-4 border rounded-lg">
                    <RadioGroupItem value="crypto" id="crypto" />
                    <Label htmlFor="crypto" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <Wallet className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">Cryptocurrency</p>
                          <p className="text-sm text-muted-foreground">Pay with USDC, ETH, or XLM</p>
                        </div>
                        <Badge variant="secondary" className="ml-auto">
                          <Zap className="h-3 w-3 mr-1" />
                          Instant
                        </Badge>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 p-4 border rounded-lg opacity-50">
                    <RadioGroupItem value="card" id="card" disabled />
                    <Label htmlFor="card" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Credit/Debit Card</p>
                          <p className="text-sm text-muted-foreground">Coming soon</p>
                        </div>
                        <Badge variant="outline" className="ml-auto">
                          Soon
                        </Badge>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Crypto Payment Options */}
            {paymentMethod === "crypto" && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Cryptocurrency</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={selectedCrypto} onValueChange={setSelectedCrypto}>
                    {cryptoOptions.map((crypto) => (
                      <div key={crypto.symbol} className="flex items-center space-x-2 p-4 border rounded-lg">
                        <RadioGroupItem value={crypto.symbol} id={crypto.symbol} />
                        <Label htmlFor={crypto.symbol} className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{crypto.icon}</span>
                              <div>
                                <p className="font-medium">{crypto.name}</p>
                                <p className="text-sm text-muted-foreground">{crypto.symbol}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">
                                {crypto.price} {crypto.symbol}
                              </p>
                              {crypto.symbol !== "USDC" && <p className="text-sm text-muted-foreground">≈ $450 USD</p>}
                            </div>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            )}

            {/* Wallet Connection */}
            {paymentMethod === "crypto" && (
              <Card>
                <CardHeader>
                  <CardTitle>Wallet Connection</CardTitle>
                </CardHeader>
                <CardContent>
                  {!walletConnected ? (
                    <div className="space-y-4">
                      <p className="text-muted-foreground">Connect your Stellar wallet to proceed with payment.</p>
                      <div className="grid gap-3">
                        <Button
                          variant="outline"
                          size="lg"
                          className="justify-start gap-3 bg-transparent"
                          onClick={handleConnectWallet}
                          disabled={isProcessing}
                        >
                          <Wallet className="h-5 w-5" />
                          Connect Freighter
                          {isProcessing && (
                            <div className="ml-auto animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          className="justify-start gap-3 bg-transparent"
                          onClick={handleConnectWallet}
                          disabled={isProcessing}
                        >
                          <Shield className="h-5 w-5" />
                          Connect Albedo
                          {isProcessing && (
                            <div className="ml-auto animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-secondary" />
                        <div>
                          <p className="font-medium">Wallet Connected</p>
                          <p className="text-sm text-muted-foreground">0x1234...5678</p>
                        </div>
                        <Badge variant="secondary" className="ml-auto">
                          Freighter
                        </Badge>
                      </div>

                      <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertDescription>
                          Your payment will be processed securely through a smart contract on Stellar.
                        </AlertDescription>
                      </Alert>

                      <Button size="lg" className="w-full" onClick={handlePayment} disabled={isProcessing}>
                        {isProcessing ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-2"></div>
                            Processing Payment...
                          </>
                        ) : (
                          <>
                            <Shield className="h-5 w-5 mr-2" />
                            Pay {cryptoOptions.find((c) => c.symbol === selectedCrypto)?.price} {selectedCrypto}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Flight Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Plane className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{flight.airline}</p>
                    <p className="text-sm text-muted-foreground">{flight.flightNumber}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-lg">{flight.departure}</p>
                    <p className="text-sm text-muted-foreground">{flight.from}</p>
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="w-8 h-px bg-border"></div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{flight.arrival}</p>
                    <p className="text-sm text-muted-foreground">{flight.to}</p>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">{flight.date}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Flight fare</span>
                    <span>
                      {flight.price} {flight.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform fee</span>
                    <span className="text-secondary">0 {flight.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gas fee (estimated)</span>
                    <span className="text-muted-foreground">~0.001 ETH</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>
                      {flight.price} {flight.currency}
                    </span>
                  </div>
                </div>

                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Zero platform fees. Direct payment to airline through smart contract.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-secondary" />
                    <span className="text-sm">Smart contract protection</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-secondary" />
                    <span className="text-sm">Encrypted transactions</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-secondary" />
                    <span className="text-sm">Automatic refund processing</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
