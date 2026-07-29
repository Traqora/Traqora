"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Wallet, Loader2, CheckCircle, AlertCircle, Fingerprint, Smartphone, Trash2, Shield, ScanFace, ArrowLeftRight, CreditCard, KeyRound } from "lucide-react"
import { useAuth } from "@/lib/use-auth"
import { useWalletStore } from "@/lib/stellar-wallet-connect"
import { AuthService, BiometricCredential, getBiometricPlatformType } from "@/lib/auth"
import { useAuthStore } from "@/lib/auth-store"
import Link from "next/link"

export default function AuthPage() {
  const router = useRouter()
  const { isConnected, address, walletType } = useWalletStore()
  const { authenticate, isAuthenticating, canAuthenticate } = useAuth()
  const { isAuthenticated, biometric, setBiometric } = useAuthStore()
  const [authSuccess, setAuthSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<"auth" | "biometric">("auth")
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isAuthenticatingBio, setIsAuthenticatingBio] = useState(false)
  const [enrolledCredentials, setEnrolledCredentials] = useState<BiometricCredential[]>([])
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showRemoveDialog, setShowRemoveDialog] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showDeviceNameDialog, setShowDeviceNameDialog] = useState(false)
  const [deviceNameInput, setDeviceNameInput] = useState("")
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [isAuthorizingPayment, setIsAuthorizingPayment] = useState(false)
  const [paymentResult, setPaymentResult] = useState<string | null>(null)
  const [showFallbackDialog, setShowFallbackDialog] = useState(false)
  const [isUsingFallback, setIsUsingFallback] = useState(false)
  const [platformType, setPlatformType] = useState<"fingerprint" | "face" | "unknown">("unknown")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsWebAuthnSupported(
        typeof window.PublicKeyCredential !== "undefined" &&
        typeof navigator.credentials !== "undefined"
      )
    }
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPlatformType(getBiometricPlatformType())
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && isWebAuthnSupported) {
      loadCredentials()
    }
  }, [isAuthenticated, isWebAuthnSupported])

  const loadCredentials = async () => {
    setIsLoadingCredentials(true)
    setError(null)
    try {
      const credentials = await AuthService.getEnrolledBiometrics()
      setEnrolledCredentials(credentials)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load biometric credentials")
    } finally {
      setIsLoadingCredentials(false)
    }
  }

  const handleAuthenticate = async () => {
    const success = await authenticate()
    if (success) {
      setAuthSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
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

  if (isAuthenticated && activeTab === "biometric") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Biometric Settings</CardTitle>
            <CardDescription>
              Manage your biometric authentication options
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {!isWebAuthnSupported && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  WebAuthn is not supported on this browser. Please use a modern browser with biometric support.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center space-x-3">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Biometric Authentication</p>
                    <p className="text-xs text-muted-foreground">
                      Use fingerprint or face to sign in
                    </p>
                  </div>
                </div>
                <Switch
                  checked={biometric.enabled}
                  onCheckedChange={(checked) => {
                    setBiometric({ enabled: checked })
                    if (!checked) {
                      setBiometric({ preferOverWallet: false, requireForPayments: false })
                    }
                  }}
                  disabled={!isWebAuthnSupported}
                />
              </div>

              {biometric.enabled && (
                <>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Prefer biometric over wallet</p>
                      <p className="text-xs text-muted-foreground">
                        Auto-select biometric authentication when available
                      </p>
                    </div>
                    <Switch
                      checked={biometric.preferOverWallet}
                      onCheckedChange={(checked) => setBiometric({ preferOverWallet: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Require for payments</p>
                      <p className="text-xs text-muted-foreground">
                        Require biometric verification before payment authorization
                      </p>
                    </div>
                    <Switch
                      checked={biometric.requireForPayments}
                      onCheckedChange={(checked) => setBiometric({ requireForPayments: checked })}
                    />
                  </div>
                </>
              )}

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-sm">Enrolled Devices</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddDeviceWithName}
                    disabled={isRegistering || !isWebAuthnSupported}
                  >
                    {isRegistering ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Enrolling...
                      </>
                    ) : (
                      <>
                        <Smartphone className="mr-1 h-3 w-3" />
                        Add Device
                      </>
                    )}
                  </Button>
                </div>

                {isLoadingCredentials ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : enrolledCredentials.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No biometric credentials enrolled yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {enrolledCredentials.map((cred) => (
                      <div
                        key={cred.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <span>{getTypeIcon(cred.type)}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">
                                {cred.deviceName || "Unknown Device"}
                              </p>
                              <Badge variant="outline" className="text-xs capitalize">
                                {cred.type === "fingerprint" ? "Fingerprint" : "Face"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Enrolled {new Date(cred.enrolledAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowRemoveDialog(cred.id)}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Remove ${cred.deviceName || "biometric credential"}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {biometric.requireForPayments && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <h3 className="font-medium text-sm">Payment Authorization</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPaymentDialog(true)}
                      disabled={enrolledCredentials.length === 0}
                    >
                      <KeyRound className="mr-1 h-3 w-3" />
                      Test Payment
                    </Button>
                  </div>
                  {paymentResult && (
                    <Alert>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertDescription>{paymentResult}</AlertDescription>
                    </Alert>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Biometric verification is required before processing payments when enabled.
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setActiveTab("auth")}
              >
                Wallet Auth
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!showRemoveDialog} onOpenChange={(open) => !open && setShowRemoveDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Biometric Credential</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this biometric credential? You will need to re-enroll to use biometric authentication.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRemoveDialog(null)}
                disabled={isRemoving}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveCredential}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  "Remove"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeviceNameDialog} onOpenChange={(open) => !open && setShowDeviceNameDialog(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Name Your Device</DialogTitle>
              <DialogDescription>
                Give your device a recognizable name for biometric authentication.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="e.g., My iPhone, MacBook Pro, Pixel 8"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmDeviceRegistration()
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeviceNameDialog(false)} disabled={isRegistering}>
                Cancel
              </Button>
              <Button onClick={confirmDeviceRegistration} disabled={isRegistering}>
                {isRegistering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enrolling...
                  </>
                ) : (
                  "Enroll Device"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showPaymentDialog} onOpenChange={(open) => !open && setShowPaymentDialog(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Authorize Payment</DialogTitle>
              <DialogDescription>
                Verify your identity using biometrics to authorize a payment.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {paymentResult ? (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>{paymentResult}</AlertDescription>
                </Alert>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="h-12 w-12 text-primary mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Tap the button below to verify with your biometric sensor.
                  </p>
                  <Button
                    onClick={handleAuthorizePayment}
                    disabled={isAuthorizingPayment}
                    className="w-full"
                    size="lg"
                  >
                    {isAuthorizingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <KeyRound className="mr-2 h-4 w-4" />
                        Verify with Biometrics
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentDialog(false)
                  setPaymentResult(null)
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
