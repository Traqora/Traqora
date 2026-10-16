# Payment Retry UX API & Contract Specification

## Overview
Traqora's failed payment retry capability provides a resilient mechanism for users to re-submit failed Soroban smart contract bookings and payment transactions on the Stellar network without losing booking context.

## Data Contracts (`packages/client/types/payment.ts`)

### `PaymentRetryInput`
- `bookingId` (`string`): The unique identifier of the booking.
- `walletAddress` (`string`, optional): Connected Stellar wallet public address.
- `idempotencyKey` (`string`, optional): Unique key preventing duplicate transaction submissions.

### `PaymentRetryOutput`
- `success` (`boolean`): Indicates whether the transaction retry succeeded.
- `bookingId` (`string`): The associated booking ID.
- `txHash` (`string`, optional): Stellar transaction hash upon confirmation.
- `status` (`PaymentStatus`): Current status (`pending` | `processing` | `confirmed` | `failed`).
- `message` (`string`, optional): Human-readable confirmation or status detail.

### `PaymentRetryError`
- `code` (`string`): Standardized error code (e.g. `PAYMENT_RETRY_FAILED`).
- `message` (`string`): Detailed description of the failure.
- `retryable` (`boolean`): Flag indicating if another retry attempt is permitted.
- `details` (`Record<string, any>`, optional): Contextual metadata such as attempt count and booking ID.

## UI Component (`PaymentRetry`)

Located at `packages/client/components/booking/payment-retry.tsx`, the `PaymentRetry` component renders:
1. Alert container detailing transaction failure reason.
2. Attempt counter badge.
3. Interactive "Retry Payment" button with loading spinner state during Stellar RPC invocation.
4. Success banner with truncated transaction hash upon resolution.

## Error Cases & Regression Testing
- **Network Congestion / Timeout**: Handled gracefully with `retryable: true`, allowing operators/users to re-attempt submission.
- **Invalid Booking State**: Returns structured error code with descriptive messaging.
- **Regression Tests**: Covered thoroughly in `packages/client/tests/unit/payment-retry.test.tsx` verifying happy path confirmation and failure mode retry behavior.
