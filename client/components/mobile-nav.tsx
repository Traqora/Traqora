"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Plane, Menu, Wallet, CheckCircle, Home, Search, LayoutDashboard } from "lucide-react"

interface MobileNavProps {
  isWalletConnected?: boolean
  walletType?: string
}

export function MobileNav({ isWalletConnected = false, walletType = "" }: MobileNavProps) {
  const [open, setOpen] = useState(false)

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

          <div className="pt-4 border-t border-border">
            <Badge variant="outline" className="w-full justify-center px-3 py-2">
              {isWalletConnected ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2 text-secondary" />
                  {walletType} Connected
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 mr-2" />
                  Connect Wallet
                </>
              )}
            </Badge>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
