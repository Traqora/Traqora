use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct RefundRequest {
    pub request_id: u64,
    pub booking_id: u64,
    pub passenger: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub reason: Symbol,
    pub status: Symbol, // "pending", "approved", "rejected", "processed"
    pub created_at: u64,
    pub processed_at: Option<u64>,
}

#[contracttype]
pub struct RefundPolicy {
    pub cancellation_window: u64,    // seconds before departure
    pub full_refund_percentage: u32, // basis points (10000 = 100%)
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

#[contract]
pub struct RefundContract;

#[contractimpl]
impl RefundContract {
    // Set refund policy for airline
    pub fn set_refund_policy(
        env: Env,
        airline: Address,
        cancellation_window: u64,
        full_refund_percentage: u32,
        partial_refund_percentage: u32,
        no_refund_window: u64,
    ) {
        airline.require_auth();

        let policy = RefundPolicy {
            cancellation_window,
            full_refund_percentage,
            partial_refund_percentage,
            no_refund_window,
        };

        RefundStorageKey::set_policy(&env, &airline, &policy);

        env.events().publish(
            (symbol_short!("policy"), symbol_short!("set")),
            (airline.clone(), env.ledger().timestamp(), cancellation_window, full_refund_percentage),
        );
    }

    // Request refund (automatic if within policy)
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
            passenger,
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
            (request.passenger.clone(), env.ledger().timestamp(), request_id, booking_id, amount),
        );

        request_id
    }

    // Process refund (trigger token transfer)
    pub fn process_refund(env: Env, _admin: Address, request_id: u64) {
        // TODO: Check admin authorization

        let mut request =
            RefundStorageKey::get_request(&env, request_id).expect("Refund request not found");

        assert!(
            request.status == symbol_short!("pending"),
            "Request already processed"
        );

        request.status = symbol_short!("approved");
        request.processed_at = Some(env.ledger().timestamp());

        RefundStorageKey::set_request(&env, request_id, &request);

        // Emit event for backend to trigger actual token transfer
        env.events().publish(
            (symbol_short!("refund"), symbol_short!("approved")),
            (request.passenger.clone(), env.ledger().timestamp(), request_id, request.booking_id, request.amount),
        );
    }

    // Reject a refund request
    pub fn reject_refund(env: Env, _admin: Address, request_id: u64, reason: Symbol) {
        // TODO: Check admin authorization

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
            (request.passenger.clone(), env.ledger().timestamp(), request_id, request.booking_id, reason),
        );
    }

    pub fn get_refund_request(env: Env, request_id: u64) -> Option<RefundRequest> {
        RefundStorageKey::get_request(&env, request_id)
    }

    pub fn get_refund_policy(env: Env, airline: Address) -> Option<RefundPolicy> {
        RefundStorageKey::get_policy(&env, &airline)
    }

    // Calculate refund amount based on policy and timing
    pub fn calculate_refund(
        env: Env,
        airline: Address,
        original_price: i128,
        departure_time: u64,
    ) -> i128 {
        let policy = RefundStorageKey::get_policy(&env, &airline).expect("No refund policy found");

        let current_time = env.ledger().timestamp();
        let time_until_departure = departure_time - current_time;

        if time_until_departure >= policy.cancellation_window {
            // Full refund
            original_price * policy.full_refund_percentage as i128 / 10000
        } else if time_until_departure >= policy.no_refund_window {
            // Partial refund
            original_price * policy.partial_refund_percentage as i128 / 10000
        } else {
            // No refund
            0
        }
    }
}
