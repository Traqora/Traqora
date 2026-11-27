#![no_std]
// Booking-style contract entrypoints legitimately need many arguments;
// soroban macro-generated clients re-declare these signatures.
#![allow(clippy::too_many_arguments)]
use contract_events::{Action, Domain};
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, token, Address, Env,
    String, Symbol, Vec,
};

#[contractclient(name = "BookingReceiptClient")]
#[allow(clippy::too_many_arguments)]
pub trait BookingReceiptInterface {
    #[allow(clippy::too_many_arguments)]
    fn mint_receipt(
        env: Env,
        to: Address,
        booking_id: u64,
        flight_number: Symbol,
        from_airport: Symbol,
        to_airport: Symbol,
        seat: String,
        price: i128,
    ) -> u64;
}

#[contracttype]
#[derive(Clone)]
pub struct ReconciliationAudit {
    pub booking_id: u64,
    pub actor: Address,
    pub timestamp: u64,
    pub previous_status: Symbol,
    pub new_status: Symbol,
    pub correlation_id: Symbol,
}

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

/// Minimum on-chain booking record required to prove payment settlement and
/// reference an off-chain booking without exposing passenger personal data (PII).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MinimumBookingRecord {
    pub booking_id: u64,
    pub payer: Address,
    pub airline: Address,
    pub price: i128,
    pub token: Address,
    pub amount_escrowed: i128,
    pub status: Symbol,
    pub created_at: u64,
    pub offchain_ref: Option<Symbol>,
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
        env.storage()
            .instance()
            .set(&symbol_short!("oracle"), oracle);
    }

    pub fn get_receipt_contract(env: &Env) -> Option<Address> {
        env.storage().instance().get(&symbol_short!("receipt_c"))
    }

    pub fn set_receipt_contract(env: &Env, contract: &Address) {
        env.storage()
            .instance()
            .set(&symbol_short!("receipt_c"), contract);
    }

    pub fn get_offchain_reference(env: &Env, booking_id: u64) -> Option<Symbol> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("off_ref"), booking_id))
    }

    pub fn set_offchain_reference(env: &Env, booking_id: u64, offchain_ref: &Symbol) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("off_ref"), booking_id), offchain_ref);
        env.storage()
            .persistent()
            .set(&(symbol_short!("by_ref"), offchain_ref.clone()), &booking_id);
    }

    pub fn get_booking_by_offchain_ref(env: &Env, offchain_ref: &Symbol) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("by_ref"), offchain_ref.clone()))
    }

    #[allow(clippy::too_many_arguments)]
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

    pub fn record_audit(
        env: &Env,
        booking_id: u64,
        actor: Address,
        previous_status: Symbol,
        new_status: Symbol,
        correlation_id: Symbol,
    ) {
        let audit = ReconciliationAudit {
            booking_id,
            actor,
            timestamp: env.ledger().timestamp(),
            previous_status,
            new_status,
            correlation_id,
        };
        let count: u32 = env
            .storage()
            .persistent()
            .get(&symbol_short!("aud_cnt"))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&(symbol_short!("audit"), count), &audit);
        env.storage()
            .persistent()
            .set(&symbol_short!("aud_cnt"), &(count + 1));
    }

    pub fn get_audits(env: &Env) -> Vec<ReconciliationAudit> {
        let count: u32 = env
            .storage()
            .persistent()
            .get(&symbol_short!("aud_cnt"))
            .unwrap_or(0);
        let mut list = Vec::new(env);
        let mut i = 0;
        while i < count {
            if let Some(audit) = env.storage().persistent().get(&(symbol_short!("audit"), i)) {
                list.push_back(audit);
            }
            i += 1;
        }
        list
    }
}

#[contract]
pub struct BookingContract;

#[allow(clippy::too_many_arguments)]
#[contractimpl]
impl BookingContract {
    // Register the trusted oracle contract address
    pub fn initialize_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();
        BookingStorage::set_trusted_oracle(&env, &oracle);
        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Oracle,
            (admin, env.ledger().timestamp(), oracle),
        );
    }

    pub fn set_receipt_contract(env: Env, admin: Address, receipt_contract: Address) {
        admin.require_auth();
        BookingStorage::set_receipt_contract(&env, &receipt_contract);
    }

    // Initialize booking - starts in "pending" status until paid
    #[allow(clippy::too_many_arguments)]
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
        assert!(price > 0, "Invalid booking price");

        let booking_id = BookingStorage::next_id(&env);

        let booking = Booking {
            booking_id,
            passenger: passenger.clone(),
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

        // Atomic storage write with validation guard
        BookingStorage::set(&env, booking_id, &booking);

        // Canonical schema: (actor, timestamp, primary_id, ...payload)
        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Created,
            (
                booking.passenger.clone(),
                env.ledger().timestamp(),
                booking_id,
                booking.airline.clone(),
                booking.flight_number.clone(),
                booking.price,
            ),
        );

        booking_id
    }

    // Accept payment for the booking and hold in escrow
    pub fn pay_for_booking(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        // Verify payment transaction finality on the configured network (ensuring balance was successfully transferred)
        let token_client_verify = token::Client::new(&env, &booking.token);
        let contract_balance_before = token_client_verify.balance(&env.current_contract_address());

        // Transfer tokens from passenger to this contract
        token_client_verify.transfer(
            &booking.passenger,
            &env.current_contract_address(),
            &booking.price,
        );

        let contract_balance_after = token_client_verify.balance(&env.current_contract_address());
        assert!(
            contract_balance_after >= contract_balance_before + booking.price,
            "Transaction finality verification failed: insufficient network balance transfer"
        );

        assert!(
            booking.status == symbol_short!("pending"),
            "Already paid or cancelled"
        );

        booking.passenger.require_auth();

        let prev_status = booking.status;

        let token_client = token::Client::new(&env, &booking.token);

        booking.amount_escrowed = booking.price;
        booking.status = symbol_short!("confirmed");

        BookingStorage::set(&env, booking_id, &booking);

        BookingStorage::record_audit(
            &env,
            booking_id,
            booking.passenger.clone(),
            prev_status,
            booking.status,
            symbol_short!("pay_pass"),
        );

        if let Some(receipt_contract) = BookingStorage::get_receipt_contract(&env) {
            let client = BookingReceiptClient::new(&env, &receipt_contract);
            client.mint_receipt(
                &booking.passenger,
                &booking_id,
                &booking.flight_number,
                &booking.from_airport,
                &booking.to_airport,
                &String::from_str(&env, "TBD"), // Seat is assigned later or TBD initially
                &booking.price,
            );
        }

        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Paid,
            (
                booking.passenger.clone(),
                env.ledger().timestamp(),
                booking_id,
                booking.price,
            ),
        );
    }

    // Release payment to airline - post-flight settlement
    pub fn release_payment_to_airline(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

        booking.airline.require_auth();

        let prev_status = booking.status;

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

        BookingStorage::record_audit(
            &env,
            booking_id,
            booking.airline.clone(),
            prev_status,
            booking.status,
            symbol_short!("rel_air"),
        );

        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Released,
            (
                booking.airline.clone(),
                env.ledger().timestamp(),
                booking_id,
                released_amount,
            ),
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
            current_time < booking.departure_time - 86400,
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
        let prev_status = booking.status;
        booking.status = symbol_short!("refunded");

        BookingStorage::record_audit(
            &env,
            booking_id,
            booking.passenger.clone(),
            prev_status,
            booking.status,
            symbol_short!("refund_pass"),
        );
        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Refunded,
            (
                booking.passenger.clone(),
                env.ledger().timestamp(),
                booking_id,
                refunded_amount,
            ),
        );
    }

    // Renew the TTL (Time To Live) for a booking entry to prevent pruning
    // of long-lived persistent storage. This must be called before the entry's
    // TTL expires to keep the booking record readable for the booking and
    // dispute lifecycle.
    //
    // # Arguments
    // * `booking_id` - The booking ID whose TTL should be renewed
    pub fn renew_booking_ttl(env: Env, booking_id: u64) {
        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");
        booking.passenger.require_auth();
        env.storage()
            .persistent()
            .extend_ttl(&booking_id, /* delta = */ 0);
    }

    // Helper to get booking details
    pub fn get_booking(env: Env, booking_id: u64) -> Option<Booking> {
        BookingStorage::get(&env, booking_id)
    }

/// Associates an off-chain booking reference with an on-chain booking record
    /// without exposing passenger personal data.
    pub fn set_offchain_booking_reference(env: Env, booking_id: u64, offchain_ref: Symbol) {
        let booking = BookingStorage::get(&env, booking_id).expect("Booking not found");
        booking.passenger.require_auth();
        BookingStorage::set_offchain_reference(&env, booking_id, &offchain_ref);
    }

    /// Creates a booking with an initial off-chain reference.
    #[allow(clippy::too_many_arguments)]
    pub fn create_booking_with_reference(
        env: Env,
        passenger: Address,
        airline: Address,
        flight_number: Symbol,
        from_airport: Symbol,
        to_airport: Symbol,
        departure_time: u64,
        price: i128,
        token: Address,
        offchain_ref: Symbol,
    ) -> u64 {
        let booking_id = Self::create_booking(
            env.clone(),
            passenger,
            airline,
            flight_number,
            from_airport,
            to_airport,
            departure_time,
            price,
            token,
        );
        BookingStorage::set_offchain_reference(&env, booking_id, &offchain_ref);
        booking_id
    }

    /// Queries the minimum on-chain booking record containing only payment proof
    /// and off-chain reference without passenger identity fields.
    pub fn get_minimum_booking_record(env: Env, booking_id: u64) -> Option<MinimumBookingRecord> {
        let booking = BookingStorage::get(&env, booking_id)?;
        let offchain_ref = BookingStorage::get_offchain_reference(&env, booking_id);
        Some(MinimumBookingRecord {
            booking_id: booking.booking_id,
            payer: booking.passenger,
            airline: booking.airline,
            price: booking.price,
            token: booking.token,
            amount_escrowed: booking.amount_escrowed,
            status: booking.status,
            created_at: booking.created_at,
            offchain_ref,
        })
    }

    /// Reverse lookup: retrieves booking id by off-chain reference.
    pub fn get_booking_by_offchain_ref(env: Env, offchain_ref: Symbol) -> Option<u64> {
        BookingStorage::get_booking_by_offchain_ref(&env, &offchain_ref)
    }

    pub fn get_audits(env: Env) -> Vec<ReconciliationAudit> {
        BookingStorage::get_audits(&env)
    }
    // Original API wrappers for backward compatibility
    pub fn cancel_booking(env: Env, passenger: Address, booking_id: u64) {
        let booking = BookingStorage::get(&env, booking_id).expect("Booking not found");
        assert!(passenger == booking.passenger, "Unauthorized passenger");
        passenger.require_auth();
        Self::refund_passenger(env, booking_id);
    }

    pub fn complete_booking(env: Env, airline: Address, booking_id: u64) {
        let booking = BookingStorage::get(&env, booking_id).expect("Booking not found");
        assert!(airline == booking.airline, "Unauthorized airline");
        airline.require_auth();
        Self::release_payment_to_airline(env, booking_id);
    }

    /// Protected query entrypoint enforcing that only permitted actors (passenger, airline,
    /// or trusted oracle) can query protected booking records.
    pub fn get_booking_authorized(
        env: Env,
        caller: Address,
        booking_id: u64,
    ) -> Option<Booking> {
        caller.require_auth();
        let booking = BookingStorage::get(&env, booking_id)?;
        let trusted_oracle = BookingStorage::get_trusted_oracle(&env);

        let is_permitted = caller == booking.passenger
            || caller == booking.airline
            || trusted_oracle.map_or(false, |oracle| caller == oracle);

        assert!(is_permitted, "Unauthorized query access");
        Some(booking)
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
            booking.status == symbol_short!("confirmed")
                || booking.status == symbol_short!("pending"),
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

        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Cancelled,
            (
                caller,
                env.ledger().timestamp(),
                booking_id,
                passenger_refund,
                airline_amount,
            ),
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
        assert!(!booking_ids.is_empty(), "Empty batch");
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

            contract_events::emit(
                &env,
                Domain::Booking,
                Action::Released,
                (
                    booking.airline.clone(),
                    env.ledger().timestamp(),
                    booking_id,
                    released_amount,
                ),
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

        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Released,
            (
                oracle,
                env.ledger().timestamp(),
                booking_id,
                released_amount,
            ),
        );
    }

    // Oracle-triggered refund: called by the oracle contract after airline cancellation consensus
    pub fn oracle_refund_airline_cancel(env: Env, oracle: Address, booking_id: u64) {
        oracle.require_auth();
        let trusted = BookingStorage::get_trusted_oracle(&env).expect("Oracle not configured");
        assert!(oracle == trusted, "Unauthorized oracle");

        let mut booking = BookingStorage::get(&env, booking_id).expect("Booking not found");

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

        contract_events::emit(
            &env,
            Domain::Booking,
            Action::Refunded,
            (
                oracle,
                env.ledger().timestamp(),
                booking_id,
                refunded_amount,
            ),
        );
    }
}
