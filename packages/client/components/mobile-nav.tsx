"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Plane, Menu, Wallet, CheckCircle, Home, Search, LayoutDashboard, LogOut } from "lucide-react"
// NEW: import real wallet hook and store from stellar-wallet-connect
import { useWallet, useWalletStore } from "@/lib/stellar-wallet-connect"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  // NEW: read real wallet state from Zustand store
  const { address, isConnected, walletType } = useWalletStore()
  // NEW: use real wallet connect/disconnect handlers
  const { handleConnect, handleDisconnect } = useWallet()
  const [isConnecting, setIsConnecting] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <div className="flex items-center space-x-2 mb-8">
          <Plane className="h-8 w-8 text-primary" />
          <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
        </div>

        <nav className="space-y-4">
          <a
            href="/"
            className="flex items-center space-x-3 text-foreground hover:text-primary transition-colors p-3 rounded-lg hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </a>

          <a
            href="/search"
            className="flex items-center space-x-3 text-foreground hover:text-primary transition-colors p-3 rounded-lg hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <Search className="h-5 w-5" />
            <span>Search Flights</span>
          </a>

          <a
            href="/dashboard"
            className="flex items-center space-x-3 text-foreground hover:text-primary transition-colors p-3 rounded-lg hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>My Bookings</span>
          </a>

          {/* NEW: real wallet connect/disconnect actions in mobile nav */}
          <div className="pt-4 border-t border-border space-y-3">
            {isConnected && address ? (
              <>
                <Badge variant="outline" className="w-full justify-center px-3 py-2">
                  <CheckCircle className="h-4 w-4 mr-2 text-primary" />
                  {walletType || "Wallet"} Connected
                </Badge>
                <p className="text-xs text-muted-foreground text-center font-mono">
                  {address.slice(0, 8)}...{address.slice(-4)}
                </p>
                {/* NEW: disconnect button in mobile nav */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={async () => {
                    await handleDisconnect()
                    setOpen(false)
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect Wallet
                </Button>
              </>
            ) : (
              /* NEW: connect button triggers real StellarWalletsKit auth modal */
              <Button
                className="w-full gap-2"
                disabled={isConnecting}
                onClick={async () => {
                  setIsConnecting(true)
                  try {
                    await handleConnect()
                    setOpen(false)
                  } catch {
                    // user cancelled or error - silently handled
                  } finally {
                    setIsConnecting(false)
                  }
                }}
              >
                <Wallet className="h-4 w-4" />
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
