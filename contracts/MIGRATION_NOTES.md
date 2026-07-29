# Soroban Contract Migration Notes - May 2026

## Architectural Changes: Cargo Workspace

The contracts have been migrated from a single monolithic crate to a **Cargo Workspace**. This change resolves symbol collisions during WASM compilation and allows each contract to be built and deployed independently.

### New Directory Structure
```
contracts/
├── Cargo.toml (workspace)
└── packages/
    ├── shared/
    │   ├── access/ (Access Control library)
    │   └── storage_version/ (Versioning library)
    ├── admin/
    ├── airline/
    ├── booking/
    ├── booking_receipt/
    ├── dispute/
    ├── dispute_resolution/
    ├── flight_booking/
    ├── flight_registry/
    ├── governance/
    ├── loyalty/
    ├── oracle/
    ├── proxy/
    ├── refund/
    ├── refund_automation/
    ├── token/
    ├── upgrade/
    └── integration-tests/ (All integration tests)
```

### Key Changes
1.  **Inter-contract Dependencies:** Direct crate dependencies between contracts (e.g., `refund_automation` depending on `booking`) have been replaced with local client interface definitions using `#[contractclient]`. This prevents the "duplicate symbol" error when multiple contracts are compiled into the same WASM or when one contract pulls in another's implementation.
2.  **SDK 22 Compatibility:**
    *   `Vec::new()` now requires `&env`.
    *   `Vec::push()` has been replaced with `push_back()`.
    *   `StellarAsset` in tests has been replaced with `soroban_sdk::token::StellarAssetClient`.
    *   Symbol names must now comply with stricter character sets (hyphens replaced with underscores in some cases).
3.  **No-STD Compliance:** All contract packages now use `#![cfg_attr(not(test), no_std)]` to ensure compatibility with both the Soroban environment and host-based testing.
4.  **Testing Strategy:** Unit tests that previously called contract functions directly on the struct now use registered contract clients, as direct storage access is no longer permitted outside of a contract context in newer Soroban SDK versions.

## Build and Deployment

### Building all contracts
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```
Artifacts are now located in `contracts/target/wasm32-unknown-unknown/release/*.wasm`.

### Running tests
```bash
cd contracts
cargo test
```

## Migration Steps for New Contracts
1.  Add the contract to `contracts/packages/<name>`.
2.  Add the package to the root `contracts/Cargo.toml` members list.
3.  Ensure the package uses `#![cfg_attr(not(test), no_std)]`.
4.  If the contract needs to call another contract, define the required interface locally using `#[contractclient]` instead of adding the other contract's crate as a dependency.
