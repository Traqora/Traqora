"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle, AlertCircle, Download } from "lucide-react";

interface TwoFASetupProps {
  onComplete?: () => void;
}

export function TwoFASetup({ onComplete }: TwoFASetupProps) {
  const [step, setStep] = useState<
    "method" | "scan" | "verify" | "codes" | "complete"
  >("method");
  const [sessionId, setSessionId] = useState<string>("");
  const [qrCode, setQrCode] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const startSetup = async (method: string) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });

      if (!res.ok) throw new Error("Failed to start setup");

      const data = await res.json();
      setSessionId(data.sessionId);
      setQrCode(data.qrCode);
      setBackupCodes(data.backupCodes);
      setStep("scan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmSetup = async () => {
    if (!code || code.length !== 6) {
      setError("Code must be 6 digits");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/2fa/confirm-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, code }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid code");
      }

      setStep("codes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadCodes = () => {
    const text = backupCodes.join("\n");
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," + encodeURIComponent(text),
    );
    element.setAttribute("download", "backup-codes.txt");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto">
      {step === "method" && (
        <Card>
          <CardHeader>
            <CardTitle>Enable Two-Factor Authentication</CardTitle>
            <CardDescription>
              Choose your preferred verification method
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => startSetup("totp")}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              Authenticator App (TOTP)
            </Button>
            <Button
              onClick={() => startSetup("sms")}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              SMS (Coming Soon)
            </Button>
            <Button
              onClick={() => startSetup("email")}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              Email (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "scan" && (
        <Card>
          <CardHeader>
            <CardTitle>Scan QR Code</CardTitle>
            <CardDescription>
              Use an authenticator app to scan this QR code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code" className="w-48 h-48" />
              </div>
            )}

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Can't scan?</p>
              <p className="text-xs font-mono break-all">
                Enter this code manually in your authenticator app
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Enter 6-digit code</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                maxLength={6}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={confirmSetup}
              disabled={loading || code.length !== 6}
              className="w-full"
            >
              Verify & Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "codes" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Save Backup Codes
            </CardTitle>
            <CardDescription>Save these codes in a safe place</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Keep these codes safe. You can use them to recover your account
                if you lose access to your authenticator.
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-muted-foreground"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={copyToClipboard}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                onClick={downloadCodes}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>

            <Button onClick={() => setStep("complete")} className="w-full">
              I've Saved the Codes
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "complete" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              2FA Enabled
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication is now enabled on your account.
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <p>
                <strong>What's next?</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Sign in normally with your email and password</li>
                <li>Enter the 6-digit code from your authenticator</li>
                <li>Or use a backup code if you lose access</li>
              </ul>
            </div>

            <Button onClick={() => onComplete?.()} className="w-full">
              Done
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
