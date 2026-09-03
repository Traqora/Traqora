#![no_std]
use access::{AccessControl, Role};
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

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
        let id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("next_id"))
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&symbol_short!("next_id"), &(id + 1));
        id
    }

    pub fn get_total_refunded(env: &Env, booking_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&(symbol_short!("ref_tot"), booking_id))
            .unwrap_or(0)
    }

    pub fn set_total_refunded(env: &Env, booking_id: u64, total: i128) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("ref_tot"), booking_id), &total);
    }

    pub fn has_idempotency(env: &Env, booking_id: u64, key: &Symbol) -> bool {
        env.storage()
            .persistent()
            .has(&(symbol_short!("idem"), booking_id, key.clone()))
    }

    pub fn set_idempotency(env: &Env, booking_id: u64, key: &Symbol) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("idem"), booking_id, key.clone()), &true);
    }
}

#[contractclient(name = "RefundClient")]
pub trait RefundContractTrait {
    fn initialize(env: Env, owner: Address);
    fn request_refund(
        env: Env,
        passenger: Address,
        booking_id: u64,
        amount: i128,
        currency: Symbol,
        reason: Symbol,
    ) -> u64;
    fn process_refund(env: Env, admin: Address, request_id: u64);
    fn calculate_refund(
        env: Env,
        airline: Address,
        original_price: i128,
        departure_time: u64,
    ) -> i128;
    fn approve_refund(env: Env, admin: Address, request_id: u64, approved_amount: i128);
    fn reject_refund(env: Env, admin: Address, request_id: u64, reason: Symbol);
    fn set_refund_policy(
        env: Env,
        airline: Address,
        cancellation_window: u64,
        full_refund_percentage: u32,
        partial_refund_percentage: u32,
        no_refund_window: u64,
    );
    fn get_refund_request(env: Env, request_id: u64) -> Option<RefundRequest>;
    fn get_refund_policy(env: Env, airline: Address) -> Option<RefundPolicy>;
    fn calculate_refund_amount(env: Env, request_id: u64) -> i128;
    fn process_partial_refund(
        env: Env,
        admin: Address,
        booking_id: u64,
        amount: i128,
        idempotency_key: Symbol,
    ) -> i128;
    fn get_total_refunded(env: Env, booking_id: u64) -> i128;
    fn is_idempotent_processed(env: Env, booking_id: u64, idempotency_key: Symbol) -> bool;
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
            (
                airline,
                env.ledger().timestamp(),
                cancellation_window,
                full_refund_percentage,
            ),
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
            (
                passenger,
                env.ledger().timestamp(),
                request_id,
                booking_id,
                amount,
            ),
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

        // Update per-booking total for partial refund support (idempotent via request status)
        let current = RefundStorageKey::get_total_refunded(&env, request.booking_id);
        let new_total = current + request.amount;
        assert!(new_total >= current, "Overflow");
        RefundStorageKey::set_total_refunded(&env, request.booking_id, new_total);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("approved")),
            (
                request.passenger,
                env.ledger().timestamp(),
                request_id,
                request.booking_id,
                request.amount,
            ),
        );
    }

    pub fn approve_refund(env: Env, admin: Address, request_id: u64, approved_amount: i128) {
        AccessControl::require_operator(&env, &admin);
        assert!(approved_amount > 0, "Invalid amount");

        let mut request =
            RefundStorageKey::get_request(&env, request_id).expect("Refund request not found");

        assert!(
            request.status == symbol_short!("pending"),
            "Request already processed"
        );

        request.status = symbol_short!("approved");
        request.processed_at = Some(env.ledger().timestamp());

        RefundStorageKey::set_request(&env, request_id, &request);

        // Update per-booking total with approved_amount (supports partial refunds)
        let current = RefundStorageKey::get_total_refunded(&env, request.booking_id);
        let new_total = current + approved_amount;
        assert!(new_total >= current, "Overflow");
        RefundStorageKey::set_total_refunded(&env, request.booking_id, new_total);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("approved")),
            (
                request.passenger,
                env.ledger().timestamp(),
                request_id,
                approved_amount,
                request.amount,
            ),
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
            (
                request.passenger,
                env.ledger().timestamp(),
                request_id,
                request.booking_id,
                reason,
            ),
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

    /// Process a partial refund for a booking with idempotency guard.
    /// `idempotency_key` ensures the same logical refund is not double-settled.
    /// Returns the new total refunded for the booking.
    pub fn process_partial_refund(
        env: Env,
        admin: Address,
        booking_id: u64,
        amount: i128,
        idempotency_key: Symbol,
    ) -> i128 {
        AccessControl::require_operator(&env, &admin);
        assert!(amount > 0, "Invalid amount");
        // Idempotency: if key already processed for this booking, return current total without double-settling
        if RefundStorageKey::has_idempotency(&env, booking_id, &idempotency_key) {
            return RefundStorageKey::get_total_refunded(&env, booking_id);
        }
        let current = RefundStorageKey::get_total_refunded(&env, booking_id);
        let new_total = current + amount;
        // Prevent overflow and ensure deterministic
        assert!(new_total >= current, "Overflow");
        RefundStorageKey::set_total_refunded(&env, booking_id, new_total);
        RefundStorageKey::set_idempotency(&env, booking_id, &idempotency_key);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("partial")),
            (admin, env.ledger().timestamp(), booking_id, amount, new_total),
        );

        new_total
    }

    pub fn get_total_refunded(env: Env, booking_id: u64) -> i128 {
        RefundStorageKey::get_total_refunded(&env, booking_id)
    }

    pub fn is_idempotent_processed(env: Env, booking_id: u64, idempotency_key: Symbol) -> bool {
        RefundStorageKey::has_idempotency(&env, booking_id, &idempotency_key)
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

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        Env, Symbol,
    };

    fn setup_refund<'a>(env: &'a Env, owner: &'a Address) -> (Address, crate::RefundContractClient<'a>) {
        let contract_id = env.register(crate::RefundContract, ());
        let client = crate::RefundContractClient::new(env, &contract_id);
        client.initialize(owner);
        // Make owner an operator for refund processing
        client.set_role(owner, owner, &2, &true);
        (contract_id, client)
    }

    #[test]
    fn test_partial_refund_multiple_transactions() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let (_, client) = setup_refund(&env, &owner);
        let booking_id = 42u64;
        let key1 = Symbol::new(&env, "idem1");
        let key2 = Symbol::new(&env, "idem2");
        let key3 = Symbol::new(&env, "idem3");

        let total1 = client.process_partial_refund(&admin, &booking_id, &30_0000000, &key1);
        assert_eq!(total1, 30_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 30_0000000);

        let total2 = client.process_partial_refund(&admin, &booking_id, &20_0000000, &key2);
        assert_eq!(total2, 50_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 50_0000000);

        let total3 = client.process_partial_refund(&admin, &booking_id, &10_0000000, &key3);
        assert_eq!(total3, 60_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 60_0000000);
    }

    #[test]
    fn test_partial_refund_idempotency_guards_double_settlement() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let (_, client) = setup_refund(&env, &owner);
        let booking_id = 99u64;
        let key = Symbol::new(&env, "idemkey");

        let first = client.process_partial_refund(&admin, &booking_id, &25_0000000, &key);
        assert_eq!(first, 25_0000000);
        assert!(client.is_idempotent_processed(&booking_id, &key));

        // Second call with same key and same amount should be idempotent (no double settlement)
        let second = client.process_partial_refund(&admin, &booking_id, &25_0000000, &key);
        assert_eq!(second, 25_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 25_0000000);

        // Same key but different amount should still be idempotent (first amount wins)
        let third = client.process_partial_refund(&admin, &booking_id, &50_0000000, &key);
        assert_eq!(third, 25_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 25_0000000);

        // New key should process
        let new_key = Symbol::new(&env, "newkey");
        let fourth = client.process_partial_refund(&admin, &booking_id, &10_0000000, &new_key);
        assert_eq!(fourth, 35_0000000);
    }

    #[test]
    fn test_partial_refund_via_request_flow_updates_total() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let passenger = Address::generate(&env);
        let (_, client) = setup_refund(&env, &owner);
        let booking_id = 123u64;

        // Create two partial refund requests for same booking
        let req1 = client.request_refund(&passenger, &booking_id, &30_0000000, &Symbol::new(&env, "USDC"), &Symbol::new(&env, "part1"));
        let req2 = client.request_refund(&passenger, &booking_id, &20_0000000, &Symbol::new(&env, "USDC"), &Symbol::new(&env, "part2"));

        client.process_refund(&admin, &req1);
        assert_eq!(client.get_total_refunded(&booking_id), 30_0000000);

        client.process_refund(&admin, &req2);
        assert_eq!(client.get_total_refunded(&booking_id), 50_0000000);

        // Approve with different approved amount also updates total
        let req3 = client.request_refund(&passenger, &booking_id, &40_0000000, &Symbol::new(&env, "USDC"), &Symbol::new(&env, "part3"));
        client.approve_refund(&admin, &req3, &15_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 65_0000000);
    }

    #[test]
    fn test_partial_refund_approve_updates_total() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let passenger = Address::generate(&env);
        let (_, client) = setup_refund(&env, &owner);
        let booking_id = 555u64;
        let req = client.request_refund(&passenger, &booking_id, &100_0000000, &Symbol::new(&env, "USDC"), &Symbol::new(&env, "reason"));
        client.approve_refund(&admin, &req, &40_0000000);
        assert_eq!(client.get_total_refunded(&booking_id), 40_0000000);
        // Verify request is approved
        let r = client.get_refund_request(&req).unwrap();
        assert_eq!(r.status, Symbol::new(&env, "approved"));
    }

    #[test]
    #[should_panic(expected = "Invalid amount")]
    fn test_partial_refund_invalid_amount_zero() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let (_, client) = setup_refund(&env, &owner);
        client.process_partial_refund(&admin, &1, &0, &Symbol::new(&env, "key"));
    }

    #[test]
    #[should_panic(expected = "Invalid amount")]
    fn test_partial_refund_invalid_amount_negative() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let (_, client) = setup_refund(&env, &owner);
        client.process_partial_refund(&admin, &1, &-10, &Symbol::new(&env, "key"));
    }

    #[test]
    fn test_partial_refund_deterministic_and_isolated() {
        for _ in 0..3 {
            let env = Env::default();
            env.mock_all_auths();
            let owner = Address::generate(&env);
            let admin = owner.clone();
            let (_, client) = setup_refund(&env, &owner);
            let booking_a = 1u64;
            let booking_b = 2u64;
            let key_a = Symbol::new(&env, "keyA");
            let key_b = Symbol::new(&env, "keyB");
            client.process_partial_refund(&admin, &booking_a, &10_0000000, &key_a);
            client.process_partial_refund(&admin, &booking_b, &20_0000000, &key_b);
            assert_eq!(client.get_total_refunded(&booking_a), 10_0000000);
            assert_eq!(client.get_total_refunded(&booking_b), 20_0000000);
            // Idempotency is per-booking
            assert!(client.is_idempotent_processed(&booking_a, &key_a));
            assert!(!client.is_idempotent_processed(&booking_a, &key_b));
            assert!(!client.is_idempotent_processed(&booking_b, &key_a));
        }
    }

    #[test]
    #[should_panic(expected = "Request already processed")]
    fn test_double_settlement_via_same_request_id_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let admin = owner.clone();
        let passenger = Address::generate(&env);
        let (_, client) = setup_refund(&env, &owner);
        let req = client.request_refund(&passenger, &777, &10_0000000, &Symbol::new(&env, "USDC"), &Symbol::new(&env, "reason"));
        client.process_refund(&admin, &req);
        // Second process should panic (idempotency via status)
        client.process_refund(&admin, &req);
    }
}
