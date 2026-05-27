use proptest::prelude::*;
use soroban_sdk::Symbol;

mod common;
use common::{
    generate_actors, initialize_token, new_env, register_and_verify_airline, register_contracts,
};

proptest! {
    /// Token invariant: total supply equals sum of all balances after any transfer
    #[test]
    fn prop_token_total_supply_invariant(
        initial_mint in 1i128..1_000_000_000i128,
        transfer_amount in 0i128..1_000_000_000i128
    ) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);

        contracts.token.mint(&actors.admin, &actors.passenger, &initial_mint);

        let transfer_amt = if transfer_amount > initial_mint { initial_mint } else { transfer_amount };
        if transfer_amt > 0 {
            contracts.token.transfer(&actors.passenger, &actors.airline, &transfer_amt);
        }

        let total = contracts.token.total_supply();
        let passenger_bal = contracts.token.balance_of(&actors.passenger);
        let airline_bal = contracts.token.balance_of(&actors.airline);

        prop_assert_eq!(total, initial_mint);
        prop_assert_eq!(passenger_bal + airline_bal, initial_mint);
    }
}

proptest! {
    /// Refund invariant: calculated refund never exceeds original price
    #[test]
    fn prop_refund_never_exceeds_price(
        price in 100i128..1_000_000_000i128,
        days_before_flight in 1u32..365u32
    ) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);
        register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

        contracts.refund.set_refund_policy(
            &actors.airline,
            &86_400,
            &7_776_000,     // 90 days full refund
            &2_592_000,     // 30 days partial
            &3_600,
        );

        let flight_time = env.ledger().timestamp() as u32 + (days_before_flight * 86_400);

        let refund = contracts.refund.calculate_refund(
            &actors.airline,
            &price,
            &(flight_time as i64),
        );

        prop_assert!(refund <= price);
        prop_assert!(refund >= 0);
    }
}

proptest! {
    /// Booking invariant: booking ID must be sequential and unique
    #[test]
    fn prop_booking_ids_are_sequential(
        booking_count in 1u32..20u32
    ) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);
        register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

        let price = 500_0000000i128;
        contracts
            .token
            .mint(&actors.admin, &actors.passenger, &(price * booking_count as i128));

        let mut booking_ids = Vec::new();
        for i in 0..booking_count {
            let booking_id = contracts.booking.create_booking(
                &actors.passenger,
                &actors.airline,
                &Symbol::new(&env, &format!("TQ{}", 800 + i)),
                &Symbol::new(&env, "ATL"),
                &Symbol::new(&env, "MIA"),
                &(env.ledger().timestamp() + (100_000 * (i as i64))),
                &price,
                &contracts.token.address,
            );
            booking_ids.push(booking_id);
        }

        // Verify all IDs are unique
        for i in 0..booking_ids.len() {
            for j in (i + 1)..booking_ids.len() {
                prop_assert_ne!(booking_ids[i], booking_ids[j]);
            }
        }

        // Verify IDs are mostly sequential (allowing for gaps)
        for i in 1..booking_ids.len() {
            prop_assert!(booking_ids[i] > booking_ids[i - 1]);
        }
    }
}

proptest! {
    /// Loyalty points invariant: points awarded should be proportional to price
    #[test]
    fn prop_loyalty_points_scale_with_price(
        price1 in 100_000_000i128..1_000_000_000i128,
        price2 in 100_000_000i128..1_000_000_000i128
    ) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);
        register_and_verify_airline(&env, &contracts.airline, &actors.admin, &actors.airline);

        contracts.loyalty.init_loyalty();

        let total_mint = if price1 > price2 { price1 } else { price2 } * 2;
        contracts
            .token
            .mint(&actors.admin, &actors.passenger, &total_mint);

        let booking1 = contracts.booking.create_booking(
            &actors.passenger,
            &actors.airline,
            &Symbol::new(&env, "TQ901"),
            &Symbol::new(&env, "PHL"),
            &Symbol::new(&env, "MSY"),
            &(env.ledger().timestamp() + 300_000),
            &price1,
            &contracts.token.address,
        );
        contracts.booking.pay_for_booking(&booking1);
        let points1 = contracts.loyalty.award_points(&actors.passenger, &price1, &booking1);

        let booking2 = contracts.booking.create_booking(
            &actors.passenger,
            &actors.airline,
            &Symbol::new(&env, "TQ902"),
            &Symbol::new(&env, "DFW"),
            &Symbol::new(&env, "IAD"),
            &(env.ledger().timestamp() + 400_000),
            &price2,
            &contracts.token.address,
        );
        contracts.booking.pay_for_booking(&booking2);
        let points2 = contracts.loyalty.award_points(&actors.passenger, &price2, &booking2);

        // Points should scale with price (higher price → higher points)
        if price1 > price2 {
            prop_assert!(points1 > points2);
        } else if price2 > price1 {
            prop_assert!(points2 > points1);
        }
    }
}
