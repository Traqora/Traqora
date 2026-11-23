# Booking Contract v1 Deployment Prerequisites

This document outlines the required accounts, assets, configuration, migration, and verification steps for deploying the v1 booking contract (`booking`) on Stellar Soroban.

## 1. Required Accounts & Signers
- **Admin Account**: Multisig or secured keypair responsible for initialization, setting trusted oracles, and registering receipt contracts.
- **Airline Accounts**: Verified airline actor addresses authorized to fulfill flights and receive released escrow funds.
- **Oracle Account**: Trusted price or event feed oracle address initialized via `initialize_oracle`.

## 2. Required Assets
- **Payment Token (TRQ / USDC)**: A Soroban-compatible Stellar Asset Contract (SAC) or custom token supporting standard SPL/Soroban token interfaces (`transfer`, `balance_of`, `mint`).
- **Booking Receipt SBT (Optional/Recommended)**: The `booking_receipt` contract linked via `set_receipt_contract` to issue soulbound tokens upon payment escrow confirmation.

## 3. Configuration Steps
1. Deploy the `booking` WASM binary.
2. Initialize the trusted oracle address using `initialize_oracle(admin, oracle)`.
3. Register and link the receipt contract using `set_receipt_contract(admin, receipt_contract)`.
4. Ensure participants fund accounts with the required native XLM for reserves and Soroban resource fees.

## 4. Migration & Upgrades
- Follow Soroban persistent storage guidelines and storage version checks (`storage-version` crate).
- Use the proxy upgrade mechanism (`upgrade` package) for subsequent contract upgrades without losing state.

## 5. Verification Steps
- Run automated integration tests covering normal and failure paths (`cargo test --workspace`).
- Verify contract code hash and deployment on Soroban testnet/mainnet explorer.
