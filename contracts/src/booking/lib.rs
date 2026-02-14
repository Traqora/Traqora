#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

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
    pub currency: Symbol,
    pub status: Symbol, // "confirmed", "completed", "cancelled", "refunded"
    pub created_at: u64,
}

#[contracttype]
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
    // Initialize booking with payment escrow
    pub fn create_booking(
        env: Env,
        passenger: Address,
        airline: Address,
        flight_number: Symbol,
        from_airport: Symbol,
        to_airport: Symbol,
        departure_time: u64,
        price: i128,
        currency: Symbol,
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
            currency,
            status: symbol_short!("confirmed"),
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
    
    pub fn get_booking(env: Env, booking_id: u64) -> Option<Booking> {
        BookingStorage::get(&env, booking_id)
    }
    
    pub fn cancel_booking(env: Env, passenger: Address, booking_id: u64) {
        passenger.require_auth();
        
        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");
        
        assert!(booking.passenger == passenger, "Unauthorized");
        assert!(
            booking.status == symbol_short!("confirmed"),
            "Booking cannot be cancelled"
        );
        
        // Check cancellation window (24 hours before departure)
        let current_time = env.ledger().timestamp();
        assert!(
            current_time < booking.departure_time - 86400,
            "Cancellation window closed"
        );
        
        booking.status = symbol_short!("cancelled");
        BookingStorage::set(&env, booking_id, &booking);
        
        // Trigger refund
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("cancelled")),
            booking_id,
        );
    }
    
    pub fn complete_booking(env: Env, airline: Address, booking_id: u64) {
        airline.require_auth();
        
        let mut booking = BookingStorage::get(&env, booking_id)
            .expect("Booking not found");
        
        assert!(booking.airline == airline, "Unauthorized");
        assert!(
            booking.status == symbol_short!("confirmed"),
            "Invalid booking status"
        );
        
        booking.status = symbol_short!("completed");
        BookingStorage::set(&env, booking_id, &booking);
        
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("completed")),
            booking_id,
        );
    }
}
