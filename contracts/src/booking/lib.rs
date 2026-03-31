use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, token};

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
pub struct BatchFailure {
    pub index: u32,
    pub booking_id: u64,
    pub reason: Symbol,
}

#[contracttype]
#[derive(Clone)]
pub struct BatchCompleteBookingsResult {
    pub completed_booking_ids: Vec<u64>,
    pub failures: Vec<BatchFailure>,
    pub total_released: i128,
}

pub struct BookingStorage;

const MAX_BATCH_SIZE: u32 = 50;

impl BookingStorage {
    pub fn get(env: &Env, booking_id: u64) -> Option<Booking> {
        env.storage().persistent().get(&booking_id)
    }
    
    pub fn set(env: &Env, booking_id: u64, booking: &Booking) {
        env.storage().persistent().set(&booking_id, booking);
    }

    pub fn get_trusted_oracle(env: &Env) -> Option<Address> {
        env.storage().instance().get(&symbol_short!("oracle"))
    }

    pub fn set_trusted_oracle(env: &Env, oracle: &Address) {
        env.storage().instance().set(&symbol_short!("oracle"), oracle);
    }

    pub fn next_id(env: &Env) -> u64 {
        let id: u64 = env.storage().instance().get(&symbol_short!("next_id")).unwrap_or(1);
        env.storage().instance().set(&symbol_short!("next_id"), &(id + 1));
        id
    }
}

#[contract]
pub struct BookingContract;

#[contractimpl]
impl BookingContract {
    // Register the trusted oracle contract address
    pub fn initialize_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();
        BookingStorage::set_trusted_oracle(&env, &oracle);
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("oracle")),
            (admin, env.ledger().timestamp(), oracle),
        );
    }

    // Initialize booking - starts in "pending" status until paid
    pub fn create_booking(        env: Env,
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
        
        let booking_id = BookingStorage::next_id(&env);
        
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

        // Standard event schema: (contract, action) -> (actor, timestamp, payload)
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("created")),
            (booking.passenger.clone(), env.ledger().timestamp(), booking_id, booking.airline.clone(), booking.flight_number.clone(), booking.price),
        );
        
        booking_id
    }
    
    // Accept payment for the booking and hold in escrow
    pub fn pay_for_booking(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");
        
        assert!(booking.status == symbol_short!("pending"), "Already paid or cancelled");
        
        booking.passenger.require_auth();
        
        let token_client = token::Client::new(&env, &booking.token);
        
        // Transfer tokens from passenger to this contract
        token_client.transfer(
            &booking.passenger,
            &env.current_contract_address(),
            &booking.price,
        );
        
        booking.amount_escrowed = booking.price;
        booking.status = symbol_short!("confirmed");
        
        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("paid")),
            (booking.passenger.clone(), env.ledger().timestamp(), booking_id, booking.price),
        );
    }
    
    // Release payment to airline - post-flight settlement
    pub fn release_payment_to_airline(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");
        
        booking.airline.require_auth();
        
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
            (booking.airline.clone(), env.ledger().timestamp(), booking_id, released_amount),
        );
    }
    
    // Refund passenger for cancelled bookings
    pub fn refund_passenger(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");
        
        let current_time = env.ledger().timestamp();
        
        // For simplicity, require passenger auth and check window
        // In a real app, airline could also trigger this
        booking.passenger.require_auth();
        assert!(
            current_time < booking.departure_time - 86400,
            "Cancellation window closed"
        );
        
        assert!(
            booking.status == symbol_short!("confirmed") || booking.status == symbol_short!("pending"),
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
            (booking.passenger.clone(), env.ledger().timestamp(), booking_id, refunded_amount),
        );
    }
    
    // Helper to get booking details
    pub fn get_booking(env: Env, booking_id: u64) -> Option<Booking> {
        BookingStorage::get(&env, booking_id)
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

    // Settle cancellation payouts from escrow according to refund basis points.
    // `passenger_refund_bps` is in basis points (10000 = 100%).
    pub fn settle_cancellation(
        env: Env,
        booking_id: u64,
        caller: Address,
        passenger_refund_bps: u32,
    ) -> (i128, i128) {
        assert!(passenger_refund_bps <= 10_000, "Invalid refund bps");

        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        assert!(
            booking.status != symbol_short!("cancelled")
                && booking.status != symbol_short!("refunded")
                && booking.status != symbol_short!("completed"),
            "Booking cannot be cancelled"
        );

        caller.require_auth();
        assert!(
            caller == booking.passenger || caller == booking.airline,
            "Not authorized to cancel"
        );

        assert!(
            booking.status == symbol_short!("confirmed") || booking.status == symbol_short!("pending"),
            "Invalid booking status"
        );

        let escrowed = booking.amount_escrowed;
        let mut passenger_refund = 0i128;
        let mut airline_amount = 0i128;

        if escrowed > 0 {
            passenger_refund = escrowed * (passenger_refund_bps as i128) / 10_000;
            airline_amount = escrowed - passenger_refund;

            let token_client = token::Client::new(&env, &booking.token);

            if passenger_refund > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &booking.passenger,
                    &passenger_refund,
                );
            }

            if airline_amount > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &booking.airline,
                    &airline_amount,
                );
            }
        }

        booking.amount_escrowed = 0;
        booking.status = symbol_short!("cancelled");
        BookingStorage::set(&env, booking_id, &booking);

        env.events().publish(
            (symbol_short!("booking"), symbol_short!("cancelled")),
            (booking_id, passenger_refund, airline_amount),
        );

        (passenger_refund, airline_amount)
    }

    // Batch post-flight settlement with partial failure handling.
    // Gas savings come from one auth check and a single transaction envelope.
    pub fn batch_complete_bookings(
        env: Env,
        airline: Address,
        booking_ids: Vec<u64>,
    ) -> BatchCompleteBookingsResult {
        airline.require_auth();
        assert!(booking_ids.len() > 0, "Empty batch");
        assert!(booking_ids.len() <= MAX_BATCH_SIZE, "Batch too large");

        let mut completed_booking_ids = Vec::new(&env);
        let mut failures = Vec::new(&env);
        let mut total_released: i128 = 0;

        let mut i: u32 = 0;
        while i < booking_ids.len() {
            let booking_id = booking_ids.get(i).unwrap();
            let mut booking = match BookingStorage::get(&env, booking_id) {
                Some(existing) => existing,
                None => {
                    failures.push_back(BatchFailure {
                        index: i,
                        booking_id,
                        reason: symbol_short!("missing"),
                    });
                    i += 1;
                    continue;
                }
            };

            if booking.airline != airline {
                failures.push_back(BatchFailure {
                    index: i,
                    booking_id,
                    reason: symbol_short!("unauth"),
                });
                i += 1;
                continue;
            }

            if booking.status != symbol_short!("confirmed") {
                failures.push_back(BatchFailure {
                    index: i,
                    booking_id,
                    reason: symbol_short!("bad_stat"),
                });
                i += 1;
                continue;
            }

            if booking.amount_escrowed <= 0 {
                failures.push_back(BatchFailure {
                    index: i,
                    booking_id,
                    reason: symbol_short!("no_funds"),
                });
                i += 1;
                continue;
            }

            let token_client = token::Client::new(&env, &booking.token);
            token_client.transfer(
                &env.current_contract_address(),
                &booking.airline,
                &booking.amount_escrowed,
            );

            let released_amount = booking.amount_escrowed;
            total_released += released_amount;
            booking.amount_escrowed = 0;
            booking.status = symbol_short!("completed");
            BookingStorage::set(&env, booking_id, &booking);
            completed_booking_ids.push_back(booking_id);

            env.events().publish(
                (symbol_short!("booking"), symbol_short!("released")),
                (booking.airline.clone(), env.ledger().timestamp(), booking_id, released_amount),
            );

            i += 1;
        }

        BatchCompleteBookingsResult {
            completed_booking_ids,
            failures,
            total_released,
        }
    }

    // Oracle-triggered settlement: called by the oracle contract after flight completion consensus
    pub fn oracle_release_payment(env: Env, oracle: Address, booking_id: u64) {
        oracle.require_auth();
        let trusted = BookingStorage::get_trusted_oracle(&env).expect("Oracle not configured");
        assert!(oracle == trusted, "Unauthorized oracle");

        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");

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
            (oracle, env.ledger().timestamp(), booking_id, released_amount),
        );
    }

    // Oracle-triggered refund: called by the oracle contract after airline cancellation consensus
    pub fn oracle_refund_airline_cancel(env: Env, oracle: Address, booking_id: u64) {
        oracle.require_auth();
        let trusted = BookingStorage::get_trusted_oracle(&env).expect("Oracle not configured");
        assert!(oracle == trusted, "Unauthorized oracle");

        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");

        assert!(
            booking.status == symbol_short!("confirmed") || booking.status == symbol_short!("pending"),
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
            (oracle, env.ledger().timestamp(), booking_id, refunded_amount),
        );
    }
}
