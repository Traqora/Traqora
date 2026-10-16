// contracts/token/src/lib.rs (excerpt)
use soroban_sdk::{contract, contractimpl, Address, Env};

@contract
pub struct TraqoraToken;

#[contractimpl]
impl TraqoraToken {
    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        // Enforce admin authorization
        admin.require_auth();
        
        if amount <= 0 {
            panic!("Cannot mint non-positive amount");
        }

        // Mint logic...
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        // Enforce token holder/spender authorization
        from.require_auth();

        if amount <= 0 {
            panic!("Cannot burn non-positive amount");
        }

        // Burn logic...
    }
}