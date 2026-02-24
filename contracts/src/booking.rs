#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, IntoVal, Symbol, Val,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Booking {
    pub id: u64,
    pub passenger: Address,
    pub airline: Address,
    pub flight_number: Symbol,
    pub origin: Symbol,
    pub destination: Symbol,
    pub departure_time: u64,
    pub price: u64,
    pub currency: Symbol,
    pub status: Symbol, // e.g., "confirmed", "cancelled"
}

#[contracttype]
enum DataKey {
    Booking(u64),
    NextId,
}

#[contract]
pub struct BookingContract;

#[contractimpl]
impl BookingContract {
    pub fn create_booking(
        env: Env,
        passenger: Address,
        airline: Address,
        flight_number: Symbol,
        origin: Symbol,
        destination: Symbol,
        departure_time: u64,
        price: u64,
        currency: Symbol,
    ) -> u64 {
        passenger.require_auth();

        let booking_id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);

        let booking = Booking {
            id: booking_id,
            passenger,
            airline,
            flight_number,
            origin,
            destination,
            departure_time,
            price,
            currency,
            status: symbol_short!("confirmed"),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Booking(booking_id), &booking);
        env.storage()
            .instance()
            .set(&DataKey::NextId, &(booking_id + 1));

        // Publish the 'create' event
        let topics = (symbol_short!("Booking"), symbol_short!("create"));
        env.events().publish(topics, booking_id.into_val(&env));

        booking_id
    }

    pub fn get_booking(env: Env, id: u64) -> Option<Booking> {
        env.storage().persistent().get(&DataKey::Booking(id))
    }

    pub fn cancel_booking(env: Env, passenger: Address, id: u64) {
        passenger.require_auth();

        let key = DataKey::Booking(id);
        let mut booking: Booking = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Booking not found");

        if booking.passenger != passenger {
            panic!("Not authorized to cancel this booking");
        }

        // Prevent cancellation if the booking is already cancelled
        if booking.status == symbol_short!("cancelled") {
            panic!("Booking is already cancelled");
        }

        // Prevent cancellation within 24 hours of departure
        let current_time = env.ledger().timestamp();
        if booking.departure_time <= current_time + 24 * 60 * 60 {
            panic!("Cannot cancel booking within 24 hours of departure");
        }

        booking.status = symbol_short!("cancelled");
        env.storage().persistent().set(&key, &booking);

        // Publish the 'cancel' event
        let topics = (symbol_short!("Booking"), symbol_short!("cancel"));
        env.events().publish(topics, id.into_val(&env));
    }
}