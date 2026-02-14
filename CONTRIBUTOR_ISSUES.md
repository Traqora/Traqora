# Traqora Contributor Issues

This document contains 30 detailed GitHub issues for contributors to work on. Each issue includes a clear description, acceptance criteria, technical notes, and estimated difficulty.

---

## SMART CONTRACTS (Issues #1-12)

### Issue #1: Implement Payment Escrow in Booking Contract
**Labels:** `contracts`, `soroban`, `high-priority`, `booking`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
The current booking contract only stores booking metadata but doesn't actually hold payments in escrow. Implement a secure escrow mechanism where passenger payments are held in the contract until the flight is completed or cancelled.

#### Acceptance Criteria
- [ ] Add token transfer functionality to accept USDC/XLM payments
- [ ] Implement `pay_for_booking()` function that transfers tokens to contract
- [ ] Add `release_payment_to_airline()` function for post-flight settlement
- [ ] Implement `refund_passenger()` function for cancelled bookings
- [ ] Add balance tracking for each booking
- [ ] Write comprehensive tests for all payment flows
- [ ] Handle edge cases (double-spend, reentrancy)

#### Technical Notes
- Use Soroban's token interface for cross-contract calls
- Store escrow balances in contract storage
- Consider adding timeout mechanism for abandoned bookings

---

### Issue #2: Add Multi-Signature Admin Control to Contracts
**Labels:** `contracts`, `soroban`, `security`, `governance`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Currently, admin functions rely on a single address. Implement a multi-signature scheme requiring 2-of-3 or 3-of-5 signatures for critical admin operations like contract upgrades, emergency stops, and parameter changes.

#### Acceptance Criteria
- [ ] Create `MultisigConfig` struct to store signers and threshold
- [ ] Implement `propose_admin_action()` for creating proposals
- [ ] Add `approve_admin_action()` for signers to vote
- [ ] Implement `execute_admin_action()` after threshold reached
- [ ] Add `add_signer()` and `remove_signer()` functions
- [ ] Write tests for all multisig scenarios
- [ ] Document security considerations

#### Technical Notes
- Store pending proposals in contract storage with expiration
- Consider using contract events for off-chain notification
- Ensure atomic execution of approved actions

---

### Issue #3: Implement Flight Status Oracle Integration
**Labels:** `contracts`, `oracle`, `airline`, `integration`  
**Difficulty:** Hard  
**Estimated Time:** 5-6 days

#### Description
Build an oracle system that allows verified flight status data (delays, cancellations, arrivals) to be submitted on-chain. This enables automatic refunds for airline-caused cancellations and automatic payment release on flight completion.

#### Acceptance Criteria
- [ ] Create `FlightOracle` contract with authorized data providers
- [ ] Implement `register_oracle_provider()` with staking requirement
- [ ] Add `submit_flight_status()` with cryptographic proof
- [ ] Implement `verify_flight_completion()` for automatic settlement
- [ ] Add dispute mechanism for incorrect oracle data
- [ ] Integrate with booking contract for auto-refunds
- [ ] Write tests simulating various oracle scenarios

#### Technical Notes
- Use ECDSA signatures from trusted flight data APIs
- Consider multiple oracle provider consensus
- Add slashing mechanism for malicious oracles

---

### Issue #4: Create Dispute Resolution Contract
**Labels:** `contracts`, `soroban`, `governance`, `refund`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Implement a decentralized dispute resolution system for refund disputes between passengers and airlines. Use a jury system where TRQ token holders can vote on disputes and earn rewards for fair decisions.

#### Acceptance Criteria
- [ ] Create `Dispute` struct with evidence hashes and stakes
- [ ] Implement `file_dispute()` with stake requirement
- [ ] Add `submit_evidence()` for both parties
- [ ] Implement jury selection from TRQ token holders
- [ ] Create voting mechanism with commit-reveal scheme
- [ ] Add reward distribution for winning voters
- [ ] Implement automatic refund/slash based on verdict
- [ ] Write tests for complete dispute lifecycle

#### Technical Notes
- Use hash-commit pattern for fair voting
- Consider time-locked phases (evidence, voting, appeal)
- Implement appeal mechanism with higher stakes

---

### Issue #5: Add Time-Locked Refund Safety Mechanism
**Labels:** `contracts`, `soroban`, `security`, `refund`  
**Difficulty:** Medium  
**Estimated Time:** 2-3 days

#### Description
Implement a safety mechanism that prevents immediate large refunds, requiring a time delay for refunds above a certain threshold. This prevents exploits from compromised accounts.

#### Acceptance Criteria
- [ ] Define refund tiers (immediate < $100, delayed > $100)
- [ ] Implement `request_delayed_refund()` with timelock
- [ ] Add `cancel_refund_request()` during delay period
- [ ] Create `process_delayed_refund()` after timelock expires
- [ ] Add emergency override for genuine emergencies
- [ ] Write tests for timelock behavior
- [ ] Document security rationale

#### Technical Notes
- Use ledger sequence for time measurement
- Consider 24-48 hour delay for large refunds
- Add event emission for monitoring

---

### Issue #6: Implement Batch Operations for Airline Management
**Labels:** `contracts`, `soroban`, `airline`, `optimization`  
**Difficulty:** Medium  
**Estimated Time:** 2-3 days

#### Description
Airlines need to manage hundreds of flights. Implement batch operations to create multiple flights, update statuses, and process multiple bookings in a single transaction to save on gas costs.

#### Acceptance Criteria
- [ ] Implement `batch_create_flights()` accepting arrays of flight data
- [ ] Add `batch_update_flight_status()` for mass updates
- [ ] Create `batch_complete_bookings()` for post-flight processing
- [ ] Add validation for array length limits (prevent gas exhaustion)
- [ ] Implement partial batch failure handling
- [ ] Write tests for batch operations
- [ ] Compare gas costs vs individual operations

#### Technical Notes
- Limit batch size to prevent exceeding resource limits
- Consider using iterators for large batches
- Document gas savings in comments

---

### Issue #7: Add Booking NFT Receipts (Soroban Token Interface)
**Labels:** `contracts`, `soroban`, `nft`, `booking`, `feature`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Implement non-transferable NFT receipts for each booking that passengers can collect. These serve as immutable proof of purchase and can unlock special benefits.

#### Acceptance Criteria
- [ ] Create `BookingReceipt` NFT contract implementing token interface
- [ ] Implement `mint_receipt()` called on successful booking
- [ ] Add metadata with flight details, seat, timestamp
- [ ] Make NFTs non-transferable (soulbound)
- [ ] Create `get_passenger_receipts()` query function
- [ ] Add receipt verification for lounge access/offers
- [ ] Write tests for minting and metadata

#### Technical Notes
- Use Soroban token interface for compatibility
- Store metadata on-chain for immutability
- Consider off-chain metadata for larger data

---

### Issue #8: Implement Dynamic Pricing Oracle
**Labels:** `contracts`, `oracle`, `pricing`, `airline`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Create an oracle system for real-time flight pricing that airlines can use to update prices based on demand, competitor pricing, and time-to-departure.

#### Acceptance Criteria
- [ ] Design pricing data structure with multiple factors
- [ ] Implement `update_flight_price()` with oracle authorization
- [ ] Add price history tracking for transparency
- [ ] Create `get_current_price()` with demand multiplier
- [ ] Implement price change limits (max 20% per update)
- [ ] Add events for price change notifications
- [ ] Write tests for dynamic pricing logic

#### Technical Notes
- Consider algorithmic pricing (demand-based)
- Add price change cooldown periods
- Integrate with airline contract for real-time updates

---

### Issue #9: Add Contract Upgradeability (Proxy Pattern)
**Labels:** `contracts`, `soroban`, `architecture`, `upgrade`  
**Difficulty:** Hard  
**Estimated Time:** 5-6 days

#### Description
Implement a proxy pattern for all core contracts to allow upgrades without losing state. This is critical for fixing bugs and adding features post-deployment.

#### Acceptance Criteria
- [ ] Create `ContractProxy` wrapper for each contract
- [ ] Implement `upgrade_to()` with multisig authorization
- [ ] Add storage layout versioning for migrations
- [ ] Create `pause_contract()` emergency function
- [ ] Implement `migrate_storage()` for data format changes
- [ ] Write tests for upgrade scenarios
- [ ] Document upgrade process for devs

#### Technical Notes
- Use Soroban's contract meta features
- Consider storage slot allocation strategy
- Test thoroughly on testnet before mainnet

---

### Issue #10: Implement Cross-Contract Call Optimization
**Labels:** `contracts`, `soroban`, `optimization`, `performance`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Optimize gas costs by reducing cross-contract calls. Currently, contracts call each other excessively. Implement batching and caching strategies.

#### Acceptance Criteria
- [ ] Audit all cross-contract call patterns
- [ ] Implement callback pattern where appropriate
- [ ] Add result caching for frequent queries
- [ ] Batch related operations in single calls
- [ ] Compare gas costs before/after optimization
- [ ] Document optimization strategies
- [ ] Ensure no reentrancy vulnerabilities introduced

#### Technical Notes
- Use client-side batching where possible
- Consider lazy evaluation for non-critical updates
- Profile gas usage with soroban-cli

---

### Issue #11: Create Comprehensive Contract Test Suite
**Labels:** `contracts`, `testing`, `quality`, `documentation`  
**Difficulty:** Medium  
**Estimated Time:** 4-5 days

#### Description
The current test coverage is minimal. Create a comprehensive test suite covering all edge cases, error conditions, and integration scenarios across all contracts.

#### Acceptance Criteria
- [ ] Achieve >90% code coverage across all contracts
- [ ] Write unit tests for every public function
- [ ] Create integration tests for cross-contract calls
- [ ] Add fuzzing tests for input validation
- [ ] Implement property-based tests for invariants
- [ ] Create mock environments for external dependencies
- [ ] Document testing approach and patterns

#### Technical Notes
- Use soroban-sdk testutils
- Create reusable test fixtures
- Consider formal verification for critical functions

---

### Issue #12: Add Contract Events and Indexing Support
**Labels:** `contracts`, `soroban`, `events`, `integration`  
**Difficulty:** Medium  
**Estimated Time:** 2-3 days

#### Description
Enhance contract events for better off-chain indexing. Add structured events that DApp developers can easily consume for real-time updates.

#### Acceptance Criteria
- [ ] Audit existing events for completeness
- [ ] Add standardized event topics (contract_type, action)
- [ ] Include relevant data in event payloads
- [ ] Create event schema documentation
- [ ] Implement event subscription helper in SDK
- [ ] Add integration tests for event emission
- [ ] Document event structure for indexers

#### Technical Notes
- Follow Stellar ecosystem event standards
- Consider adding sequence numbers for ordering
- Optimize for event filtering efficiency

---

## BACKEND API (Issues #13-22)

### Issue #13: Implement Flight Search API with Filtering
**Labels:** `backend`, `api`, `flights`, `search`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Create a comprehensive flight search API endpoint that supports filtering by date, price range, airlines, stops, duration, and sorting options.

#### Acceptance Criteria
- [ ] Create GET `/api/v1/flights/search` endpoint
- [ ] Implement query parameters (from, to, date, passengers, class)
- [ ] Add filtering (price_min, price_max, airlines, stops, duration_max)
- [ ] Implement sorting (price, duration, departure_time, rating)
- [ ] Add pagination with cursor-based pagination
- [ ] Implement caching with Redis (5-minute TTL)
- [ ] Write integration tests
- [ ] Add rate limiting (100 req/min per IP)

#### Technical Notes
- Use PostgreSQL with proper indexing
- Consider using Elasticsearch for full-text search
- Cache frequent routes aggressively

---

### Issue #14: Build Stellar Wallet Authentication Middleware
**Labels:** `backend`, `auth`, `stellar`, `wallet`, `security`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Implement authentication middleware that verifies Stellar wallet ownership using cryptographic signatures instead of traditional passwords. Support Freighter, Albedo, and Rabet wallets.

#### Acceptance Criteria
- [ ] Create `/api/v1/auth/challenge` endpoint (generate nonce)
- [ ] Implement `/api/v1/auth/verify` endpoint (verify signature)
- [ ] Add JWT generation with wallet address as subject
- [ ] Create wallet signature verification for each supported wallet
- [ ] Implement session management with refresh tokens
- [ ] Add middleware to protect routes
- [ ] Write tests for authentication flow

#### Technical Notes
- Use Stellar SDK for signature verification
- Support SEP-10 authentication pattern
- Consider nonce expiration (5 minutes)

---

### Issue #15: Implement Booking Creation and Contract Integration
**Labels:** `backend`, `api`, `booking`, `soroban`, `integration`  
**Difficulty:** Hard  
**Estimated Time:** 5-6 days

#### Description
Create the complete booking flow API that creates a booking record, interacts with the Soroban booking contract, and handles payment processing.

#### Acceptance Criteria
- [ ] Create POST `/api/v1/bookings` endpoint
- [ ] Implement booking validation (flight availability, passenger details)
- [ ] Add Soroban contract call to create on-chain booking
- [ ] Implement payment intent generation
- [ ] Add webhook handling for payment confirmation
- [ ] Create booking status tracking
- [ ] Implement retry logic for failed contract calls
- [ ] Write comprehensive integration tests

#### Technical Notes
- Use soroban-client for contract interaction
- Consider queue for async processing
- Add idempotency keys for duplicate prevention

---

### Issue #16: Build Real-Time Price Tracking Service
**Labels:** `backend`, `service`, `pricing`, `websocket`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Create a background service that tracks flight prices in real-time, notifies users of price drops, and updates cached prices from the pricing oracle.

#### Acceptance Criteria
- [ ] Create price monitoring cron job (runs every 5 minutes)
- [ ] Implement WebSocket server for real-time updates
- [ ] Add price alert subscription management
- [ ] Create notification service (email/push for price drops)
- [ ] Implement price history storage
- [ ] Add price volatility detection
- [ ] Write tests for price tracking logic

#### Technical Notes
- Use Redis pub/sub for WebSocket scaling
- Consider using Bull queue for job processing
- Add alerting for anomalous price changes

---

### Issue #17: Implement Refund Processing Service
**Labels:** `backend`, `service`, `refund`, `soroban`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Build an automated refund processing service that handles refund requests, validates eligibility against smart contracts, processes payments, and updates booking status.

#### Acceptance Criteria
- [ ] Create POST `/api/v1/refunds/request` endpoint
- [ ] Implement refund eligibility checking
- [ ] Add automatic refund for policy-compliant requests
- [ ] Create manual review queue for exceptions
- [ ] Implement Soroban contract calls for refund execution
- [ ] Add refund status tracking and notifications
- [ ] Create admin dashboard endpoints for review
- [ ] Write tests for all refund scenarios

#### Technical Notes
- Use transaction queue for reliability
- Consider multi-sig for large refunds
- Add audit logging for all refund actions

---

### Issue #18: Build Loyalty Points Calculation Engine
**Labels:** `backend`, `service`, `loyalty`, `calculation`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Create a service that automatically calculates loyalty points based on bookings, tier multipliers, and promotional campaigns. Integrate with the loyalty smart contract.

#### Acceptance Criteria
- [ ] Implement points calculation based on tier multipliers
- [ ] Create bonus points campaigns (seasonal, promotional)
- [ ] Add retroactive points calculation for missing data
- [ ] Implement points expiration handling
- [ ] Create tier upgrade/downgrade logic
- [ ] Add points history API endpoint
- [ ] Integrate with loyalty contract for on-chain sync
- [ ] Write tests for calculation accuracy

#### Technical Notes
- Use job queue for async processing
- Consider event sourcing for points history
- Add reconciliation process for contract sync

---

### Issue #19: Create Admin Dashboard API
**Labels:** `backend`, `api`, `admin`, `dashboard`  
**Difficulty:** Medium  
**Estimated Time:** 4-5 days

#### Description
Build comprehensive admin API endpoints for the dashboard including flight management, user management, booking oversight, and system analytics.

#### Acceptance Criteria
- [ ] Create `/api/v1/admin/flights` CRUD endpoints
- [ ] Implement `/api/v1/admin/users` management endpoints
- [ ] Add `/api/v1/admin/bookings` oversight endpoints
- [ ] Create `/api/v1/admin/analytics` dashboard data
- [ ] Implement `/api/v1/admin/refunds` review endpoints
- [ ] Add role-based access control (RBAC)
- [ ] Create audit logging for admin actions
- [ ] Write tests for all admin endpoints

#### Technical Notes
- Implement proper authorization middleware
- Consider separate admin database for logs
- Add IP whitelisting option

---

### Issue #20: Implement Notification Service (Email, Push, SMS)
**Labels:** `backend`, `service`, `notifications`, `integration`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Build a multi-channel notification service that sends booking confirmations, flight reminders, refund updates, and promotional messages via email, push notifications, and SMS.

#### Acceptance Criteria
- [ ] Create notification queue with priority levels
- [ ] Implement email templates (booking, reminder, refund)
- [ ] Add push notification support (FCM/APNS)
- [ ] Implement SMS gateway integration (Twilio)
- [ ] Create user preference management
- [ ] Add notification scheduling (24h before flight)
- [ ] Implement delivery tracking and retry logic
- [ ] Write tests for notification flows

#### Technical Notes
- Use Bull queue for reliable delivery
- Consider SendGrid for email
- Add template versioning system

---

### Issue #21: Build Flight Data Synchronization Service
**Labels:** `backend`, `service`, `integration`, `airlines`  
**Difficulty:** Hard  
**Estimated Time:** 5-6 days

#### Description
Create a service that synchronizes flight data from airline systems, Amadeus API, or other flight data providers. Handle real-time updates for delays, cancellations, and gate changes.

#### Acceptance Criteria
- [ ] Implement Amadeus API integration
- [ ] Add airline-specific adapter pattern
- [ ] Create flight data normalization layer
- [ ] Implement real-time webhook processing
- [ ] Add conflict resolution for data discrepancies
- [ ] Create scheduled sync jobs (every 15 minutes)
- [ ] Implement caching strategy for performance
- [ ] Write tests with mocked airline APIs

#### Technical Notes
- Use adapter pattern for multiple airline systems
- Consider CDC (Change Data Capture) for updates
- Add circuit breaker for external API failures

---

### Issue #22: Implement API Rate Limiting and DDoS Protection
**Labels:** `backend`, `security`, `performance`, `api`  
**Difficulty:** Medium  
**Estimated Time:** 2-3 days

#### Description
Enhance API security with tiered rate limiting, DDoS protection, and abuse detection. Different limits for public endpoints vs authenticated users.

#### Acceptance Criteria
- [ ] Implement tiered rate limits (public, user, premium)
- [ ] Add Redis-based sliding window rate limiting
- [ ] Create IP-based blocking for abuse
- [ ] Implement request fingerprinting
- [ ] Add alerting for DDoS attempts
- [ ] Create whitelist/blacklist management
- [ ] Add rate limit headers to responses
- [ ] Write tests for rate limiting behavior

#### Technical Notes
- Use rate-limiter-flexible library
- Consider Cloudflare integration
- Add captcha for repeated violations

---

## FRONTEND INTEGRATION (Issues #23-27)

### Issue #23: Integrate Stellar Wallets (Freighter, Albedo, Rabet)
**Labels:** `frontend`, `wallet`, `stellar`, `integration`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Implement wallet connection functionality supporting all major Stellar wallets. Create a unified wallet adapter that handles connection, disconnection, and transaction signing.

#### Acceptance Criteria
- [ ] Create `WalletContext` provider for state management
- [ ] Implement Freighter wallet adapter
- [ ] Add Albedo wallet adapter
- [ ] Implement Rabet wallet adapter
- [ ] Create wallet selection UI modal
- [ ] Add connection persistence (localStorage)
- [ ] Implement transaction signing flow
- [ ] Handle wallet network switching
- [ ] Write tests for wallet adapters

#### Technical Notes
- Use @stellar/freighter-api for Freighter
- Follow Stellar wallet standard patterns
- Consider wallet abstraction for future wallets

---

### Issue #24: Build Booking Flow with Smart Contract Interaction
**Labels:** `frontend`, `booking`, `soroban`, `integration`  
**Difficulty:** Hard  
**Estimated Time:** 5-6 days

#### Description
Complete the end-to-end booking flow that guides users through flight selection, payment confirmation, smart contract interaction, and booking confirmation with transaction status tracking.

#### Acceptance Criteria
- [ ] Update booking page to call backend API
- [ ] Implement Soroban transaction building
- [ ] Add transaction signing with connected wallet
- [ ] Create transaction status polling component
- [ ] Implement error handling and retry logic
- [ ] Add booking confirmation with transaction hash
- [ ] Create "View on Stellar Expert" link
- [ ] Write tests for booking flow

#### Technical Notes
- Use soroban-client for contract calls
- Implement optimistic UI updates
- Add transaction history to user dashboard

---

### Issue #25: Implement Real-Time Flight Updates (WebSocket)
**Labels:** `frontend`, `real-time`, `websocket`, `flights`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Add WebSocket integration to the frontend for real-time flight price updates, availability changes, and booking status updates without page refresh.

#### Acceptance Criteria
- [ ] Create WebSocket connection manager
- [ ] Implement reconnection logic with backoff
- [ ] Add flight price update notifications
- [ ] Create booking status change indicators
- [ ] Implement toast notifications for updates
- [ ] Add connection status indicator
- [ ] Handle WebSocket authentication
- [ ] Write tests for WebSocket handling

#### Technical Notes
- Use Socket.io or native WebSocket
- Implement circuit breaker for connection issues
- Consider using SWR for data fetching

---

### Issue #26: Create Loyalty Dashboard with Points History
**Labels:** `frontend`, `loyalty`, `dashboard`, `ui`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Build a comprehensive loyalty dashboard showing current tier, points balance, tier benefits, points earning history, and progress to next tier.

#### Acceptance Criteria
- [ ] Create loyalty dashboard page
- [ ] Implement tier progress visualization
- [ ] Add points history table with pagination
- [ ] Create tier benefits display
- [ ] Implement points redemption UI
- [ ] Add tier comparison chart
- [ ] Create referral invitation section
- [ ] Write tests for loyalty components

#### Technical Notes
- Use recharts for visualizations
- Implement optimistic updates for redemption
- Add confetti animation for tier upgrades

---

### Issue #27: Build Governance Voting Interface
**Labels:** `frontend`, `governance`, `voting`, `dao`  
**Difficulty:** Hard  
**Estimated Time:** 4-5 days

#### Description
Create a governance interface where TRQ token holders can view proposals, cast votes, delegate voting power, and see voting results. Include proposal creation for authorized users.

#### Acceptance Criteria
- [ ] Create proposals listing page
- [ ] Implement proposal detail view with voting
- [ ] Add voting power display
- [ ] Create delegation management UI
- [ ] Implement vote confirmation with signing
- [ ] Add proposal creation form (for admins)
- [ ] Create voting history view
- [ ] Write tests for governance components

#### Technical Notes
- Use snapshot-style voting UI patterns
- Implement voting power calculation
- Add time-remaining countdowns

---

## DEVOPS & INFRASTRUCTURE (Issues #28-30)

### Issue #28: Set up CI/CD Pipeline with Contract Deployment
**Labels:** `devops`, `ci-cd`, `deployment`, `automation`  
**Estimated Time:** 4-5 days

#### Description
Create a complete CI/CD pipeline using GitHub Actions that runs tests, builds contracts, deploys to testnet automatically, and handles mainnet deployment with approval.

#### Acceptance Criteria
- [ ] Create `.github/workflows/ci.yml` for pull requests
- [ ] Add contract compilation and testing jobs
- [ ] Implement automatic testnet deployment on merge
- [ ] Create manual workflow for mainnet deployment
- [ ] Add contract address management (secrets)
- [ ] Implement frontend build and deployment
- [ ] Add notification on deployment success/failure
- [ ] Document deployment process

#### Technical Notes
- Use soroban-cli in GitHub Actions
- Store contract IDs as repository secrets
- Consider using terraform for infrastructure

---

### Issue #29: Create Docker Development Environment
**Labels:** `devops`, `docker`, `development`, `setup`  
**Difficulty:** Medium  
**Estimated Time:** 2-3 days

#### Description
Build a complete Docker Compose setup for local development including PostgreSQL, Redis, backend, frontend, and a local Stellar node for testing.

#### Acceptance Criteria
- [ ] Create `Dockerfile` for backend
- [ ] Add `Dockerfile` for frontend
- [ ] Create `docker-compose.yml` with all services
- [ ] Add local Stellar node (quickstart image)
- [ ] Implement hot-reload for development
- [ ] Add volume mounts for code editing
- [ ] Create environment configuration
- [ ] Write comprehensive README for setup

#### Technical Notes
- Use stellar/quickstart for local node
- Consider multi-stage builds for optimization
- Add health checks for dependencies

---

### Issue #30: Implement Monitoring and Alerting Stack
**Labels:** `devops`, `monitoring`, `alerting`, `infrastructure`  
**Difficulty:** Medium  
**Estimated Time:** 3-4 days

#### Description
Set up comprehensive monitoring using Prometheus, Grafana, and PagerDuty (or similar) for tracking API performance, contract events, errors, and business metrics.

#### Acceptance Criteria
- [ ] Add Prometheus metrics endpoint to backend
- [ ] Create custom metrics (bookings, refunds, errors)
- [ ] Set up Grafana dashboards for key metrics
- [ ] Implement log aggregation (Loki or ELK)
- [ ] Add alerting rules for critical issues
- [ ] Create on-call rotation documentation
- [ ] Implement contract event monitoring
- [ ] Write runbook for common alerts

#### Technical Notes
- Use prom-client for Node.js metrics
- Create separate dashboard for business metrics
- Add alerts for low wallet balances

---

## How to Claim an Issue

1. Comment on the issue with `/claim` to assign yourself
2. Fork the repository and create a feature branch
3. Follow the coding standards in CONTRIBUTING.md
4. Submit a pull request linking to the issue
5. Request review from maintainers

## Questions?

Join our Discord community or ask questions in the issue comments. We're here to help!
