"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Leaf, ArrowLeft } from "lucide-react"
import { SustainabilityDashboard } from "@/components/sustainability-dashboard"
import { useWalletStore } from "@/lib/stellar-wallet-connect"
import { cn } from "@/lib/utils"

export default function SustainabilityPage() {
  const router = useRouter()
  const { isConnected, address } = useWalletStore()
  const [userId, setUserId] = useState<string>("")

  useEffect(() => {
    if (isConnected && address) {
      setUserId(address)
    } else {
      setUserId("anonymous")
    }
  }, [isConnected, address])

  return (
    <div className="min-h-screen bg-background">
      <header role="banner">
        <nav aria-label="Main navigation" className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-2 cursor-pointer" onClick={() => router.push("/")} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") router.push("/") }} aria-label="Go to homepage">
                <Leaf className="h-8 w-8 text-green-600" aria-hidden="true" />
                <span className="font-serif font-bold text-2xl text-foreground">Sustainability</span>
              </div>
              <Button variant="ghost" onClick={() => router.push("/")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </div>
          </div>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SustainabilityDashboard userId={userId} />
      </div>
    </div>
  )
}
