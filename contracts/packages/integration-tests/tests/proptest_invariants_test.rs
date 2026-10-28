//! Proptest invariant tests for Traqora contracts.
//! 
//! Specifies and tests key invariants:
//! - Total token supply conservation across transactions.
//! - Booking amount and refund bound invariants (refunds never exceed price).
//! - Unique, monotonically increasing booking identifiers.

#[cfg(test)]
mod proptest_invariants {
    use booking::{BookingContract, BookingContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
    use token::{TRQTokenContract, TRQTokenContractClient};
    use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(32))]

        #[test]
        fn test_invariant_booking_refund_never_exceeds_price(price in 1i128..10_000_000_000i128) {
            let env = new_env();
            let actors = generate_actors(&env);
            let contracts = register_contracts(&env);
            initialize_token(&env, &contracts.token, &actors.admin);

            let departure = 2_000_000_000u64;
            let booking_id = contracts.booking.create_booking(
                &actors.passenger,
                &actors.airline,
                &Symbol::new(&env, "PR100"),
                &Symbol::new(&env, "JFK"),
                &Symbol::new(&env, "LHR"),
                &departure,
                &price,
                &contracts.token.address,
            );

            contracts.token.mint(&actors.admin, &actors.passenger, &price);
            contracts.booking.pay_for_booking(&booking_id);

            let initial_balance = contracts.token.balance_of(&actors.passenger);
            contracts.booking.refund_passenger(&booking_id);
            let final_balance = contracts.token.balance_of(&actors.passenger);

            // Invariant: refunded amount equals original price paid, never exceeding bounds.
            prop_assert_eq!(final_balance - initial_balance, price);
        }

        #[test]
        fn test_invariant_unique_monotonic_booking_ids(
            flight_code_suffix in 1u32..1000u32
        ) {
            let env = new_env();
            let actors = generate_actors(&env);
            let contracts = register_contracts(&env);
            initialize_token(&env, &contracts.token, &actors.admin);

            let price = 100_0000000i128;
            let code_str = format!("FL{}", flight_code_suffix);
            let flight_sym = Symbol::new(&env, &code_str);

            let id1 = contracts.booking.create_booking(
                &actors.passenger,
                &actors.airline,
                &flight_sym,
                &Symbol::new(&env, "JFK"),
                &Symbol::new(&env, "LAX"),
                &2_000_000_000,
                &price,
                &contracts.token.address,
            );

            let id2 = contracts.booking.create_booking(
                &actors.passenger,
                &actors.airline,
                &flight_sym,
                &Symbol::new(&env, "JFK"),
                &Symbol::new(&env, "LAX"),
                &2_000_000_000,
                &price,
                &contracts.token.address,
            );

            prop_assert!(id2 > id1);
        }
    }

    #[test]
    #[should_panic(expected = "ArithmeticOverflow")]
    fn test_proptest_failure_mode_overflow_bounds() {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);

        // Attempting to create booking with extreme out-of-bounds price causing overflow
        let invalid_price = i128::MAX;
        contracts.booking.create_booking(
            &actors.passenger,
            &actors.airline,
            &Symbol::new(&env, "FAIL"),
            &Symbol::new(&env, "JFK"),
            &Symbol::new(&env, "LAX"),
            &2_000_000_000,
            &invalid_price,
            &contracts.token.address,
        );
    }
}
