# V1 Supported Payment Method, Asset, Network, and Unsupported Cases

## Overview
This document defines the single initial payment method, supported asset, network, and unsupported payment cases for Traqora v1 bookings and wallet interactions.

## 1. Supported Payment Method
- **Method**: Smart contract-based token escrow and direct transfer via Soroban booking contracts (`pay_for_booking`).
- **Flow**: Traveler initiates booking creation (`create_booking`), followed by escrow payment execution (`pay_for_booking`) transferring tokens into the booking contract escrow.

## 2. Supported Asset
- **Asset**: USD Coin (USDC) or Stellar Native Asset (XLM) configured via the deployed Soroban token contract (`contracts/packages/token`).
- **Standard**: Soroban Token Interface (SEP-41 compliant token contract).

## 3. Supported Network
- **Network**: Stellar Network
  - **Testnet**: Test SDF Network (Network Passphrase: `Test SDF Network ; September 2015`)
  - **Mainnet**: Public Global Stellar Network (Network Passphrase: `Public Global Stellar Network ; September 2015`)

## 4. Unsupported Payment Cases (V1 Scope)
The following payment methods and cases are explicitly **unsupported** in v1:
- Fiat credit/debit card direct billing on-chain (Stripe is restricted to off-chain fiat-to-crypto onboarding or metadata tracking where applicable, but native on-chain settlement strictly uses Soroban tokens).
- Cross-chain bridged tokens (e.g., Ethereum ERC-20 tokens bridged without native Stellar issuance).
- Algorithmic stablecoins or unverified custom tokens lacking Soroban Token Interface compliance.
- Partial payments or split-tender payments across multiple disparate tokens in a single booking transaction.
- Offline or cash-on-delivery settlements.
