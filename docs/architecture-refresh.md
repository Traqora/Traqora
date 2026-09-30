# Traqora Architecture Refresh Contract & Specification

## Overview
This document specifies the architecture contract, inputs, outputs, and failure modes for the Traqora decentralized travel booking platform built on Stellar Soroban.

## Architecture Components
1. **Client App**: Next.js user interface handling authentication, booking forms, and wallet interactions.
2. **Backend API**: Express server managing database persistence, off-chain sync, Amadeus integration, and transaction queueing.
3. **Soroban Smart Contracts**: Rust-based contracts deployed on Stellar testnet/mainnet ensuring trustless payments, escrow, dispute resolution, and refunds.

## Inputs & Outputs
- **Booking Creation**: Input (`flightId`, `passengerDetails`, `paymentToken`), Output (`bookingId`, `sorobanUnsignedXdr`).
- **Payment Submission**: Input (`bookingId`, `signedXdr`), Output (`sorobanTxHash`, `explorerUrl`).

## Error Cases
- **ContractError::BookingNotFound (200)**: Triggered when operating on a non-existent booking ID.
- **ContractError::AlreadyPaid (206)**: Triggered when attempting duplicate payment on a confirmed booking.
- **ContractError::RefundWindowClosed (204)**: Triggered when attempting a passenger refund past the allowed departure threshold.
