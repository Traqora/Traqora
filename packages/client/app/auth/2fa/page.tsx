"use client"

import { FormEvent, useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AuthService, TwoFASetup, TwoFAStatus } from "@/lib/auth"

export default function TwoFactorPage() {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [setup, setSetup] = useState<TwoFASetup | null>(null)
  const [status, setStatus] = useState<TwoFAStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Two-factor authentication request failed")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void run(async () => setStatus(await AuthService.getTwoFAStatus()))
  // The status endpoint is the source of truth when this page opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const beginSetup = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => setSetup(await AuthService.beginTwoFASetup(email)))
  }

  const confirmSetup = (event: FormEvent) => {
    event.preventDefault()
    if (!setup) return
    void run(async () => {
      await AuthService.confirmTwoFASetup(setup.setupId, code)
      setSetup(null)
      setCode("")
      setMessage("Two-factor authentication is enabled.")
      setStatus(await AuthService.getTwoFAStatus())
    })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>Protect your account with a time-based authenticator and backup codes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

          {!setup && !status?.enabled && (
            <form className="space-y-4" onSubmit={beginSetup}>
              <label className="block space-y-2" htmlFor="twofa-email">
                <span className="text-sm font-medium">Account email</span>
                <Input id="twofa-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <Button disabled={busy} type="submit">Start setup</Button>
            </form>
          )}

          {setup && (
            <form className="space-y-4" onSubmit={confirmSetup}>
              <img alt="Scan this QR code with your authenticator app" className="mx-auto h-48 w-48" src={setup.qrCode} />
              <p className="text-sm text-muted-foreground">If you cannot scan the QR code, enter this secret manually: <code>{setup.secret}</code></p>
              <label className="block space-y-2" htmlFor="twofa-code">
                <span className="text-sm font-medium">Authenticator code</span>
                <Input id="twofa-code" inputMode="numeric" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} />
              </label>
              <Button disabled={busy} type="submit">Confirm setup</Button>
              <div>
                <p className="font-medium">Save your backup codes</p>
                <p className="break-words text-sm text-muted-foreground">{setup.backupCodes.join(" · ")}</p>
              </div>
            </form>
          )}

          {status?.enabled && !setup && (
            <div className="space-y-4">
              <p>Authenticator enabled. {status.recoveryCodesRemaining} backup codes remain.</p>
              <Button disabled={busy} onClick={() => void run(async () => setMessage(`New recovery codes: ${(await AuthService.regenerateTwoFARecoveryCodes()).join(" · ")}`))}>
                Regenerate backup codes
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => void run(async () => { await AuthService.disableTwoFA(); setStatus(null); setMessage("Two-factor authentication disabled.") })}>
                Disable two-factor authentication
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
