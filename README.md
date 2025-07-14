# Traqora – Decentralized Travel Booking on Starknet

Traqora is a decentralized travel booking platform that allows users to book flights directly using blockchain technology on the Starknet ecosystem.

## What is Traqora?

Traqora eliminates intermediaries in the traditional travel booking system by leveraging zero-knowledge rollups (ZK-Rollups) on Starknet. This enables transparent, low-cost, and secure travel bookings with direct interaction between users and service providers.

Key benefits include:
- Transparent and immutable flight bookings
- Low transaction fees
- Direct user-to-airline interactions
- Automated refunds, cancellations, and dispute resolution via smart contracts

## Features

### Flight Booking
Users can search and book flights directly with airlines.

### Smart Contract Management
All bookings are handled through secure Cairo-based smart contracts on the Starknet network.

### Crypto Payments
Payments can be made using stablecoins or native tokens on the Starknet platform.

### Refund Automation
Cancellations and refund processes are automatically executed via smart contracts, ensuring fast and fair resolutions.

### Governance
An optional token-based governance system allows users to vote on proposed protocol upgrades.

### Loyalty Program
Frequent travelers are rewarded through a decentralized loyalty program built into the protocol.

## Technology Stack

Traqora is built using a robust and scalable tech stack designed for performance and security on the Starknet layer-2 network.

Blockchain:  
- Starknet (ZK-Rollup, Ethereum L2)

Smart Contracts:  
- Cairo (native language for Starknet)


Frontend:  
- Next.js
- Integrated with Starknet-compatible wallets like ArgentX and Braavos

Off-chain Data Storage:  
- IPFS and Arweave are used for storing metadata securely and decentralizing file storage

Wallet Support:  
- Compatible with ArgentX and Braavos wallets

Testing Tools:  
- Scarb for Cairo 2 development and testing
- Starknet Foundry for contract deployment and integration testing

Monitoring & Analytics:  
- Blockscout Explorer for on-chain data tracking
- Dune Analytics for advanced analytics dashboards

## Installation & Setup

Before you begin, ensure the following tools are installed on your machine:
- scarb (for Cairo 2 development)
- starknet CLI (to interact with the Starknet network)
- Node.js (for running the frontend application)
- Git (to clone and manage the repository)

### Step 1: Clone the Repository

Run the following commands in your terminal:

git clone https://github.com/your-username/traqora.git  
cd traqora

### Step 2: Install Dependencies

For building the Cairo smart contracts:

scarb build

For setting up the frontend:

cd frontend  
npm install  
npm run dev

### Step 3: Connect Your Wallet

Use either ArgentX or Braavos wallet to connect and interact with the Traqora dApp.

## Testing

To test the smart contract logic locally:

scarb test

For end-to-end testing after deployment:

You can use the StarkNet CLI or StarkNet Foundry tools to simulate real-world usage and verify contract behavior.

## Contributing

We welcome contributions from the community. Please refer to our Contributing Guide before submitting any pull requests.

## License

This project is licensed under the MIT License. See the LICENSE file for more information.
