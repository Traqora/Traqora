import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Fingerprint, AlertCircle } from 'lucide-react';

export interface BiometricAuthProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  isSupported?: boolean;
  className?: string;
}

export function BiometricAuth({
  onSuccess,
  onError,
  onCancel,
  isSupported = true,
  className = '',
}: BiometricAuthProps) {
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAuthenticate = async () => {
    if (!isSupported) {
      const msg = 'Biometric authentication is not supported on this device.';
      setErrorMessage(msg);
      setStatus('error');
      if (onError) onError(msg);
      return;
    }

    setStatus('authenticating');
    setErrorMessage(null);

    try {
      // Simulated WebAuthn / Biometric prompt contract
      if (window && window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) {
          throw new Error('Platform authenticator not available.');
        }
      }

      // Simulate successful biometric check
      await new Promise((resolve) => setTimeout(resolve, 800));
      setStatus('success');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      const msg = err.message || 'Biometric authentication failed.';
      setStatus('error');
      setErrorMessage(msg);
      if (onError) onError(msg);
    }
  };

  return (
    <div className={`flex flex-col items-center p-4 space-y-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm ${className}`}>
      <div className="flex items-center space-x-2">
        <Fingerprint className="h-6 w-6 text-primary" />
        <h3 className="text-lg font-semibold">Biometric Authentication</h3>
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Authenticate securely using Touch ID, Face ID, or fingerprint scanner.
      </p>

      {status === 'error' && errorMessage && (
        <div className="flex items-center space-x-2 text-destructive text-sm bg-destructive/10 p-2 rounded w-full">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 text-sm bg-green-500/10 p-2 rounded w-full">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Authentication successful</span>
        </div>
      )}

      <div className="flex space-x-2 w-full">
        <Button
          variant="default"
          className="w-full"
          onClick={handleAuthenticate}
          disabled={status === 'authenticating' || status === 'success'}
        >
          {status === 'authenticating' ? 'Verifying...' : 'Verify Biometrics'}
        </Button>
        {onCancel && (
          <Button
            variant="outline"
            onClick={() => {
              setStatus('idle');
              if (onCancel) onCancel();
            }}
            disabled={status === 'authenticating'}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
