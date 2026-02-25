use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, Symbol, Vec,
};

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
pub struct PricingFactors {
    // Factors expressed in basis points (bps). 10_000 bps == 100%.
    // These are provided by the oracle for transparency/auditability.
    pub demand_bps: i128,
    pub competitor_bps: i128,
    pub time_to_departure_bps: i128,
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
pub struct PricingConfig {
    pub admin: Address,
    pub oracle: Address,
    // Maximum allowed change per oracle update, in bps (e.g. 2_000 == 20%).
    pub max_change_bps: i128,
    // Cooldown period between updates for the same flight, in seconds.
    pub cooldown_secs: u64,
    // Max demand multiplier applied in get_current_price(), in bps above 100%.
    // Example: 5_000 means up to 1.5x.
    pub max_demand_multiplier_bps: i128,
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

#[contracttype]
#[derive(Clone)]
pub struct PriceHistoryEntry {
    pub timestamp: u64,
    pub old_price: i128,
    pub new_price: i128,
    pub input: PriceUpdateInput,
}

pub struct AirlineRegistry;

const MAX_BATCH_SIZE: u32 = 50;

impl AirlineRegistry {
    pub fn get_airline(env: &Env, address: &Address) -> Option<AirlineProfile> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("airline"), address))
    }

    pub fn set_airline(env: &Env, address: &Address, profile: &AirlineProfile) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("airline"), address), profile);
    }

    pub fn get_flight(env: &Env, flight_id: u64) -> Option<Flight> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("flight"), flight_id))
    }

    pub fn set_flight(env: &Env, flight_id: u64, flight: &Flight) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("flight"), flight_id), flight);
    }

    pub fn next_flight_id(env: &Env) -> u64 {
        let key = symbol_short!("flt_next");
        let next_id = env.storage().instance().get(&key).unwrap_or(1u64);
        env.storage().instance().set(&key, &(next_id + 1));
        next_id
    }
}

pub struct PricingStorage;

impl PricingStorage {
    pub fn get_config(env: &Env) -> Option<PricingConfig> {
        env.storage().instance().get(&symbol_short!("pricing"))
    }

    pub fn set_config(env: &Env, config: &PricingConfig) {
        env.storage()
            .instance()
            .set(&symbol_short!("pricing"), config);
    }

    pub fn get_last_update(env: &Env, flight_id: u64) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("plu"), flight_id))
    }

    pub fn set_last_update(env: &Env, flight_id: u64, ts: u64) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("plu"), flight_id), &ts);
    }

    pub fn get_price_history(env: &Env, flight_id: u64) -> Vec<PriceHistoryEntry> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("ph"), flight_id))
            .unwrap_or(vec![env])
    }

    pub fn set_price_history(env: &Env, flight_id: u64, history: &Vec<PriceHistoryEntry>) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("ph"), flight_id), history);
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

    pub fn initialize_pricing(
        env: Env,
        admin: Address,
        oracle: Address,
        cooldown_secs: u64,
        max_change_bps: i128,
        max_demand_multiplier_bps: i128,
    ) {
        assert!(
            PricingStorage::get_config(&env).is_none(),
            "Already initialized"
        );
        admin.require_auth();
        assert!(max_change_bps > 0, "Invalid max_change_bps");
        assert!(max_change_bps <= 2_000, "max_change_bps exceeds 20%");
        assert!(
            max_demand_multiplier_bps >= 0,
            "Invalid max_demand_multiplier_bps"
        );

        let cfg = PricingConfig {
            admin: admin.clone(),
            oracle: oracle.clone(),
            max_change_bps,
            cooldown_secs,
            max_demand_multiplier_bps,
        };

        PricingStorage::set_config(&env, &cfg);

        env.events().publish(
            (symbol_short!("pricing"), symbol_short!("init")),
            (admin, oracle, max_change_bps, cooldown_secs),
        );
    }

    pub fn set_price_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();

        let mut cfg = PricingStorage::get_config(&env).expect("Not initialized");
        assert!(cfg.admin == admin, "Unauthorized");
        cfg.oracle = oracle.clone();
        PricingStorage::set_config(&env, &cfg);

        env.events().publish(
            (symbol_short!("pricing"), symbol_short!("oracle")),
            (admin, oracle),
        );
    }

    // Register new airline
    pub fn register_airline(env: Env, airline: Address, name: Symbol, iata_code: Symbol) -> bool {
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

        env.events()
            .publish((symbol_short!("airline"), symbol_short!("reg")), airline);

        true
    }

    // Admin verification of airline
    pub fn verify_airline(env: Env, _admin: Address, airline: Address) {
        // TODO: Check admin authorization

        let mut profile = AirlineRegistry::get_airline(&env, &airline).expect("Airline not found");

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

        let mut flight = AirlineRegistry::get_flight(&env, flight_id).expect("Flight not found");

        assert!(flight.airline == airline, "Unauthorized");
        assert!(flight.available_seats > 0, "No seats available");

        flight.available_seats -= 1;
        AirlineRegistry::set_flight(&env, flight_id, &flight);
    }

    // Cancel flight (airline emergency)
    pub fn cancel_flight(env: Env, airline: Address, flight_id: u64) {
        airline.require_auth();

        let mut flight = AirlineRegistry::get_flight(&env, flight_id).expect("Flight not found");

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

    // --- Dynamic Pricing Oracle ---
    // Oracle pushes updates based on multiple factors and guardrails.
    pub fn update_flight_price(
        env: Env,
        oracle: Address,
        flight_id: u64,
        input: PriceUpdateInput,
    ) -> i128 {
        oracle.require_auth();

        let cfg = PricingStorage::get_config(&env).expect("Pricing not initialized");
        assert!(cfg.oracle == oracle, "Unauthorized");

        let mut flight = AirlineRegistry::get_flight(&env, flight_id).expect("Flight not found");
        assert!(
            flight.status == symbol_short!("active"),
            "Flight not active"
        );
        assert!(input.base_price > 0, "Invalid base_price");

        let now = env.ledger().timestamp();
        if cfg.cooldown_secs > 0 {
            if let Some(last) = PricingStorage::get_last_update(&env, flight_id) {
                assert!(now >= last + cfg.cooldown_secs, "Cooldown active");
            }
        }

        // Apply oracle-provided factors to the base price.
        // final = base * (10_000 + demand + competitor + time) / 10_000
        let factor_sum = 10_000i128
            + input.factors.demand_bps
            + input.factors.competitor_bps
            + input.factors.time_to_departure_bps;
        assert!(factor_sum > 0, "Invalid factors");
        let mut suggested = input
            .base_price
            .checked_mul(factor_sum)
            .expect("Math overflow")
            / 10_000i128;
        if suggested <= 0 {
            suggested = 1;
        }

        // Enforce max price change per update (default requirement: max 20%).
        let old_price = flight.price;
        assert!(old_price > 0, "Invalid existing price");
        let max_delta = old_price
            .checked_mul(cfg.max_change_bps)
            .expect("Math overflow")
            / 10_000i128;
        let upper = old_price + max_delta;
        let lower = old_price - max_delta;

        let new_price = if suggested > upper {
            upper
        } else if suggested < lower {
            lower
        } else {
            suggested
        };

        flight.price = new_price;
        AirlineRegistry::set_flight(&env, flight_id, &flight);

        // Track history for transparency.
        let mut history = PricingStorage::get_price_history(&env, flight_id);
        history.push_back(PriceHistoryEntry {
            timestamp: now,
            old_price,
            new_price,
            input: input.clone(),
        });
        PricingStorage::set_price_history(&env, flight_id, &history);

        PricingStorage::set_last_update(&env, flight_id, now);

        // Emit event for price change notifications.
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("price")),
            (flight_id, old_price, new_price, oracle),
        );

        new_price
    }

    pub fn get_price_history(env: Env, flight_id: u64) -> Vec<PriceHistoryEntry> {
        PricingStorage::get_price_history(&env, flight_id)
    }

    // Read-only price view that applies a live demand multiplier.
    pub fn get_current_price(env: Env, flight_id: u64) -> i128 {
        let cfg = PricingStorage::get_config(&env).expect("Pricing not initialized");
        let flight = AirlineRegistry::get_flight(&env, flight_id).expect("Flight not found");
        assert!(flight.price > 0, "Invalid price");

        // Demand is derived from seat utilization (sold/total) and time-to-departure.
        let sold = (flight.total_seats - flight.available_seats) as i128;
        let total = flight.total_seats as i128;
        let utilization_bps = if total == 0 {
            0
        } else {
            sold * 10_000i128 / total
        };

        let now = env.ledger().timestamp();
        let ttd = if flight.departure_time > now {
            (flight.departure_time - now) as i128
        } else {
            0i128
        };

        // Time boost: if within 48h, scale up; else 0. (Simple heuristic)
        let forty8h = 48i128 * 60i128 * 60i128;
        let time_bps = if ttd == 0 {
            10_000i128
        } else if ttd >= forty8h {
            0i128
        } else {
            // 0..10_000 bps, where closer to departure => higher
            (forty8h - ttd) * 10_000i128 / forty8h
        };

        // Combine utilization and time into a demand signal, then clamp to configured max.
        let demand_signal_bps = (utilization_bps + time_bps) / 2;
        let demand_multiplier_bps =
            10_000i128 + (cfg.max_demand_multiplier_bps * demand_signal_bps / 10_000i128);

        flight
            .price
            .checked_mul(demand_multiplier_bps)
            .expect("Math overflow")
            / 10_000i128
    }
}
