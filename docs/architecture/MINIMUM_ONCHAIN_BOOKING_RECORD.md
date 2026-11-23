# Minimum On-Chain Booking Record Specification

## 1. Overview and Privacy Rationale

Traqora's on-chain architecture adheres to data minimization principles under GDPR and traveler privacy regulations. While public blockchains provide immutable proofs of payment settlement and escrow releases, they are fundamentally public ledgers. Storing passenger Personally Identifiable Information (PII)—such as legal names, passport numbers, birth dates, phone numbers, email addresses, or specific seat allocations—on-chain poses severe privacy risks and conflicts with verified deletion requirements.

The **Minimum On-Chain Booking Record** specifies the minimal set of data fields retained within the Soroban booking contract (`contracts/packages/booking`). It stores only what is strictly necessary to:
1. Cryptographically prove booking payment and escrow settlement.
2. Maintain financial and multi-party escrow accounting.
3. Reference an off-chain booking without revealing passenger identity.

---

## 2. Record Structure (`MinimumBookingRecord`)

The `MinimumBookingRecord` contract type exposes the essential on-chain state:

| Field | Type | Purpose | Privacy Classification |
| --- | --- | --- | --- |
| `booking_id` | `u64` | Canonical on-chain sequence identifier | Public ledger identifier |
| `payer` | `Address` | Stellar wallet address of traveler paying the escrow | Pseudonymous public key |
| `airline` | `Address` | Stellar wallet address of merchant/airline recipient | Public merchant address |
| `price` | `i128` | Agreed flight fare in token units (signed 128-bit) | Financial agreement |
| `token` | `Address` | Stellar contract address for the settlement currency | Public asset contract |
| `amount_escrowed` | `i128` | Current funds held in contract escrow | Settlement state |
| `status` | `Symbol` | Lifecycle status (`pending`, `confirmed`, `completed`, `cancelled`, `refunded`) | Contract state machine |
| `created_at` | `u64` | Ledger timestamp when booking record was created | Ledger time |
| `offchain_ref` | `Option<Symbol>` | Deterministic reference linking to off-chain booking | Opaque reference / hash |

---

## 3. Explicitly Excluded Fields

The following fields are strictly prohibited from on-chain storage:
- **Traveler Identity**: Full names, date of birth, nationality, gender.
- **Contact Details**: Email addresses, phone numbers, physical addresses.
- **Travel Documents**: Passport numbers, redress numbers, visa credentials.
- **Seat & Cabin Preferences**: Assigned seat numbers, special assistance requirements, meal requests.

All excluded data resides exclusively in encrypted backend stores (see `docs/privacy/TRAVELER_DATA_RETENTION.md`) with restricted access and audit trails.

---

## 4. Contract Interfaces

The booking contract exposes the following accessors:
- `get_minimum_booking_record(env: Env, booking_id: u64) -> Option<MinimumBookingRecord>`
  Retrieves the privacy-preserving proof-of-payment record.
- `set_offchain_booking_reference(env: Env, booking_id: u64, offchain_ref: Symbol)`
  Allows the passenger wallet to link a deterministic off-chain reference.
- `create_booking_with_reference(...) -> u64`
  Convenience constructor initializing the booking with its off-chain reference in a single invocation.
- `get_booking_by_offchain_ref(env: Env, offchain_ref: Symbol) -> Option<u64>`
  Reverse lookup enabling off-chain services to resolve an on-chain booking identifier safely.
