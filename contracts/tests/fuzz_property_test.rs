use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};
use proptest::prelude::*;
use traqora_contracts::token::{TRQTokenContract, TRQTokenContractClient};

mod common;
use common::{new_env, generate_actors, register_contracts, initialize_token};

proptest! {
    #[test]
    fn token_transfer_conserves_total_supply(x in 1i128..10_000i128, y in 1i128..10_000i128, a in 1i128..10_000i128) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);

        // Mint to two accounts
        contracts.token.mint(&actors.admin, &actors.passenger, &x);
        contracts.token.mint(&actors.admin, &actors.airline, &y);

        // Precondition: ensure a <= x
        let amt = if a > x { x } else { a };
        // Transfer from passenger to airline
        if amt > 0 {
            contracts.token.transfer(&actors.passenger, &actors.airline, &amt);
        }

        let total = contracts.token.total_supply();
        let sum = contracts.token.balance_of(&actors.passenger) + contracts.token.balance_of(&actors.airline);
        prop_assert_eq!(total, x + y);
        prop_assert_eq!(sum, x + y);
    }
}

proptest! {
    #[test]
    fn approve_and_transfer_from_respects_allowance(amount in 1i128..5_000i128, allowance in 1i128..5_000i128, seq in 1u32..100u32) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);

        contracts.token.mint(&actors.admin, &actors.passenger, &amount.max(allowance));

        // Set allowance with expiration; rely on default ledger sequence
        contracts.token.approve(&actors.passenger, &actors.airline, &allowance, &(seq + 1));

        let transfer_amt = std::cmp::min(amount, allowance);
        contracts.token.transfer_from(&actors.airline, &actors.passenger, &actors.airline, &transfer_amt);

        // Remaining allowance equals allowance - transfer_amt
        let remaining = contracts.token.allowance(&actors.passenger, &actors.airline);
        prop_assert_eq!(remaining, allowance - transfer_amt);
    }
}
