# Booking Contract Authorization Rules Review

## 1. Executive Summary

This document reviews the authorization model and access control invariants for Traqora's on-chain booking contract (`contracts/packages/booking`).

The review verifies that only permitted actors can:
1. **Create** booking records.
2. **Transition** booking records across lifecycle stages (payment, escrow release, cancellation, refund).
3. **Query** protected booking records.

---

## 2. Authorization Matrix

| Action / Entrypoint | Permitted Actors | Authentication Mechanism | Invariant Enforced |
| --- | --- | --- | --- |
| `create_booking` / `create_booking_with_reference` | Passenger (Traveler) | `passenger.require_auth()` | Payer wallet must sign creation; cannot create booking under an arbitrary address. |
| `pay_for_booking` | Passenger (Traveler) | `booking.passenger.require_auth()` | Only the designated passenger wallet can escrow payment from their account. |
| `release_payment_to_airline` | Airline (Merchant) | `booking.airline.require_auth()` | Only the designated airline wallet can claim released escrow upon flight completion. |
| `batch_complete_bookings` | Airline (Merchant) | `airline.require_auth()` | Every booking in the batch must belong to the calling airline (`booking.airline == airline`). |
| `refund_passenger` | Passenger (Traveler) | `booking.passenger.require_auth()` | Permitted within cancellation window (`current_time < departure - 24h`). |
| `settle_cancellation` | Passenger OR Airline | `caller.require_auth()`, identity check | Caller must be either `booking.passenger` or `booking.airline`. |
| `oracle_release_payment` | Trusted Oracle | `oracle.require_auth()`, oracle registry | Calling oracle must match `BookingStorage::get_trusted_oracle()`. |
| `oracle_refund_airline_cancel` | Trusted Oracle | `oracle.require_auth()`, oracle registry | Calling oracle must match `BookingStorage::get_trusted_oracle()`. |
| `get_booking_authorized` | Passenger, Airline, or Trusted Oracle | `caller.require_auth()`, role verification | Unpermitted third parties cannot query protected booking records. |
| `cancel_booking` | Passenger | `passenger.require_auth()`, identity check | `assert!(passenger == booking.passenger)`. |
| `complete_booking` | Airline | `airline.require_auth()`, identity check | `assert!(airline == booking.airline)`. |

---

## 3. Threat Vector Analysis & Mitigations

### 3.1 Unauthorized Escrow Release
- **Threat**: An attacker attempts to call `release_payment_to_airline` or `batch_complete_bookings` to siphon escrowed funds.
- **Mitigation**: Soroban's `require_auth()` checks the signature of `booking.airline`. In batch completions, any mismatched booking ID fails with reason `unauth`.

### 3.2 Unauthorized Cancellation / Refund Hijacking
- **Threat**: A third party triggers cancellation or diverts refund payments.
- **Mitigation**: `refund_passenger` and `settle_cancellation` strictly disburse refunds to `booking.passenger` and enforce caller identity checks before executing token transfers.

### 3.3 Unauthorized Data Harvesting
- **Threat**: Snooping on private booking relationships or itinerary associations.
- **Mitigation**: `get_booking_authorized` enforces `caller.require_auth()` and checks authorization against the passenger, airline, or registered oracle before returning details.
