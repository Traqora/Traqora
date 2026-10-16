/**
 * NavWalletButton - Displays a connect / disconnect wallet button
 * in the navigation bar. Uses the real useWallet hook and
 * useWalletStore from stellar-wallet-connect.
 */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Wallet, CheckCircle, Copy, ExternalLink, LogOut, LayoutDashboard, Loader2 } from "lucide-react"
// NEW: import real wallet hook and store
import { useWallet, useWalletStore } from "@/lib/stellar-wallet-connect"
import { useAuthStore } from "@/lib/auth-store"
import { useAuth } from "@/lib/use-auth"

export function NavWalletButton() {
  // NEW: use real wallet connection hook
  const { handleConnect, handleDisconnect } = useWallet()
  // NEW: read wallet state from Zustand store
  const { address, isConnected, network, walletType } = useWalletStore()
  // NEW: read auth state
  const { isAuthenticated } = useAuthStore()
  // NEW: use auth hook
  const { authenticate, logout } = useAuth()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)

  const onConnect = async () => {
    setIsConnecting(true)
    try {
      // NEW: trigger the real StellarWalletsKit auth modal
      await handleConnect()
    } catch (error) {
      console.error("Wallet connection failed:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  const onAuthenticate = async () => {
    setIsAuthenticating(true)
    try {
      await authenticate()
    } catch (error) {
      console.error("Authentication failed:", error)
    } finally {
      setIsAuthenticating(false)
    }
  }

  const onLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error("Logout failed:", error)
    }
  }

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    }
  }

  const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""

  if (isConnected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`gap-2 border-primary/30 hover:border-primary/50 transition-all duration-300 hover:scale-105 ${
              isAuthenticated ? 'bg-primary/5' : ''
            }`}
            aria-label={`Wallet: ${truncatedAddress}${isAuthenticated ? ', authenticated' : ''}`}
          >
            <CheckCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-mono text-sm">{truncatedAddress}</span>
            {isAuthenticated && (
              <div className="h-2 w-2 bg-green-500 rounded-full" aria-label="Authenticated" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-3 py-2" role="region" aria-label="Wallet information">
            <p className="text-sm font-medium text-foreground">
              {walletType || "Stellar Wallet"} {isAuthenticated && "(Authenticated)"}
            </p>
            <p className="text-xs text-muted-foreground font-mono" aria-label={`Address: ${address}`}>{truncatedAddress}</p>
            <Badge variant="secondary" className="mt-1 text-xs">
              {(network || "testnet").toString().toUpperCase()}
            </Badge>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyAddress} className="gap-2 cursor-pointer" aria-label={copyFeedback ? "Address copied" : "Copy wallet address"}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copyFeedback ? "Copied!" : "Copy Address"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2 cursor-pointer">
            <a href="/dashboard">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </a>
          </DropdownMenuItem>
          {!isAuthenticated && (
            <>
              <DropdownMenuItem onClick={onAuthenticate} className="gap-2 cursor-pointer" disabled={isAuthenticating} aria-busy={isAuthenticating}>
                {isAuthenticating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {isAuthenticating ? "Authenticating..." : "Authenticate"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {isAuthenticated && (
            <>
              <DropdownMenuItem onClick={onLogout} className="gap-2 cursor-pointer text-orange-600">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign Out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild className="gap-2 cursor-pointer">
            <a
              href={
                network === "testnet"
                  ? `https://laboratory.stellar.org/#explorer?resource=account&values=${address}`
                  : `https://stellar.expert/explorer/public/account/${address}`
              }
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View account on Stellar Explorer (opens in new tab)"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View on Explorer
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDisconnect} className="gap-2 cursor-pointer text-destructive">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button
      onClick={onConnect}
      disabled={isConnecting}
      aria-busy={isConnecting}
      aria-label={isConnecting ? "Connecting wallet" : "Connect wallet"}
      className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
    >
      {isConnecting ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" aria-hidden="true" />
          Connecting...
        </>
      ) : (
        <>
          <Wallet className="h-4 w-4 mr-2" aria-hidden="true" />
          Connect Wallet
        </>
      )}
    </Button>
  )
}
