use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

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

#[contracttype]
#[derive(Clone)]
pub struct FlightInput {
    pub flight_number: Symbol,
    pub from_airport: Symbol,
    pub to_airport: Symbol,
    pub departure_time: u64,
    pub arrival_time: u64,
    pub total_seats: u32,
    pub price: i128,
    pub currency: Symbol,
}

#[contracttype]
#[derive(Clone)]
pub struct FlightStatusUpdate {
    pub flight_id: u64,
    pub status: Symbol,
}

#[contracttype]
#[derive(Clone)]
pub struct BatchFailure {
    pub index: u32,
    pub item_id: u64,
    pub reason: Symbol,
}

#[contracttype]
#[derive(Clone)]
pub struct BatchCreateFlightsResult {
    pub created_flight_ids: Vec<u64>,
    pub failures: Vec<BatchFailure>,
}

#[contracttype]
#[derive(Clone)]
pub struct BatchUpdateFlightStatusResult {
    pub updated_flight_ids: Vec<u64>,
    pub failures: Vec<BatchFailure>,
}

pub struct AirlineRegistry;

const MAX_BATCH_SIZE: u32 = 50;

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

    pub fn next_flight_id(env: &Env) -> u64 {
        let key = symbol_short!("flt_next");
        let next_id = env.storage().instance().get(&key).unwrap_or(1u64);
        env.storage().instance().set(&key, &(next_id + 1));
        next_id
    }
}

#[contract]
pub struct AirlineContract;

#[contractimpl]
impl AirlineContract {
    fn is_valid_status(status: &Symbol) -> bool {
        *status == symbol_short!("active")
            || *status == symbol_short!("cancelled")
            || *status == symbol_short!("completed")
    }

    fn is_valid_flight_input(input: &FlightInput) -> bool {
        input.arrival_time > input.departure_time && input.total_seats > 0 && input.price > 0
    }

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
        
        let mut profile = AirlineRegistry::get_airline(&env, &airline)
            .expect("Airline not registered");
        
        assert!(profile.is_verified, "Airline not verified");
        assert!(arrival_time > departure_time, "Invalid flight times");
        assert!(total_seats > 0, "Invalid seat count");
        assert!(price > 0, "Invalid price");
        
        let flight_id = AirlineRegistry::next_flight_id(&env);
        
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
        profile.total_flights += 1;
        AirlineRegistry::set_airline(&env, &airline, &profile);
        
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

    // Batch create flights with per-item validation and partial failure handling.
    // Gas comparison: individual flow requires N contract calls + N auth checks,
    // while batch uses 1 contract call + 1 auth check for N items.
    pub fn batch_create_flights(
        env: Env,
        airline: Address,
        flights: Vec<FlightInput>,
    ) -> BatchCreateFlightsResult {
        airline.require_auth();
        assert!(flights.len() > 0, "Empty batch");
        assert!(flights.len() <= MAX_BATCH_SIZE, "Batch too large");

        let mut profile = AirlineRegistry::get_airline(&env, &airline)
            .expect("Airline not registered");
        assert!(profile.is_verified, "Airline not verified");

        let mut created_flight_ids = Vec::new(&env);
        let mut failures = Vec::new(&env);

        let mut i: u32 = 0;
        while i < flights.len() {
            let flight_input = flights.get(i).unwrap();
            if !Self::is_valid_flight_input(&flight_input) {
                failures.push_back(BatchFailure {
                    index: i,
                    item_id: 0,
                    reason: symbol_short!("bad_data"),
                });
                i += 1;
                continue;
            }

            let flight_id = AirlineRegistry::next_flight_id(&env);
            let flight = Flight {
                flight_id,
                airline: airline.clone(),
                flight_number: flight_input.flight_number,
                from_airport: flight_input.from_airport,
                to_airport: flight_input.to_airport,
                departure_time: flight_input.departure_time,
                arrival_time: flight_input.arrival_time,
                total_seats: flight_input.total_seats,
                available_seats: flight_input.total_seats,
                price: flight_input.price,
                currency: flight_input.currency,
                status: symbol_short!("active"),
            };

            AirlineRegistry::set_flight(&env, flight_id, &flight);
            created_flight_ids.push_back(flight_id);

            env.events().publish(
                (symbol_short!("flight"), symbol_short!("created")),
                flight_id,
            );

            i += 1;
        }

        profile.total_flights += created_flight_ids.len() as u64;
        AirlineRegistry::set_airline(&env, &airline, &profile);

        BatchCreateFlightsResult {
            created_flight_ids,
            failures,
        }
    }

    // Batch update flight statuses with partial failure handling.
    // Gas comparison: individual flow requires N contract calls + N auth checks,
    // while batch uses 1 contract call + 1 auth check for N updates.
    pub fn batch_update_flight_status(
        env: Env,
        airline: Address,
        updates: Vec<FlightStatusUpdate>,
    ) -> BatchUpdateFlightStatusResult {
        airline.require_auth();
        assert!(updates.len() > 0, "Empty batch");
        assert!(updates.len() <= MAX_BATCH_SIZE, "Batch too large");

        let mut updated_flight_ids = Vec::new(&env);
        let mut failures = Vec::new(&env);

        let mut i: u32 = 0;
        while i < updates.len() {
            let update = updates.get(i).unwrap();
            let mut flight = match AirlineRegistry::get_flight(&env, update.flight_id) {
                Some(existing) => existing,
                None => {
                    failures.push_back(BatchFailure {
                        index: i,
                        item_id: update.flight_id,
                        reason: symbol_short!("missing"),
                    });
                    i += 1;
                    continue;
                }
            };

            if flight.airline != airline {
                failures.push_back(BatchFailure {
                    index: i,
                    item_id: update.flight_id,
                    reason: symbol_short!("unauth"),
                });
                i += 1;
                continue;
            }

            if !Self::is_valid_status(&update.status) {
                failures.push_back(BatchFailure {
                    index: i,
                    item_id: update.flight_id,
                    reason: symbol_short!("bad_stat"),
                });
                i += 1;
                continue;
            }

            flight.status = update.status;
            AirlineRegistry::set_flight(&env, update.flight_id, &flight);
            updated_flight_ids.push_back(update.flight_id);

            env.events().publish(
                (symbol_short!("flight"), symbol_short!("status")),
                update.flight_id,
            );

            i += 1;
        }

        BatchUpdateFlightStatusResult {
            updated_flight_ids,
            failures,
        }
    }
}
