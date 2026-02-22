use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, token};

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

pub struct BookingStorage;

impl BookingStorage {
    pub fn get(env: &Env, booking_id: u64) -> Option<Booking> {
        env.storage().persistent().get(&booking_id)
    }
    
    pub fn set(env: &Env, booking_id: u64, booking: &Booking) {
        env.storage().persistent().set(&booking_id, booking);
    }
}

#[contract]
pub struct BookingContract;

#[contractimpl]
impl BookingContract {
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
            booking_id,
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
            (booking_id, released_amount),
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
            (booking_id, refunded_amount),
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
}
