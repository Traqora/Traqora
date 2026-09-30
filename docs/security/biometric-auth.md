# Biometric Authentication Capability

## Overview
The Traqora biometric authentication capability provides secure, platform-native authentication using WebAuthn / platform authenticators (such as Touch ID, Face ID, or fingerprint scanners) directly within the mobile auth UX and client applications.

## Contract & Props

### `BiometricAuthProps`
- `onSuccess?: () => void` — Callback invoked upon successful biometric verification.
- `onError?: (error: string) => void` — Callback invoked when verification fails or encounters an error.
- `onCancel?: () => void` — Callback invoked if the user cancels the authentication prompt.
- `isSupported?: boolean` — Flag indicating whether the current device supports platform biometric authentication (defaults to `true`).
- `className?: string` — Optional custom CSS class names for styling container elements.

## Inputs, Outputs, & Error Cases

### Inputs
- Device biometric capabilities (`window.PublicKeyCredential`).
- User interaction triggering `Verify Biometrics` or `Cancel`.

### Outputs
- **Success**: State updates to `'success'`, rendering a success badge and triggering `onSuccess()`.
- **Cancellation**: State resets to `'idle'` and triggers `onCancel()`.

### Error Cases
1. **Unsupported Device**: If `isSupported` is false or `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` resolves to false, an error message is displayed (`'Biometric authentication is not supported on this device.'`) and `onError` is invoked.
2. **Authentication Failure**: If the prompt is rejected, times out, or throws an error, the error message is caught, displayed in an alert box, and `onError(msg)` is triggered.

## Example Usage
```tsx
import { BiometricAuth } from '@/components/auth/BiometricAuth';

export function LoginScreen() {
  return (
    <BiometricAuth
      onSuccess={() => console.log('Authenticated successfully')}
      onError={(err) => console.error('Auth error:', err)}
      onCancel={() => console.log('Auth cancelled')}
    />
  );
}
```
