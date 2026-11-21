# Issue #664: Booking Confirmation Flow

## Overview

Extracted the post-booking success screen into a dedicated `BookingConfirmation`
component and fixed the previously non-functional receipt and blockchain
explorer actions on the booking page.

## Features

- Real receipt download via `getTransactionReceiptPdf(bookingId)`
- "View on Stellar Explorer" link built from the booking's transaction hash
- Graceful info toast when a booking has no on-chain transaction hash yet
- Passenger name, dynamic terminal label, insurance and carbon-offset sections

## Files

- `packages/client/components/booking/booking-confirmation.tsx` — confirmation UI
- `packages/client/app/book/[id]/page.tsx` — success step delegates to the component

## Usage

```tsx
import { BookingConfirmation } from "@/components/booking/booking-confirmation";

<BookingConfirmation bookingId="BOOKING-123" booking={booking} />;
```

## Testing

- `packages/client/tests/unit/booking-confirmation.test.tsx`
