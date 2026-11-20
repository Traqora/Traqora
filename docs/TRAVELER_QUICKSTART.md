# Traqora V1 Traveler Quickstart

Welcome to Traqora, a decentralized travel booking platform built on the Stellar ecosystem using Soroban smart contracts. This quickstart guide covers account setup, wallet requirements, searching and booking flights, and getting support.

## 1. Wallet Requirements

To interact with Traqora, you need a Stellar-compatible wallet (such as Freighter or Albedo) supporting Soroban smart contracts.

- **Network**: Stellar Testnet (for v1 evaluation) or Mainnet.
- **Asset**: USDC or native XLM for transaction fees and escrow payments.
- **Funding**: Ensure your wallet has sufficient testnet XLM/USDC from the Stellar Friendbot.

## 2. Account Setup

1. Install a supported browser extension wallet (e.g., Freighter).
2. Create a new account or import an existing Stellar secret key.
3. Switch your wallet network to **Testnet**.
4. Connect your wallet to the Traqora web or mobile interface.

## 3. Flight Search

Use the Traqora Flight Search interface to find available flights:

- Enter your origin and destination 3-letter airport codes (e.g., JFK to LAX).
- Select your departure date (and optional return date).
- Apply filters for price, cabin class, stops, and airlines.
- Click **Search** to view live results from decentralized airline registries.

## 4. Booking and Payment Escrow

Once you select a flight, the booking process leverages secure smart contract escrows:

1. **Seat Reservation**: Select your desired seat. The contract verifies availability and temporarily reserves it.
2. **Payment**: Approve the escrow transaction using your wallet. Funds (USDC/XLM) are transferred into the decentralized booking escrow contract.
3. **Confirmation**: Upon successful payment, your booking status updates to `Confirmed` and a soulbound booking receipt (SBT) is minted to your address.
4. **Fulfillment & Release**: After flight completion, the escrow releases funds to the airline or facilitates automated refunds in case of cancellations in accordance with policy.

## 5. Support and Resources

If you encounter issues or need assistance:

- Review our [Contributing Guide](../CONTRIBUTING.md) and [Security Policy](../SECURITY.md).
- Check contract interaction status on Stellar Explorer (Testnet).
- Open an issue or reach out via community support channels.
