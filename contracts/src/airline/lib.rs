use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct AirlineProfile {
    pub address: Address,
    pub name: Symbol,
    pub iata_code: Symbol,
    pub is_verified: bool,
    pub total_flights: u64,
    pub total_bookings: u64,
    pub rating: u32, // 0-500 (decimal 2 places)
}

#[contracttype]
#[derive(Clone)]
pub struct Flight {
    pub flight_id: u64,
    pub airline: Address,
    pub flight_number: Symbol,
    pub from_airport: Symbol,
    pub to_airport: Symbol,
    pub departure_time: u64,
    pub arrival_time: u64,
    pub total_seats: u32,
    pub available_seats: u32,
    pub price: i128,
    pub currency: Symbol,
    pub status: Symbol, // "active", "cancelled", "completed"
}

pub struct AirlineRegistry;

impl AirlineRegistry {
    pub fn get_airline(env: &Env, address: &Address) -> Option<AirlineProfile> {
        env.storage().persistent().get(&(symbol_short!("airline"), address))
    }
    
    pub fn set_airline(env: &Env, address: &Address, profile: &AirlineProfile) {
        env.storage().persistent().set(&(symbol_short!("airline"), address), profile);
    }
    
    pub fn get_flight(env: &Env, flight_id: u64) -> Option<Flight> {
        env.storage().persistent().get(&(symbol_short!("flight"), flight_id))
    }
    
    pub fn set_flight(env: &Env, flight_id: u64, flight: &Flight) {
        env.storage().persistent().set(&(symbol_short!("flight"), flight_id), flight);
    }
}

#[contract]
pub struct AirlineContract;

#[contractimpl]
impl AirlineContract {
    // Register new airline
    pub fn register_airline(
        env: Env,
        airline: Address,
        name: Symbol,
        iata_code: Symbol,
    ) -> bool {
        airline.require_auth();
        
        let profile = AirlineProfile {
            address: airline.clone(),
            name,
            iata_code,
            is_verified: false, // Requires admin verification
            total_flights: 0,
            total_bookings: 0,
            rating: 0,
        };
        
        AirlineRegistry::set_airline(&env, &airline, &profile);
        
        env.events().publish(
            (symbol_short!("airline"), symbol_short!("reg")),
            airline,
        );
        
        true
    }
    
    // Admin verification of airline
    pub fn verify_airline(env: Env, _admin: Address, airline: Address) {
        // TODO: Check admin authorization
        
        let mut profile = AirlineRegistry::get_airline(&env, &airline)
            .expect("Airline not found");
        
        profile.is_verified = true;
        AirlineRegistry::set_airline(&env, &airline, &profile);
        
        env.events().publish(
            (symbol_short!("airline"), symbol_short!("verified")),
            airline,
        );
    }
    
    // Create new flight listing
    pub fn create_flight(
        env: Env,
        airline: Address,
        flight_number: Symbol,
        from_airport: Symbol,
        to_airport: Symbol,
        departure_time: u64,
        arrival_time: u64,
        total_seats: u32,
        price: i128,
        currency: Symbol,
    ) -> u64 {
        airline.require_auth();
        
        let profile = AirlineRegistry::get_airline(&env, &airline)
            .expect("Airline not registered");
        
        assert!(profile.is_verified, "Airline not verified");
        
        let flight_id = env.ledger().timestamp();
        
        let flight = Flight {
            flight_id,
            airline: airline.clone(),
            flight_number,
            from_airport,
            to_airport,
            departure_time,
            arrival_time,
            total_seats,
            available_seats: total_seats,
            price,
            currency,
            status: symbol_short!("active"),
        };
        
        AirlineRegistry::set_flight(&env, flight_id, &flight);
        
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("created")),
            flight_id,
        );
        
        flight_id
    }
    
    pub fn get_flight(env: Env, flight_id: u64) -> Option<Flight> {
        AirlineRegistry::get_flight(&env, flight_id)
    }
    
    pub fn get_airline(env: Env, address: Address) -> Option<AirlineProfile> {
        AirlineRegistry::get_airline(&env, &address)
    }
    
    // Decrement available seats when booking is made
    pub fn reserve_seat(env: Env, airline: Address, flight_id: u64) {
        airline.require_auth();
        
        let mut flight = AirlineRegistry::get_flight(&env, flight_id)
            .expect("Flight not found");
        
        assert!(flight.airline == airline, "Unauthorized");
        assert!(flight.available_seats > 0, "No seats available");
        
        flight.available_seats -= 1;
        AirlineRegistry::set_flight(&env, flight_id, &flight);
    }
    
    // Cancel flight (airline emergency)
    pub fn cancel_flight(env: Env, airline: Address, flight_id: u64) {
        airline.require_auth();
        
        let mut flight = AirlineRegistry::get_flight(&env, flight_id)
            .expect("Flight not found");
        
        assert!(flight.airline == airline, "Unauthorized");
        
        flight.status = symbol_short!("cancelled");
        AirlineRegistry::set_flight(&env, flight_id, &flight);
        
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("cancelled")),
            flight_id,
        );
    }
}
