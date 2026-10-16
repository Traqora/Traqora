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
    <header role="banner">
      <nav
        aria-label="Main navigation"
        className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center space-x-3">
              <div
                className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg"
                aria-hidden="true"
              >
                <Plane className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
              </div>
              <span className="font-serif font-black text-2xl text-foreground">Traqora</span>
            </div>

            <div className="hidden md:flex items-center space-x-8">
              <a
                href="/search"
                className="text-muted-foreground hover:text-primary transition-all duration-300 font-medium hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Search Flights
              </a>
              <a
                href="#how-it-works"
                className="text-muted-foreground hover:text-primary transition-all duration-300 font-medium hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                How It Works
              </a>

              {isConnected && (
                <a
                  href="/dashboard"
                  className="text-muted-foreground hover:text-primary transition-all duration-300 font-medium hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Dashboard
                </a>
              )}

              <div className="flex items-center space-x-4">
                <NavWalletButton />
              </div>
            </div>

            <div className="md:hidden">
              <MobileNav />
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
