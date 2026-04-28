"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Wallet, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { useAuth } from "@/lib/use-auth"
import { useWalletStore } from "@/lib/stellar-wallet-connect"
import Link from "next/link"

export default function AuthPage() {
  const router = useRouter()
  const { isConnected, address, walletType } = useWalletStore()
  const { authenticate, isAuthenticating, canAuthenticate } = useAuth()
  const [authSuccess, setAuthSuccess] = useState(false)

  const handleAuthenticate = async () => {
    const success = await authenticate()
    if (success) {
      setAuthSuccess(true)
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    }
  }

  if (authSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">Authentication Successful!</h2>
              <p className="text-muted-foreground mb-4">
                You are now logged in and will be redirected to your dashboard.
              </p>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Traqora</CardTitle>
          <CardDescription>
            Connect your Stellar wallet to access your account and book flights
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isConnected ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet first to continue with authentication.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">Wallet Connected</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {walletType || 'Stellar Wallet'}
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleAuthenticate}
                disabled={!canAuthenticate || isAuthenticating}
                className="w-full"
                size="lg"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Wallet className="mr-2 h-4 w-4" />
                    Sign In with Wallet
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Don't have a wallet?{" "}
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get Freighter
              </a>
            </p>
            <Link href="/">
              <Button variant="ghost" size="sm">
                Back to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}