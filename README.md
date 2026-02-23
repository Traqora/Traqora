# Traqora – Decentralized Travel Booking on Stellar

Traqora is a decentralized travel booking platform that allows users to book flights directly using blockchain technology on the Stellar ecosystem.

## What is Traqora?

Traqora eliminates intermediaries in the traditional travel booking system by leveraging the Stellar blockchain. This enables transparent, low-cost, and secure travel bookings with direct interaction between users and service providers.

Key benefits include:
- Transparent and immutable flight bookings
- Low transaction fees
- Direct user-to-airline interactions
- Automated refunds, cancellations, and dispute resolution via smart contracts

## Features

### Flight Booking
Users can search and book flights directly with airlines.

### Smart Contract Management
All bookings are handled through secure Soroban-based smart contracts on the Stellar network.

### Crypto Payments
Payments can be made using stablecoins or native tokens on the Stellar platform.

### Refund Automation
Cancellations and refund processes are automatically executed via smart contracts, ensuring fast and fair resolutions.

### Governance
An optional token-based governance system allows users to vote on proposed protocol upgrades.

### Loyalty Program
Frequent travelers are rewarded through a decentralized loyalty program built into the protocol.

## Technology Stack

Traqora is built using a robust and scalable tech stack designed for performance and security on the Stellar network.

Blockchain:  
- Stellar (Layer 1 blockchain)

Smart Contracts:  
- Soroban (native smart contract platform for Stellar)

Frontend:  
- Next.js
- Integrated with Stellar-compatible wallets like Freighter and Albedo

Off-chain Data Storage:  
- IPFS and Arweave are used for storing metadata securely and decentralizing file storage

Wallet Support:  
- Compatible with Freighter, Albedo, and Rabet wallets

Testing Tools:  
- Soroban CLI for smart contract development and testing
- Stellar SDK for integration testing

Monitoring & Analytics:  
- Stellar Expert for on-chain data tracking
- Dune Analytics for advanced analytics dashboards

## Local Development with Docker

For a quick and easy setup of the entire development environment (including PostgreSQL, Redis, and a local Stellar node), we recommend using Docker Compose.

Refer to the [DOCKER_SETUP.md](./DOCKER_SETUP.md) for detailed instructions.

```bash
docker-compose up -d
```

## Installation & Setup

Before you begin, ensure the following tools are installed on your machine:
- soroban CLI (for Soroban smart contract development)
- stellar CLI (to interact with the Stellar network)
- Node.js (for running the frontend application)
- Git (to clone and manage the repository)

### Step 1: Clone the Repository

Run the following commands in your terminal:

git clone https://github.com/your-username/traqora.git  
cd traqora

### Step 2: Install Dependencies

For building the Soroban smart contracts:

soroban build

For setting up the frontend:

cd frontend  
npm install  
npm run dev

### Step 3: Connect Your Wallet

Use either Freighter, Albedo, or Rabet wallet to connect and interact with the Traqora dApp.

## Testing

To test the smart contract logic locally:

soroban test

For end-to-end testing after deployment:

You can use the Stellar CLI or Soroban tools to simulate real-world usage and verify contract behavior.

## Contributing

We welcome contributions from the community. Please refer to our Contributing Guide before submitting any pull requests.

## License

This project is licensed under the MIT License. See the LICENSE file for more information.
