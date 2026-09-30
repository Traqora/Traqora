"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

import Link from "next/link"

export default function AuthPage() {
  const router = useRouter()
  const { isConnected, address, walletType } = useWalletStore()
  const { authenticate, isAuthenticating, canAuthenticate } = useAuth()
  const { isAuthenticated, biometric, setBiometric } = useAuthStore()
  const [authSuccess, setAuthSuccess] = useState(false)


  const handleAuthenticate = async () => {
    try {
      const result = await authenticate()
      if (result && typeof result === 'object' && 'requiresTwoFactor' in result) {
        setRequiresTwoFactor(true)
        setPendingWalletAddress(result.walletAddress)
      } else if (result) {
        setAuthSuccess(true)
        setTimeout(() => {
          router.push('/dashboard')
        }, 1500)
      }
    } catch (error) {
      console.error('Authentication error:', error)
    }
  }


    }

    setIsVerifyingTwoFactor(true)
    setTwoFactorError('')

    try {
      const tokens = await AuthService.verifyTwoFactor(
        pendingWalletAddress,
        twoFactorToken.trim(),
        isBackupCode
      )
      
      // Store tokens
      const { useAuthStore } = await import('@/lib/auth-store')
      useAuthStore.getState().setTokens(tokens)
      
      setAuthSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    } catch (error: any) {
      setTwoFactorError(error.message || 'Invalid code')
    } finally {
      setIsVerifyingTwoFactor(false)
    }
  }

  const handleRegisterBiometric = async (customName?: string) => {
    if (!isAuthenticated || !address) return
    setIsRegistering(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const credential = await AuthService.registerBiometric(address, customName)
      setEnrolledCredentials((prev) => [...prev, credential])
      setBiometric({ enabled: true })
      const typeLabel = platformType !== "unknown" ? platformType : credential.type
      setSuccessMessage(`Successfully enrolled ${credential.deviceName || "device"} (${typeLabel})`)
    } catch (err) {
      if (err instanceof Error && err.message.includes("cancelled")) {
        return
      }
      setError(err instanceof Error ? err.message : "Failed to register biometric")
    } finally {
      setIsRegistering(false)
    }
  }

  const handleAddDeviceWithName = () => {
    setShowDeviceNameDialog(true)
    setDeviceNameInput(getDeviceDisplayName() || "")
  }

  const confirmDeviceRegistration = async () => {
    setShowDeviceNameDialog(false)
    await handleRegisterBiometric(deviceNameInput.trim() || undefined)
  }

  const handleBiometricAuthWithFallback = async () => {
    if (!address) return
    setIsAuthenticatingBio(true)
    setError(null)
    try {
      const tokens = await AuthService.authenticateBiometric(address)
      useAuthStore.getState().setTokens(tokens)
      setAuthSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    } catch (err) {
      if (err instanceof Error && err.message.includes("cancelled")) {
        return
      }
      setShowFallbackDialog(true)
      setError(err instanceof Error ? err.message : "Biometric authentication failed")
    } finally {
      setIsAuthenticatingBio(false)
    }
  }

  const handleFallbackWalletAuth = async () => {
    setShowFallbackDialog(false)
    await handleAuthenticate()
  }

  const handleAuthorizePayment = async () => {
    if (!address) return
    setIsAuthorizingPayment(true)
    setError(null)
    try {
      const result = await AuthService.authorizePayment(
        address,
        "100",
        "GPAYMENTDEST123...",
        "Demo payment authorization"
      )
      setPaymentResult(`Payment authorized. Token: ${result.paymentToken.slice(0, 12)}...`)
    } catch (err) {
      if (err instanceof Error && err.message.includes("cancelled")) {
        return
      }
      setError(err instanceof Error ? err.message : "Payment authorization failed")
    } finally {
      setIsAuthorizingPayment(false)
    }
  }

  const handleRemoveCredential = async () => {
    if (!showRemoveDialog) return
    setIsRemoving(true)
    setError(null)
    try {
      await AuthService.removeBiometric(showRemoveDialog)
      setEnrolledCredentials((prev) => prev.filter((c) => c.id !== showRemoveDialog))
      setSuccessMessage("Biometric credential removed")
      if (enrolledCredentials.length <= 1) {
        setBiometric({ enabled: false })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove credential")
    } finally {
      setIsRemoving(false)
      setShowRemoveDialog(null)
    }
  }

  const getDeviceDisplayName = (): string => {
    if (typeof window === "undefined") return ""
    const ua = navigator.userAgent
    if (/iPhone/.test(ua)) return "My iPhone"
    if (/iPad/.test(ua)) return "My iPad"
    if (/Mac/.test(ua)) return "My Mac"
    if (/Android/.test(ua)) return "My Android"
    if (/Windows/.test(ua)) return "My PC"
    return ""
  }

  const getTypeIcon = (type: string) => {
    return type === "face" ? <ScanFace className="h-5 w-5 text-primary" /> : <Fingerprint className="h-5 w-5 text-primary" />
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
              <Shield className="h-6 w-6 text-primary" />
            </div>


              </Button>
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
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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

              {isWebAuthnSupported && isAuthenticated && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
              )}

              {isWebAuthnSupported && isAuthenticated && (
                <Button
                  onClick={handleBiometricAuthWithFallback}
                  variant="outline"
                  className="w-full"
                  size="lg"
                  disabled={isAuthenticatingBio}
                >
                  {isAuthenticatingBio ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      {platformType === "face" ? (
                        <ScanFace className="mr-2 h-4 w-4" />
                      ) : (
                        <Fingerprint className="mr-2 h-4 w-4" />
                      )}
                      Sign In with {platformType !== "unknown" ? (platformType === "face" ? "Face ID" : "Touch ID") : "Biometrics"}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {isAuthenticated && isWebAuthnSupported && (
            <div className="text-center">
              <Button
                variant="link"
                size="sm"
                onClick={() => setActiveTab("biometric")}
              >
                <Shield className="mr-1 h-4 w-4" />
                Manage Biometric Settings
              </Button>
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have a wallet?{" "}
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

      <Dialog open={showFallbackDialog} onOpenChange={(open) => !open && setShowFallbackDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Biometric Authentication Failed</DialogTitle>
            <DialogDescription>
              Would you like to authenticate using your wallet as a fallback method?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You can use your Stellar wallet to sign a message and complete the authentication.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFallbackDialog(false)}
              disabled={isUsingFallback}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFallbackWalletAuth}
              disabled={isUsingFallback}
            >
              {isUsingFallback ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Sign with Wallet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
