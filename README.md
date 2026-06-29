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
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-shells) (to interact with the Stellar network)
- Node.js (v18 or higher)
- Git (to clone and manage the repository)
- Docker & Docker Compose (optional, for local infrastructure dependencies)

### Step 1: Clone the Repository

Run the following commands in your terminal:

```bash
git clone https://github.com/your-username/traqora.git  
cd traqora
```

### Step 2: Configure Environment Variables

Copy the example environment variable files:
```bash
# Central env.example at repo root
cp env.example .env

# Backend env.example in packages/backend/
cp packages/backend/env.example packages/backend/.env
```
Open these files and configure the environment variables as needed. Refer to the comments in [env.example](./env.example) and [packages/backend/env.example](./packages/backend/env.example) for detailed information on types and default values.

### Step 3: Install Dependencies

From the repository root, install dependencies for the entire monorepo:
```bash
npm install
```

> **Note:** Some packages in this project depend on React 19, which may cause peer dependency warnings with older tooling. If you see `ERESOLVE` errors during install, append the `--legacy-peer-deps` flag:
> ```bash
> npm install --legacy-peer-deps
> ```

### Step 4: Run the Application

To run both the backend and client packages in development mode:
```bash
npm run dev
```

Alternatively, you can run individual packages:
```bash
# Start backend dev server only
npm run dev --workspace=packages/backend

# Start client/frontend dev server only
npm run dev --workspace=packages/client
```

### Step 5: Connect Your Wallet

Use Freighter, Albedo, or Rabet wallet in your browser to connect and interact with the Traqora dApp.

## Testing

To run tests across all workspaces:
```bash
npm run test
```

For smart contract testing:
```bash
soroban test
```

## Production Deployment

Before deploying Traqora to a staging or production environment, review the [Production Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md) to ensure all steps are correctly followed.

Key sections of the checklist include:
- **Pre-deployment checks** (verifying tests, building contracts, configuring secrets)
- **Soroban contract deployment** and retrieving contract IDs
- **Configuring backend and client environment variables**
- **Running database migrations**
- **Post-deployment smoke testing and health checks**
- **Rollback strategies**

## Contributing

We welcome contributions from the community. Please refer to our [Contributing Guide](./CONTRIBUTING.md) before submitting any pull requests.

## License

This project is licensed under the MIT License. See the LICENSE file for more information.

