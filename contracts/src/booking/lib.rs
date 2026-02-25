use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, token,
};

#[contracttype]
#[derive(Clone)]
pub struct Booking {
    pub booking_id: u64,
    pub passenger: Address,
    pub airline: Address,
    pub flight_number: Symbol,
    pub from_airport: Symbol,
    pub to_airport: Symbol,
    pub departure_time: u64,
    pub price: i128,
    pub token: Address,
    pub amount_escrowed: i128,
    pub status: Symbol, // "pending", "confirmed", "completed", "cancelled", "refunded"
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct CachedBalance {
    pub amount: i128,
    pub cached_at: u64,
}

pub struct BookingStorage;

impl BookingStorage {
    pub fn get(env: &Env, booking_id: u64) -> Option<Booking> {
        env.storage().persistent().get(&booking_id)
    }

    pub fn set(env: &Env, booking_id: u64, booking: &Booking) {
        env.storage().persistent().set(&booking_id, booking);
    }

    pub fn is_reentrancy_locked(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("r_lock"))
            .unwrap_or(false)
    }

    pub fn set_reentrancy_lock(env: &Env, locked: bool) {
        env.storage()
            .instance()
            .set(&symbol_short!("r_lock"), &locked);
    }

    pub fn get_cached_balance(env: &Env, token: &Address, account: &Address) -> Option<CachedBalance> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("b_cache"), token, account))
    }

    pub fn set_cached_balance(env: &Env, token: &Address, account: &Address, value: &CachedBalance) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("b_cache"), token, account), value);
    }

    pub fn clear_cached_balance(env: &Env, token: &Address, account: &Address) {
        env.storage()
            .persistent()
            .remove(&(symbol_short!("b_cache"), token, account));
    }
}

#[contract]
pub struct BookingContract;

#[contractimpl]
impl BookingContract {
    const BALANCE_CACHE_TTL_SECS: u64 = 30;

    fn begin_external_call(env: &Env) {
        assert!(
            !BookingStorage::is_reentrancy_locked(env),
            "Reentrancy detected"
        );
        BookingStorage::set_reentrancy_lock(env, true);
    }

    fn end_external_call(env: &Env) {
        BookingStorage::set_reentrancy_lock(env, false);
    }

    fn transfer_and_invalidate_cache(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) {
        Self::begin_external_call(env);
        let token_client = token::Client::new(env, token);
        token_client.transfer(from, to, &amount);
        Self::end_external_call(env);

        BookingStorage::clear_cached_balance(env, token, from);
        BookingStorage::clear_cached_balance(env, token, to);
    }

    // Initialize booking - starts in "pending" status until paid
    pub fn create_booking(
        env: Env,
        passenger: Address,
        airline: Address,
        flight_number: Symbol,
        from_airport: Symbol,
        to_airport: Symbol,
        departure_time: u64,
        price: i128,
        token: Address,
    ) -> u64 {
        passenger.require_auth();

        let booking_id = env.ledger().timestamp();

        let booking = Booking {
            booking_id,
            passenger,
            airline,
            flight_number,
            from_airport,
            to_airport,
            departure_time,
            price,
            token,
            amount_escrowed: 0,
            status: symbol_short!("pending"),
            created_at: env.ledger().timestamp(),
        };

        BookingStorage::set(&env, booking_id, &booking);

        // Emit event
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("created")),
            booking_id,
        );

        booking_id
    }

    // Accept payment for the booking and hold in escrow
    pub fn pay_for_booking(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        assert!(
            booking.status == symbol_short!("pending"),
            "Already paid or cancelled"
        );

        booking.passenger.require_auth();

        booking.amount_escrowed = booking.price;
        booking.status = symbol_short!("paying");

        BookingStorage::set(&env, booking_id, &booking);

        // Callback-style finalization around external token transfer.
        Self::transfer_and_invalidate_cache(
            &env,
            &booking.token,
            &booking.passenger,
            &env.current_contract_address(),
            booking.price,
        );

        booking.status = symbol_short!("confirmed");

        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("paid")),
            booking_id,
        );
    }

    // Release payment to airline - post-flight settlement
    pub fn release_payment_to_airline(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        booking.airline.require_auth();

        assert!(
            booking.status == symbol_short!("confirmed"),
            "Invalid booking status"
        );
        assert!(booking.amount_escrowed > 0, "No funds in escrow");

        let released_amount = booking.amount_escrowed;
        booking.amount_escrowed = 0;
        booking.status = symbol_short!("releasg");

        BookingStorage::set(&env, booking_id, &booking);

        Self::transfer_and_invalidate_cache(
            &env,
            &booking.token,
            &env.current_contract_address(),
            &booking.airline,
            released_amount,
        );

        booking.status = symbol_short!("completed");

        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("released")),
            (booking_id, released_amount),
        );
    }

    pub fn oracle_release_payment(env: Env, oracle: Address, booking_id: u64) {
        oracle.require_auth();
        let cfg = BookingStorage::get_oracle_config(&env).expect("Oracle not configured");
        assert!(cfg.oracle == oracle, "Unauthorized");

        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        assert!(
            booking.status == symbol_short!("confirmed"),
            "Invalid booking status"
        );
        assert!(booking.amount_escrowed > 0, "No funds in escrow");

        let token_client = token::Client::new(&env, &booking.token);
        token_client.transfer(
            &env.current_contract_address(),
            &booking.airline,
            &booking.amount_escrowed,
        );

        let released_amount = booking.amount_escrowed;
        booking.amount_escrowed = 0;
        booking.status = symbol_short!("completed");

        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("released")),
            (booking_id, released_amount),
        );
    }

    // Refund passenger for cancelled bookings
    pub fn refund_passenger(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        let current_time = env.ledger().timestamp();

        // For simplicity, require passenger auth and check window
        // In a real app, airline could also trigger this
        booking.passenger.require_auth();
        assert!(
            current_time + 86400 < booking.departure_time,
            "Cancellation window closed"
        );

        assert!(
            booking.status == symbol_short!("confirmed")
                || booking.status == symbol_short!("pending"),
            "Booking cannot be refunded"
        );

        if booking.amount_escrowed > 0 {
            let token_client = token::Client::new(&env, &booking.token);
            token_client.transfer(
                &env.current_contract_address(),
                &booking.passenger,
                &booking.amount_escrowed,
            );
        }

        let refunded_amount = booking.amount_escrowed;
        booking.amount_escrowed = 0;
        booking.status = symbol_short!("refunded");

        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("refunded")),
            (booking_id, refunded_amount),
        );
    }

    pub fn oracle_refund_airline_cancel(env: Env, oracle: Address, booking_id: u64) {
        oracle.require_auth();
        let cfg = BookingStorage::get_oracle_config(&env).expect("Oracle not configured");
        assert!(cfg.oracle == oracle, "Unauthorized");

        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        assert!(
            booking.status == symbol_short!("confirmed")
                || booking.status == symbol_short!("pending"),
            "Booking cannot be refunded"
        );

        let mut refunded_amount = 0i128;
        if booking.amount_escrowed > 0 {
            booking.status = symbol_short!("refding");
            refunded_amount = booking.amount_escrowed;
            booking.amount_escrowed = 0;
            BookingStorage::set(&env, booking_id, &booking);

            Self::transfer_and_invalidate_cache(
                &env,
                &booking.token,
                &env.current_contract_address(),
                &booking.passenger,
                refunded_amount,
            );
        }
        
        booking.amount_escrowed = 0;
        booking.status = symbol_short!("refunded");

        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("refunded")),
            (booking_id, refunded_amount),
        );
    }

    // Helper to get booking details
    pub fn get_booking(env: Env, booking_id: u64) -> Option<Booking> {
        BookingStorage::get(&env, booking_id)
    }

    // Cached token balance lookup for frequent read paths.
    pub fn get_token_balance_cached(env: Env, token: Address, account: Address) -> i128 {
        let now = env.ledger().timestamp();
        if let Some(cache) = BookingStorage::get_cached_balance(&env, &token, &account) {
            if now.saturating_sub(cache.cached_at) <= Self::BALANCE_CACHE_TTL_SECS {
                return cache.amount;
            }
        }

        let token_client = token::Client::new(&env, &token);
        let amount = token_client.balance(&account);

        BookingStorage::set_cached_balance(
            &env,
            &token,
            &account,
            &CachedBalance {
                amount,
                cached_at: now,
            },
        );

        amount
    }

    // Batch settlement for a single airline and token, reducing token contract calls.
    pub fn batch_release_payments(env: Env, airline: Address, booking_ids: Vec<u64>) -> i128 {
        airline.require_auth();
        assert!(booking_ids.len() > 0, "No bookings provided");

        let mut token: Option<Address> = None;
        let mut total_release = 0i128;
        let mut released_amounts: Vec<i128> = Vec::new(&env);

        for booking_id in booking_ids.iter() {
            let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

            assert!(booking.airline == airline, "Unauthorized");
            assert!(booking.status == symbol_short!("confirmed"), "Invalid booking status");
            assert!(booking.amount_escrowed > 0, "No funds in escrow");

            if let Some(ref t) = token {
                assert!(*t == booking.token, "Mixed token batch not supported");
            } else {
                token = Some(booking.token.clone());
            }

            total_release += booking.amount_escrowed;
            released_amounts.push_back(booking.amount_escrowed);
            booking.amount_escrowed = 0;
            booking.status = symbol_short!("releasg");
            BookingStorage::set(&env, booking_id, &booking);
        }

        let token_address = token.expect("Missing token");
        Self::transfer_and_invalidate_cache(
            &env,
            &token_address,
            &env.current_contract_address(),
            &airline,
            total_release,
        );

        for i in 0..booking_ids.len() {
            let booking_id = booking_ids.get(i).expect("Booking id missing");
            let released_amount = released_amounts.get(i).unwrap_or(0);
            let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");
            booking.status = symbol_short!("completed");
            BookingStorage::set(&env, booking_id, &booking);

            env.events().publish(
                (symbol_short!("booking"), symbol_short!("released")),
                (booking_id, released_amount),
            );
        }

        total_release
    }

    // Batch refunds for a single passenger and token, reducing token contract calls.
    pub fn batch_refund_passenger(env: Env, passenger: Address, booking_ids: Vec<u64>) -> i128 {
        passenger.require_auth();
        assert!(booking_ids.len() > 0, "No bookings provided");

        let current_time = env.ledger().timestamp();
        let mut token: Option<Address> = None;
        let mut total_refund = 0i128;

        for booking_id in booking_ids.iter() {
            let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

            assert!(booking.passenger == passenger, "Unauthorized");
            assert!(current_time + 86400 < booking.departure_time, "Cancellation window closed");
            assert!(
                booking.status == symbol_short!("confirmed") || booking.status == symbol_short!("pending"),
                "Booking cannot be refunded"
            );

            if let Some(ref t) = token {
                assert!(*t == booking.token, "Mixed token batch not supported");
            } else {
                token = Some(booking.token.clone());
            }

            total_refund += booking.amount_escrowed;
            booking.amount_escrowed = 0;
            booking.status = symbol_short!("refding");
            BookingStorage::set(&env, booking_id, &booking);
        }

        if total_refund > 0 {
            let token_address = token.expect("Missing token");
            Self::transfer_and_invalidate_cache(
                &env,
                &token_address,
                &env.current_contract_address(),
                &passenger,
                total_refund,
            );
        }

        for booking_id in booking_ids.iter() {
            let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");
            booking.status = symbol_short!("refunded");
            BookingStorage::set(&env, booking_id, &booking);
        }

        total_refund
    }
    
    // Original API wrappers for backward compatibility
    pub fn cancel_booking(env: Env, passenger: Address, booking_id: u64) {
        passenger.require_auth();
        Self::refund_passenger(env, booking_id);
    }

    pub fn complete_booking(env: Env, airline: Address, booking_id: u64) {
        airline.require_auth();
        Self::release_payment_to_airline(env, booking_id);
    }
}
