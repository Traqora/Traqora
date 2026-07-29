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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle } from "lucide-react";

interface TwoFAVerifyProps {
  onVerify?: (code: string) => Promise<boolean>;
  onRecovery?: (code: string) => Promise<boolean>;
}

export function TwoFAVerify({ onVerify, onRecovery }: TwoFAVerifyProps) {
  const [method, setMethod] = useState<"code" | "recovery">("code");
  const [code, setCode] = useState("");
  const [deviceId, setDeviceId] = useState(`device-${Date.now()}`);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError(null);

      if (method === "code") {
        if (!code || code.length !== 6) {
          setError("Code must be 6 digits");
          return;
        }

        const success = await onVerify?.(code);
        if (!success) {
          setError("Invalid code. Please try again.");
          return;
        }
      } else {
        if (!code || code.length < 8) {
          setError("Invalid recovery code");
          return;
        }

        const success = await onRecovery?.(code);
        if (!success) {
          setError("Invalid or already used recovery code");
          return;
        }
      }

      // Success - will be handled by parent component
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Verify Your Identity</CardTitle>
        <CardDescription>Enter your 2FA code to continue</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs value={method} onValueChange={(val) => setMethod(val as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code">Authenticator</TabsTrigger>
            <TabsTrigger value="recovery">Recovery Code</TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">6-digit code</label>
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
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          </TabsContent>

          <TabsContent value="recovery" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Recovery code</label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter one of your backup recovery codes
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {method === "code" && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={rememberDevice}
              onCheckedChange={(checked) =>
                setRememberDevice(checked as boolean)
              }
              disabled={loading}
            />
            <label
              htmlFor="remember"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Trust this device for 30 days
            </label>
          </div>
        )}

        <Button
          onClick={handleVerify}
          disabled={loading || code.length < 6}
          className="w-full"
        >
          {loading ? "Verifying..." : "Verify"}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Lost access?{" "}
          <button
            className="text-primary hover:underline"
            onClick={() => setMethod(method === "code" ? "recovery" : "code")}
          >
            Use recovery code
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
