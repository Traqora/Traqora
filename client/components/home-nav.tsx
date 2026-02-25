/**
 * HomeNav - Client component for the homepage navigation bar.
 * Replaces the static nav so we can use the real wallet connect button.
 */
"use client"

import { Button } from "@/components/ui/button"
import { Plane, Menu } from "lucide-react"
// NEW: import the real wallet button and mobile nav with wallet support
import { NavWalletButton } from "@/components/nav-wallet-button"
import { MobileNav } from "@/components/mobile-nav"
// NEW: import wallet store to check connection status for the Dashboard link
import { useWalletStore } from "@/lib/stellar-wallet-connect"

export function HomeNav() {
  // NEW: read wallet connection state to conditionally show Dashboard link
  const { isConnected } = useWalletStore()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
              <Plane className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-serif font-black text-2xl text-foreground">Traqora</span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <a
              href="/search"
              className="text-muted-foreground hover:text-primary transition-all duration-300 font-medium hover:scale-105"
            >
              Search Flights
            </a>
            <a
              href="#how-it-works"
              className="text-muted-foreground hover:text-primary transition-all duration-300 font-medium hover:scale-105"
            >
              How It Works
            </a>

            {/* NEW: show Dashboard link when wallet is connected */}
            {isConnected && (
              <a
                href="/dashboard"
                className="text-muted-foreground hover:text-primary transition-all duration-300 font-medium hover:scale-105"
              >
                Dashboard
              </a>
            )}

            <div className="flex items-center space-x-4">
              {/* NEW: real wallet connect / disconnect button */}
              <NavWalletButton />
            </div>
          </div>

          {/* Mobile menu button - NEW: now uses MobileNav with real wallet state */}
          <div className="md:hidden">
            <MobileNav />
          </div>
        </div>
      </div>
    </nav>
  )
}
