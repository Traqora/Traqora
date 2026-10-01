"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { 
  Shield, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Copy, 
  Download,
  QrCode,
  X,
  RefreshCw
} from "lucide-react"
import { AuthService } from "@/lib/auth"
import { useAuthStore } from "@/lib/auth-store"
import Link from "next/link"

export default function SettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isEnabling, setIsEnabling] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string; backupCodes: string[] } | null>(null)
  const [verificationToken, setVerificationToken] = useState("")
  const [setupError, setSetupError] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [backupCodesCopied, setBackupCodesCopied] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth')
      return
    }
    fetchTwoFactorStatus()
  }, [isAuthenticated, router])

  const fetchTwoFactorStatus = async () => {
    try {
      const status = await AuthService.getTwoFactorStatus()
      setTwoFactorEnabled(status.enabled)
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetupTwoFactor = async () => {
    setIsEnabling(true)
    setSetupError("")
    try {
      const data = await AuthService.setupTwoFactor()
      setSetupData(data)
      setShowSetup(true)
    } catch (error: any) {
      setSetupError(error.message || 'Failed to setup 2FA')
    } finally {
      setIsEnabling(false)
    }
  }

  const handleEnableTwoFactor = async () => {
    if (!verificationToken.trim()) {
      setSetupError('Please enter the verification code')
      return
    }

    setIsVerifying(true)
    setSetupError("")
    try {
      await AuthService.enableTwoFactor(verificationToken.trim())
      setTwoFactorEnabled(true)
      setShowSetup(false)
      setSetupData(null)
      setVerificationToken("")
    } catch (error: any) {
      setSetupError(error.message || 'Failed to enable 2FA')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleDisableTwoFactor = async () => {
    if (!confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')) {
      return
    }

    setIsDisabling(true)
    try {
      await AuthService.disableTwoFactor()
      setTwoFactorEnabled(false)
    } catch (error: any) {
      console.error('Failed to disable 2FA:', error)
      alert('Failed to disable 2FA. Please try again.')
    } finally {
      setIsDisabling(false)
    }
  }

  const handleRegenerateBackupCodes = async () => {
    if (!confirm('Are you sure you want to regenerate backup codes? Your old codes will no longer work.')) {
      return
    }

    setIsRegenerating(true)
    try {
      const data = await AuthService.regenerateBackupCodes()
      setNewBackupCodes(data.backupCodes)
    } catch (error: any) {
      console.error('Failed to regenerate backup codes:', error)
      alert('Failed to regenerate backup codes. Please try again.')
    } finally {
      setIsRegenerating(false)
    }
  }

  const copyBackupCodes = (codes: string[]) => {
    const text = codes.join('\n')
    navigator.clipboard.writeText(text)
    setBackupCodesCopied(true)
    setTimeout(() => setBackupCodesCopied(false), 2000)
  }

  const downloadBackupCodes = (codes: string[]) => {
    const text = codes.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'traqora-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your account security settings</p>
          </div>
          <Link href="/dashboard">
            <Button variant="ghost">Back to Dashboard</Button>
          </Link>
        </div>

        {/* Two-Factor Authentication Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>
                    Add an extra layer of security to your account
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={twoFactorEnabled}
                onCheckedChange={(checked) => {
                  if (checked) {
                    handleSetupTwoFactor()
                  } else {
                    handleDisableTwoFactor()
                  }
                }}
                disabled={isEnabling || isDisabling}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {twoFactorEnabled ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Two-factor authentication is enabled for your account.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={handleRegenerateBackupCodes}
                  variant="outline"
                  disabled={isRegenerating}
                  className="w-full"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate Backup Codes
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Two-factor authentication is not enabled. Enable it to protect your account with TOTP codes and backup codes.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* 2FA Setup Modal */}
        {showSetup && setupData && (
          <Card className="border-2 border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Setup Two-Factor Authentication</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowSetup(false)
                    setSetupData(null)
                    setVerificationToken("")
                    setSetupError("")
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Scan the QR code with your authenticator app and enter the verification code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {setupError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{setupError}</AlertDescription>
                </Alert>
              )}

              {/* QR Code */}
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-lg">
                  <img src={setupData.qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Scan this QR code with Google Authenticator, Authy, or any other TOTP app
                </p>
              </div>

              {/* Secret Key */}
              <div className="space-y-2">
                <Label>Secret Key</Label>
                <div className="flex space-x-2">
                  <Input
                    value={setupData.secret}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(setupData.secret)
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Verification */}
              <div className="space-y-2">
                <Label htmlFor="verify-code">Verification Code</Label>
                <Input
                  id="verify-code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={verificationToken}
                  onChange={(e) => setVerificationToken(e.target.value)}
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                  disabled={isVerifying}
                />
              </div>

              {/* Backup Codes */}
              <div className="space-y-2">
                <Label>Backup Codes</Label>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                  {setupData.backupCodes.map((code, index) => (
                    <code key={index} className="text-sm font-mono p-2 bg-background rounded">
                      {code}
                    </code>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => copyBackupCodes(setupData.backupCodes)}
                    className="flex-1"
                  >
                    {backupCodesCopied ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Codes
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => downloadBackupCodes(setupData.backupCodes)}
                    className="flex-1"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleEnableTwoFactor}
                disabled={isVerifying}
                className="w-full"
                size="lg"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Enable Two-Factor Authentication'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* New Backup Codes Display */}
        {newBackupCodes && (
          <Card className="border-2 border-green-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-green-600">New Backup Codes Generated</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNewBackupCodes(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Save these new backup codes in a safe place. Your old codes are no longer valid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  These codes will only be shown once. Make sure to save them now.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                {newBackupCodes.map((code, index) => (
                  <code key={index} className="text-sm font-mono p-2 bg-background rounded">
                    {code}
                  </code>
                ))}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => copyBackupCodes(newBackupCodes)}
                  className="flex-1"
                >
                  {backupCodesCopied ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Codes
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadBackupCodes(newBackupCodes)}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
