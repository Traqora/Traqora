# Smart Contract Test Suite Documentation

## Overview

The Traqora smart contract test suite provides comprehensive coverage of all contract modules with:
- **90%+ line coverage target** via cargo-llvm-cov
- **Property-based tests** using proptest for invariant verification
- **Integration tests** for multi-contract workflows
- **Edge case handling** for critical operations
- **Automated CI validation** on every PR

## Test Organization

### Test Files and Responsibilities

#### Core Integration Tests
- **`integration_test.rs`**: Full booking → loyalty → refund workflow
- **`comprehensive_integration_test.rs`**: Extended workflows including:
  - Booking creation → payment → refund policy application → cancellation
  - Booking with dispute resolution → settlement
  - Multi-airline loyalty point accumulation
  - Refund policy changes and reapplication
  - Governance proposal references

#### Property-Based Tests
- **`fuzz_property_test.rs`**: Token invariant testing
  - Total supply conservation across transfers
  - Allowance and transfer_from compliance
- **`advanced_property_tests.rs`**: Critical invariant tests
  - Token total supply invariants
  - Refund amount bounds (never exceeds price)
  - Booking ID sequencing and uniqueness
  - Loyalty points scaling with price

#### Contract-Specific Tests
- **`admin_multisig_test.rs`**: Admin multisig contract (149 tests, from PR #81)
- **`booking_test.rs`**: Booking contract operations
- **`refund_automation_integration_test.rs`**: Automated refund flow
- **`dispute_resolution_test.rs`**: Basic dispute resolution
- **`dispute_resolution_advanced_test.rs`**: Enhanced dispute handling
  - Multiple arbiter scenarios
  - Jury rotation fairness
  - Escrow security verification
  - Independent dispute resolution
- **`loyalty_test.rs`**: Loyalty points system
- **`airline_test.rs`**: Airline registration and verification
- **`governance_test.rs`**: Governance proposal system
- **`oracle_test.rs`**: Price/data oracle integration

#### Security & Edge Cases
- **`access_test.rs`**: Authorization and access control
- **`proxy_access_test.rs`**: Proxy contract access patterns
- **`storage_version_test.rs`**: Contract versioning and upgrades
- **`proxy_test.rs`**: Proxy contract behavior
- **`token_test.rs`**: Token contract comprehensive tests
- **`flight_registry_test.rs`**: Flight data registry
- **`event_assertions_test.rs`**: Event emission validation

#### Common Utilities
- **`common.rs`**: Shared test fixtures and helper functions
  - Environment setup with mock auth
  - Actor (admin, passenger, airline) generation
  - Contract registration and initialization
  - Token initialization
  - Airline registration and verification

## Coverage Targets by Module

| Module | Target | Priority |
|--------|--------|----------|
| Token (TRQ) | 95%+ | Critical |
| Booking | 90%+ | Critical |
| Refund | 90%+ | Critical |
| Refund Automation | 90%+ | Critical |
| Dispute Resolution | 92%+ | High |
| Loyalty | 88%+ | High |
| Airline | 85%+ | Medium |
| Governance | 85%+ | Medium |
| Oracle | 85%+ | Medium |
| Admin/Multisig | 93%+ | Critical |

## Running Tests

### Run All Tests
```bash
cd contracts
cargo test
```

### Run Specific Test File
```bash
cargo test --test comprehensive_integration_test
```

### Run with Verbose Output
```bash
cargo test -- --nocapture
```

### Run Property-Based Tests Only
```bash
cargo test --test fuzz_property_test
cargo test --test advanced_property_tests
```

## Coverage Measurement

### View Summary Report
```bash
cd contracts
./coverage.sh
```

### Generate HTML Report
```bash
cd contracts
./coverage.sh --html
```

### Open HTML Report in Browser
```bash
cd contracts
./coverage.sh --html --open
```

### Manual Coverage with cargo-llvm-cov
```bash
cd contracts
cargo llvm-cov --html --output-dir target/coverage
```

## Key Testing Patterns

### 1. Setup Pattern
```rust
let env = new_env();  // Mock all auths
let actors = generate_actors(&env);  // Admin, passenger, airline
let contracts = register_contracts(&env);  // All contracts
initialize_token(&env, &contracts.token, &actors.admin);
```

### 2. Property-Based Testing
```rust
proptest! {
    #[test]
    fn prop_invariant_name(param in range) {
        // Setup
        // Exercise property
        prop_assert!(condition);
    }
}
```

### 3. Integration Flow Testing
1. Setup contracts and actors
2. Initialize token and airline
3. Create flight
4. Create booking
5. Process payment
6. Verify state transitions
7. Assert final balances

## Critical Invariants to Test

### Token Invariant
- Total supply = sum of all account balances
- Transfer conserves total supply
- Mint increases total supply correctly
- Burn decreases total supply correctly

### Booking Invariant
- Booking IDs are unique and sequential
- Payment state transitions are monotonic
- Only authorized parties can modify booking state
- Refund amount ≤ original price

### Loyalty Invariant
- Points awarded scales with booking price
- Points cannot be negative
- Points awarded only after payment

### Dispute Invariant
- Only designated arbiters can resolve disputes
- Escrow is released only after resolution
- Disputes cannot be reopened after resolution
- Winner is set correctly based on resolution

## CI Integration

### Coverage Requirement
- Minimum 90% line coverage across all modules
- CI fails if coverage drops below threshold
- Coverage report generated for all PRs
- Trend visualization available in workflow artifacts

### Test Execution
- All tests run on every PR to `main`
- Tests cached for faster execution
- Coverage check happens after compilation

## Future Enhancements

1. **Fuzzing**: Integrate cargo-fuzz for deeper fuzzing
2. **Snapshot Testing**: Add snapshot assertions for complex state
3. **Formal Verification**: Use Soroban prover for critical invariants
4. **Performance Benchmarks**: Add criterion for contract performance
5. **Mutation Testing**: Verify test quality with mutation testing

## Troubleshooting

### Coverage Tool Installation Issues
```bash
cargo install cargo-llvm-cov
```

### Test Failures Related to Auth/Env
- Ensure `env.mock_all_auths()` is called in test setup
- Check that all contract calls are properly authorized
- Verify address generation in tests

### Flaky Tests
- Property-based tests may have rare failures; re-run to verify
- Check timestamp-dependent tests for ledger sequencing issues
- Ensure proper test isolation (no shared state)

## Contributing

When adding new tests:
1. Add to appropriate test file or create new one if module-specific
2. Follow naming convention: `test_<operation>_<expected_outcome>`
3. Use `new_env()` and `common.rs` utils for setup
4. Add property-based tests for critical invariants
5. Document complex test scenarios
6. Ensure new tests help reach 90%+ coverage target
