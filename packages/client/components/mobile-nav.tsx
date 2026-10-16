"use client"

import { useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Plane, Menu, Wallet, CheckCircle, Home, Search, LayoutDashboard, LogOut } from "lucide-react"
// NEW: import real wallet hook and store from stellar-wallet-connect
import { useWallet, useWalletStore } from "@/lib/stellar-wallet-connect"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { address, isConnected, walletType } = useWalletStore()
  const { handleConnect, handleDisconnect } = useWallet()
  const [isConnecting, setIsConnecting] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search Flights", icon: Search },
    { href: "/dashboard", label: "My Bookings", icon: LayoutDashboard },
  ] as const

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden" aria-expanded={open} aria-controls="mobile-nav-content">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80" id="mobile-nav-content" aria-label="Mobile navigation menu">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <div className="flex items-center space-x-2 mb-8">
          <Plane className="h-8 w-8 text-primary" aria-hidden="true" />
          <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
        </div>

        <nav aria-label="Mobile navigation" className="space-y-4">
          {navItems.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className="flex items-center space-x-3 text-foreground hover:text-primary transition-colors p-3 rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={close}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}

          <div className="pt-4 border-t border-border space-y-3" role="region" aria-label="Wallet actions">
            {isConnected && address ? (
              <>
                <Badge variant="outline" className="w-full justify-center px-3 py-2">
                  <CheckCircle className="h-4 w-4 mr-2 text-primary" aria-hidden="true" />
                  {walletType || "Wallet"} Connected
                </Badge>
                <p className="text-xs text-muted-foreground text-center font-mono" aria-label={`Wallet address: ${address}`}>
                  {address.slice(0, 8)}...{address.slice(-4)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  aria-label="Disconnect wallet"
                  onClick={async () => {
                    await handleDisconnect()
                    setOpen(false)
                  }}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Disconnect Wallet
                </Button>
              </>
            ) : (
              <Button
                className="w-full gap-2"
                disabled={isConnecting}
                aria-busy={isConnecting}
                onClick={async () => {
                  setIsConnecting(true)
                  try {
                    await handleConnect()
                    setOpen(false)
                  } catch {
                  } finally {
                    setIsConnecting(false)
                  }
                }}
              >
                <Wallet className="h-4 w-4" aria-hidden="true" />
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
