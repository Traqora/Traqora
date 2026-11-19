# Soroban Transaction Envelope Rebuild and Upgrade Procedure

## Overview
When interacting with Soroban smart contracts on Stellar, transaction envelopes contain specific ledger sequence numbers, time bounds, and resource footprints (read/write sets). If ledger time advances past the `time_bounds_max`, sequence numbers shift, or ledger state modifications invalidate the resource footprint, the transaction envelope expires.

Traqora services enforce strict validation to detect expired transaction footprints or time bounds *before* requesting user signatures, discarding expired simulation states and re-simulating/rebuilding the envelope.

## Expected Behavior
1. **Expiration Detection**: Before presenting a transaction envelope for signing, the backend checks `SorobanTransactionEnvelope::is_expired(current_seq, current_timestamp)`. An envelope is expired if:
   - The footprint is marked invalid (`footprint_valid == false`).
   - Current ledger sequence exceeds `time_bounds_max`.
   - Current timestamp is outside `[time_bounds_min, time_bounds_max]`.
2. **Re-simulation & Rebuild**: Upon detecting expiration or invalidation, any stale simulation state is discarded, and `simulate_and_rebuild` is invoked to fetch fresh ledger sequence numbers, update time bounds, and regenerate the resource footprint.
3. **User Signing**: Users only sign fully fresh, validly simulated transaction envelopes.

## Failure Cases and Retry Workflow
- **Stale Simulation Reuse Prevention**: Reusing a simulation cached from an older ledger snapshot fails verification. The workflow mandates discarding the cached simulation output.
- **Network Concurrency / Drift**: If network congestion delays transaction submission past the newly rebuilt time bounds, the transaction fails with a time-bound error, triggering an automatic retry via `simulate_and_rebuild` with updated parameters.
