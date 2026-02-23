## 1. ✅ CONTRIBUTING.md

```markdown
# Contributing to Traqora

We welcome contributions from everyone interested in building a decentralized travel future with Stellar!

Please take a moment to review this guide to understand how you can contribute effectively.

## 🛠 Ways to Contribute

- Submit bug reports and feature requests
- Review code and documentation
- Write tests and improve tooling
- Translate content or improve UX/UI
- Help onboard new contributors

## 📥 How to Submit a Pull Request (PR)

1. Fork the repository and create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes.
3. Commit your changes using descriptive commit messages.
4. Push your branch to your forked repo:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a Pull Request against the `main` branch of this repo.

## 📋 Code Guidelines

- Use clear, concise, and readable code.
- Follow Soroban best practices for Stellar development.
- Include comments where necessary.
- Ensure all functions have tests.
- Lint and format your code before submitting.

## 🧪 Testing

All contributions should be accompanied by unit or integration tests. Run tests locally before submitting a PR:

```bash
soroban test
```

For frontend contributions:

```bash
npm run lint
npm run test


### Contracts Testing Approach

- Use soroban-sdk testutils to create an Env and mock auth with `env.mock_all_auths()`.
- Reuse shared fixtures in [common.rs](file:///Users/ew/waves2/Traqora/contracts/tests/common.rs) to register contracts and seed actors.
- Write unit tests for every public function across contracts:
  - Token: initialize, mint, transfer, approve, transfer_from, queries
  - Booking: create, pay, release, refund, get, wrappers
  - Airline: register, verify, create_flight, reserve_seat, cancel_flight
  - Loyalty: initialize_tiers, get_or_create_account, award_points, redeem_points, queries
  - Governance: initialize, create_proposal, cast_vote, finalize_proposal, queries
  - Refund: set_refund_policy, request_refund, process_refund, calculate_refund, queries
- Add integration tests that exercise cross-contract flows (booking with token escrow, airline seat reservation, loyalty points).
- Add property-based tests with proptest to validate invariants (e.g., token transfer preserves total supply; allowance decreases correctly).
- Fuzz inputs in constrained domains to avoid panics and maximize path coverage.
- Adjust ledger time and sequence via testutils when needed (e.g., finalizing governance proposals).

### Coverage

- Measure coverage with cargo-llvm-cov (recommended):
  - Install: `cargo install cargo-llvm-cov`
  - Run: `cargo llvm-cov --workspace --lcov --output-path lcov.info`
  - View HTML: `cargo llvm-cov --workspace --open`

Ensure coverage exceeds 90% across contract crates before merging.
