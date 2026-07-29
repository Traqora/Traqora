#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contractclient, symbol_short, Address, Env, Symbol};
use access::{AccessControl, Role};

#[contracttype]
#[derive(Clone)]
pub struct RefundRequest {
    pub request_id: u64,
    pub booking_id: u64,
    pub passenger: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub reason: Symbol,
    pub status: Symbol,
    pub created_at: u64,
    pub processed_at: Option<u64>,
}

#[contracttype]
pub struct RefundPolicy {
    pub cancellation_window: u64,
    pub full_refund_percentage: u32,
    pub partial_refund_percentage: u32,
    pub no_refund_window: u64,
}

pub struct RefundStorageKey;

impl RefundStorageKey {
    pub fn get_request(env: &Env, request_id: u64) -> Option<RefundRequest> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("refund"), request_id))
    }

    pub fn set_request(env: &Env, request_id: u64, request: &RefundRequest) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("refund"), request_id), request);
    }

    pub fn get_policy(env: &Env, airline: &Address) -> Option<RefundPolicy> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("policy"), airline))
    }

    pub fn set_policy(env: &Env, airline: &Address, policy: &RefundPolicy) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("policy"), airline), policy);
    }

    pub fn next_id(env: &Env) -> u64 {
        let id: u64 = env.storage().instance().get(&symbol_short!("next_id")).unwrap_or(1);
        env.storage().instance().set(&symbol_short!("next_id"), &(id + 1));
        id
    }
}

#[contractclient(name = "RefundClient")]
pub trait RefundContractTrait {
    fn initialize(env: Env, owner: Address);
    fn request_refund(env: Env, passenger: Address, booking_id: u64, amount: i128, currency: Symbol, reason: Symbol) -> u64;
    fn process_refund(env: Env, admin: Address, request_id: u64);
    fn calculate_refund(env: Env, airline: Address, original_price: i128, departure_time: u64) -> i128;
    fn approve_refund(env: Env, admin: Address, request_id: u64, approved_amount: i128);
    fn reject_refund(env: Env, admin: Address, request_id: u64, reason: Symbol);
    fn set_refund_policy(env: Env, airline: Address, cancellation_window: u64, full_refund_percentage: u32, partial_refund_percentage: u32, no_refund_window: u64);
    fn get_refund_request(env: Env, request_id: u64) -> Option<RefundRequest>;
    fn get_refund_policy(env: Env, airline: Address) -> Option<RefundPolicy>;
    fn calculate_refund_amount(env: Env, request_id: u64) -> i128;
}

#[contract]
pub struct RefundContract;

#[contractimpl]
impl RefundContract {
    pub fn initialize(env: Env, owner: Address) {
        AccessControl::init_owner(&env, &owner);
    }

    pub fn set_refund_policy(
        env: Env,
        airline: Address,
        cancellation_window: u64,
        full_refund_percentage: u32,
        partial_refund_percentage: u32,
        no_refund_window: u64,
    ) {
        AccessControl::require_operator(&env, &airline);

        let policy = RefundPolicy {
            cancellation_window,
            full_refund_percentage,
            partial_refund_percentage,
            no_refund_window,
        };

        RefundStorageKey::set_policy(&env, &airline, &policy);

        env.events().publish(
            (symbol_short!("policy"), symbol_short!("set")),
            (airline, env.ledger().timestamp(), cancellation_window, full_refund_percentage),
        );
    }

    pub fn request_refund(
        env: Env,
        passenger: Address,
        booking_id: u64,
        amount: i128,
        currency: Symbol,
        reason: Symbol,
    ) -> u64 {
        passenger.require_auth();

        let request_id = RefundStorageKey::next_id(&env);

        let request = RefundRequest {
            request_id,
            booking_id,
            passenger: passenger.clone(),
            amount,
            currency,
            reason,
            status: symbol_short!("pending"),
            created_at: env.ledger().timestamp(),
            processed_at: None,
        };

        RefundStorageKey::set_request(&env, request_id, &request);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("requested")),
            (passenger, env.ledger().timestamp(), request_id, booking_id, amount),
        );

        request_id
    }

    pub fn process_refund(env: Env, admin: Address, request_id: u64) {
        AccessControl::require_operator(&env, &admin);

        let mut request =
            RefundStorageKey::get_request(&env, request_id).expect("Refund request not found");

        assert!(
            request.status == symbol_short!("pending"),
            "Request already processed"
        );

        request.status = symbol_short!("approved");
        request.processed_at = Some(env.ledger().timestamp());

        RefundStorageKey::set_request(&env, request_id, &request);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("approved")),
            (request.passenger, env.ledger().timestamp(), request_id, request.booking_id, request.amount),
        );
    }

    pub fn approve_refund(env: Env, admin: Address, request_id: u64, approved_amount: i128) {
        AccessControl::require_operator(&env, &admin);

        let mut request =
            RefundStorageKey::get_request(&env, request_id).expect("Refund request not found");

        assert!(
            request.status == symbol_short!("pending"),
            "Request already processed"
        );

        request.status = symbol_short!("approved");
        request.processed_at = Some(env.ledger().timestamp());

        RefundStorageKey::set_request(&env, request_id, &request);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("approved")),
            (request.passenger, env.ledger().timestamp(), request_id, approved_amount, request.amount),
        );
    }

    pub fn reject_refund(env: Env, admin: Address, request_id: u64, reason: Symbol) {
        AccessControl::require_operator(&env, &admin);

        let mut request =
            RefundStorageKey::get_request(&env, request_id).expect("Refund request not found");

        assert!(
            request.status == symbol_short!("pending"),
            "Request already processed"
        );

        request.status = symbol_short!("rejected");
        request.processed_at = Some(env.ledger().timestamp());

        RefundStorageKey::set_request(&env, request_id, &request);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("rejected")),
            (request.passenger, env.ledger().timestamp(), request_id, request.booking_id, reason),
        );
    }

    pub fn get_refund_request(env: Env, request_id: u64) -> Option<RefundRequest> {
        RefundStorageKey::get_request(&env, request_id)
    }

    pub fn get_refund_policy(env: Env, airline: Address) -> Option<RefundPolicy> {
        RefundStorageKey::get_policy(&env, &airline)
    }

    pub fn calculate_refund(
        env: Env,
        airline: Address,
        original_price: i128,
        departure_time: u64,
    ) -> i128 {
        let policy = RefundStorageKey::get_policy(&env, &airline).expect("No refund policy found");

        let current_time = env.ledger().timestamp();
        let time_until_departure = departure_time.saturating_sub(current_time);

        if time_until_departure >= policy.cancellation_window {
            original_price * policy.full_refund_percentage as i128 / 10000
        } else if time_until_departure >= policy.no_refund_window {
            original_price * policy.partial_refund_percentage as i128 / 10000
        } else {
            0
        }
    }

    pub fn calculate_refund_amount(env: Env, request_id: u64) -> i128 {
        let request =
            RefundStorageKey::get_request(&env, request_id).expect("Refund request not found");
        request.amount
    }

    pub fn set_role(env: Env, caller: Address, target: Address, role: u32, enabled: bool) {
        let role_enum = match role {
            1 => Role::Admin,
            2 => Role::Operator,
            _ => panic!("Invalid role"),
        };
        AccessControl::set_role(&env, &caller, &target, role_enum, enabled);
    }

    pub fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
        AccessControl::transfer_ownership(&env, &caller, &new_owner);
    }

    pub fn get_owner(env: Env) -> Address {
        AccessControl::get_owner(&env)
    }

    pub fn has_role(env: Env, address: Address, role: u32) -> bool {
        let role_enum = match role {
            0 => Role::Owner,
            1 => Role::Admin,
            2 => Role::Operator,
            _ => return false,
        };
        AccessControl::has_role(&env, &address, role_enum)
    }
}
