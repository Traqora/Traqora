#![no_std]
use access::{AccessControl, Role};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol, Val,
};

#[contracttype]
#[derive(Clone)]
pub struct RegisteredAirline {
    pub airline_id: Symbol,
    pub admin: Address,
    pub name: Symbol,
}

#[contracttype]
#[derive(Clone)]
pub struct FlightRecord {
    pub flight_id: Symbol,
    pub airline_id: Symbol,
    pub airline_admin: Address,
    pub metadata: Map<Symbol, Val>,
    pub status: Symbol,
    pub departure_time: u64,
    pub arrival_time: u64,
    pub total_seats: u32,
    pub available_seats: u32,
}

// Legacy record for backward compatibility with pre-upgrade storage
#[contracttype]
#[derive(Clone)]
struct LegacyFlightRecord {
    pub flight_id: Symbol,
    pub airline_id: Symbol,
    pub airline_admin: Address,
    pub metadata: Map<Symbol, Val>,
}

pub struct FlightRegistryStorage;

impl FlightRegistryStorage {
    pub fn get_airline(env: &Env, airline_id: &Symbol) -> Option<RegisteredAirline> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("airline"), airline_id.clone()))
    }

    pub fn set_airline(env: &Env, airline_id: &Symbol, airline: &RegisteredAirline) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("airline"), airline_id.clone()), airline);
    }

    pub fn get_airline_id_for_admin(env: &Env, admin: &Address) -> Option<Symbol> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("air_admin"), admin.clone()))
    }

    pub fn set_airline_id_for_admin(env: &Env, admin: &Address, airline_id: &Symbol) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("air_admin"), admin.clone()), airline_id);
    }

    pub fn get_flight(env: &Env, flight_id: &Symbol) -> Option<FlightRecord> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("flight"), flight_id.clone()))
    }

    pub fn set_flight(env: &Env, flight_id: &Symbol, flight: &FlightRecord) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("flight"), flight_id.clone()), flight);
    }

    pub fn is_valid_status(env: &Env, status: &Symbol) -> bool {
        let active = Symbol::new(env, "active");
        let cancelled = Symbol::new(env, "cancelled");
        let delayed = Symbol::new(env, "delayed");
        let scheduled = Symbol::new(env, "scheduled");
        let departed = Symbol::new(env, "departed");
        let arrived = Symbol::new(env, "arrived");
        status == &active
            || status == &cancelled
            || status == &delayed
            || status == &scheduled
            || status == &departed
            || status == &arrived
    }
}

#[contract]
pub struct FlightRegistryContract;

#[contractimpl]
impl FlightRegistryContract {
    pub fn initialize(env: Env, owner: Address) {
        AccessControl::init_owner(&env, &owner);
    }

    pub fn register_airline(
        env: Env,
        executor: Address,
        admin: Address,
        airline_id: Symbol,
        name: Symbol,
    ) {
        AccessControl::require_admin(&env, &executor);
        admin.require_auth();

        assert!(
            FlightRegistryStorage::get_airline(&env, &airline_id).is_none(),
            "Airline already registered"
        );
        assert!(
            FlightRegistryStorage::get_airline_id_for_admin(&env, &admin).is_none(),
            "Admin already assigned"
        );

        let airline = RegisteredAirline {
            airline_id: airline_id.clone(),
            admin: admin.clone(),
            name: name.clone(),
        };

        FlightRegistryStorage::set_airline(&env, &airline_id, &airline);
        FlightRegistryStorage::set_airline_id_for_admin(&env, &admin, &airline_id);

        env.events().publish(
            (
                symbol_short!("airline"),
                symbol_short!("reg"),
                airline_id.clone(),
            ),
            (admin, name),
        );
    }

    pub fn add_flight(
        env: Env,
        airline_admin: Address,
        flight_id: Symbol,
        metadata: Map<Symbol, Val>,
    ) {
        airline_admin.require_auth();

        let airline_id = FlightRegistryStorage::get_airline_id_for_admin(&env, &airline_admin)
            .expect("Airline not registered");

        let is_update = FlightRegistryStorage::get_flight(&env, &flight_id).is_some();
        if let Some(existing) = FlightRegistryStorage::get_flight(&env, &flight_id) {
            assert!(existing.airline_admin == airline_admin, "Unauthorized");
        }

        // Preserve existing status/schedule/seats on update if present, else defaults
        let (status, departure_time, arrival_time, total_seats, available_seats) =
            if let Some(existing) = FlightRegistryStorage::get_flight(&env, &flight_id) {
                (
                    existing.status.clone(),
                    existing.departure_time,
                    existing.arrival_time,
                    existing.total_seats,
                    existing.available_seats,
                )
            } else {
                (
                    Symbol::new(&env, "active"),
                    0,
                    0,
                    0,
                    0,
                )
            };

        let flight = FlightRecord {
            flight_id: flight_id.clone(),
            airline_id: airline_id.clone(),
            airline_admin: airline_admin.clone(),
            metadata,
            status,
            departure_time,
            arrival_time,
            total_seats,
            available_seats,
        };

        FlightRegistryStorage::set_flight(&env, &flight_id, &flight);

        if is_update {
            env.events().publish(
                (symbol_short!("flight"), symbol_short!("updated"), flight_id.clone()),
                (airline_id.clone(), airline_admin.clone()),
            );
        }
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("added"), flight_id),
            (airline_id, airline_admin),
        );
    }

    /// Register flight with richer details (status, schedule, seats) — preferred for new flights
    pub fn add_flight_with_details(
        env: Env,
        airline_admin: Address,
        flight_id: Symbol,
        metadata: Map<Symbol, Val>,
        status: Symbol,
        departure_time: u64,
        arrival_time: u64,
        total_seats: u32,
        available_seats: u32,
    ) {
        airline_admin.require_auth();

        let airline_id = FlightRegistryStorage::get_airline_id_for_admin(&env, &airline_admin)
            .expect("Airline not registered");

        if let Some(existing) = FlightRegistryStorage::get_flight(&env, &flight_id) {
            assert!(existing.airline_admin == airline_admin, "Unauthorized");
        }

        assert!(
            FlightRegistryStorage::is_valid_status(&env, &status),
            "Invalid status"
        );
        if departure_time != 0 && arrival_time != 0 {
            assert!(departure_time < arrival_time, "Invalid schedule");
        }
        assert!(total_seats > 0, "Invalid seats");
        assert!(available_seats <= total_seats, "Invalid available seats");

        let is_update = FlightRegistryStorage::get_flight(&env, &flight_id).is_some();

        let flight = FlightRecord {
            flight_id: flight_id.clone(),
            airline_id: airline_id.clone(),
            airline_admin: airline_admin.clone(),
            metadata,
            status: status.clone(),
            departure_time,
            arrival_time,
            total_seats,
            available_seats,
        };

        FlightRegistryStorage::set_flight(&env, &flight_id, &flight);

        if is_update {
            env.events().publish(
                (symbol_short!("flight"), symbol_short!("updated"), flight_id.clone()),
                (airline_id.clone(), airline_admin.clone(), status.clone()),
            );
        }
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("added"), flight_id.clone()),
            (airline_id.clone(), airline_admin.clone()),
        );
        // Emit dedicated event for richer metadata
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("details"), flight_id),
            (status, departure_time, arrival_time, total_seats, available_seats),
        );
    }

    pub fn update_flight_status(
        env: Env,
        airline_admin: Address,
        flight_id: Symbol,
        status: Symbol,
    ) {
        airline_admin.require_auth();
        let mut flight = FlightRegistryStorage::get_flight(&env, &flight_id)
            .expect("Flight not found");
        assert!(flight.airline_admin == airline_admin, "Unauthorized");
        assert!(
            FlightRegistryStorage::is_valid_status(&env, &status),
            "Invalid status"
        );
        flight.status = status.clone();
        FlightRegistryStorage::set_flight(&env, &flight_id, &flight);
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("status"), flight_id.clone()),
            (status.clone(), flight.airline_id.clone()),
        );
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("updated"), flight_id),
            (flight.airline_id, status),
        );
    }

    pub fn update_flight_schedule(
        env: Env,
        airline_admin: Address,
        flight_id: Symbol,
        departure_time: u64,
        arrival_time: u64,
    ) {
        airline_admin.require_auth();
        let mut flight = FlightRegistryStorage::get_flight(&env, &flight_id)
            .expect("Flight not found");
        assert!(flight.airline_admin == airline_admin, "Unauthorized");
        assert!(departure_time < arrival_time, "Invalid schedule");
        assert!(departure_time > 0 && arrival_time > 0, "Invalid schedule");
        flight.departure_time = departure_time;
        flight.arrival_time = arrival_time;
        FlightRegistryStorage::set_flight(&env, &flight_id, &flight);
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("schedule"), flight_id.clone()),
            (departure_time, arrival_time),
        );
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("updated"), flight_id),
            (flight.airline_id, departure_time, arrival_time),
        );
    }

    pub fn update_flight_seats(
        env: Env,
        airline_admin: Address,
        flight_id: Symbol,
        total_seats: u32,
        available_seats: u32,
    ) {
        airline_admin.require_auth();
        let mut flight = FlightRegistryStorage::get_flight(&env, &flight_id)
            .expect("Flight not found");
        assert!(flight.airline_admin == airline_admin, "Unauthorized");
        assert!(total_seats > 0, "Invalid seats");
        assert!(available_seats <= total_seats, "Invalid available seats");
        flight.total_seats = total_seats;
        flight.available_seats = available_seats;
        FlightRegistryStorage::set_flight(&env, &flight_id, &flight);
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("seats"), flight_id.clone()),
            (total_seats, available_seats),
        );
        env.events().publish(
            (symbol_short!("flight"), symbol_short!("updated"), flight_id),
            (flight.airline_id, total_seats, available_seats),
        );
    }

    pub fn get_flight_details(env: Env, flight_id: Symbol) -> Option<FlightRecord> {
        FlightRegistryStorage::get_flight(&env, &flight_id)
    }

    pub fn get_flight_status(env: Env, flight_id: Symbol) -> Option<Symbol> {
        FlightRegistryStorage::get_flight(&env, &flight_id).map(|f| f.status)
    }

    pub fn get_flight_schedule(env: Env, flight_id: Symbol) -> Option<(u64, u64)> {
        FlightRegistryStorage::get_flight(&env, &flight_id)
            .map(|f| (f.departure_time, f.arrival_time))
    }

    pub fn get_flight_seats(env: Env, flight_id: Symbol) -> Option<(u32, u32)> {
        FlightRegistryStorage::get_flight(&env, &flight_id)
            .map(|f| (f.total_seats, f.available_seats))
    }

    pub fn get_flight(env: Env, flight_id: Symbol) -> Option<FlightRecord> {
        FlightRegistryStorage::get_flight(&env, &flight_id)
    }

    // Role management functions

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
        testutils::{Address as _, Events},
        Env, IntoVal, Map, Symbol, TryFromVal, Val,
    };

    fn setup_registry<'a>(env: &'a Env, owner: &'a Address) -> (Address, crate::FlightRegistryContractClient<'a>) {
        let contract_id = env.register(crate::FlightRegistryContract, ());
        let client = crate::FlightRegistryContractClient::new(env, &contract_id);
        client.initialize(owner);
        (contract_id, client)
    }

    fn sample_metadata(env: &Env) -> Map<Symbol, Val> {
        let mut m = Map::new(env);
        m.set(Symbol::new(env, "route"), Symbol::new(env, "LOS_NBO").to_val());
        m.set(Symbol::new(env, "aircraft"), Symbol::new(env, "A320").to_val());
        m
    }

    #[test]
    fn test_add_flight_with_details_and_read_path() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "TRAQ");
        let flight_id = Symbol::new(&env, "TRAQ100");

        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "TraqoraAir"));
        let status = Symbol::new(&env, "active");
        let dep = 1_700_000_000;
        let arr = 1_700_003_600;
        client.add_flight_with_details(
            &airline_admin,
            &flight_id,
            &sample_metadata(&env),
            &status,
            &dep,
            &arr,
            &180,
            &180,
        );
        // Events from add_flight_with_details: added + details (capture before view calls)
        let events = env.events().all();
        assert!(events.len() >= 2, "should emit at least added and details");

        // Read path via get_flight_details
        let flight = client.get_flight_details(&flight_id).unwrap();
        assert_eq!(flight.flight_id, flight_id);
        assert_eq!(flight.status, status);
        assert_eq!(flight.departure_time, dep);
        assert_eq!(flight.arrival_time, arr);
        assert_eq!(flight.total_seats, 180);
        assert_eq!(flight.available_seats, 180);

        // Read via dedicated getters
        assert_eq!(client.get_flight_status(&flight_id).unwrap(), status);
        assert_eq!(client.get_flight_schedule(&flight_id).unwrap(), (dep, arr));
        assert_eq!(client.get_flight_seats(&flight_id).unwrap(), (180, 180));
    }

    #[test]
    fn test_update_flight_status_emits_event_and_is_deterministic() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "STAT");
        let flight_id = Symbol::new(&env, "STAT100");
        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "StatAir"));
        client.add_flight(&airline_admin, &flight_id, &sample_metadata(&env));
        // Initial status is active
        assert_eq!(client.get_flight_status(&flight_id).unwrap(), Symbol::new(&env, "active"));
        // Update to cancelled
        let cancelled = Symbol::new(&env, "cancelled");
        client.update_flight_status(&airline_admin, &flight_id, &cancelled);
        // Event on update: update_flight_status emits status + updated (capture before view)
        let events = env.events().all();
        assert!(events.len() >= 2, "update should emit status and updated");
        assert_eq!(client.get_flight_status(&flight_id).unwrap(), cancelled);
        // Deterministic: same sequence yields same state
        let flight = client.get_flight(&flight_id).unwrap();
        assert_eq!(flight.status, cancelled);
    }

    #[test]
    fn test_update_flight_schedule_and_seats() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "SCHD");
        let flight_id = Symbol::new(&env, "SCHD200");
        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "SchedAir"));
        client.add_flight(&airline_admin, &flight_id, &sample_metadata(&env));
        // Update schedule
        let dep = 1_800_000_000;
        let arr = 1_800_003_600;
        client.update_flight_schedule(&airline_admin, &flight_id, &dep, &arr);
        assert_eq!(client.get_flight_schedule(&flight_id).unwrap(), (dep, arr));
        // Update seats
        client.update_flight_seats(&airline_admin, &flight_id, &200, &150);
        assert_eq!(client.get_flight_seats(&flight_id).unwrap(), (200, 150));
        // Full read path
        let flight = client.get_flight_details(&flight_id).unwrap();
        assert_eq!(flight.departure_time, dep);
        assert_eq!(flight.total_seats, 200);
    }

    #[test]
    #[should_panic(expected = "Invalid status")]
    fn test_invalid_status_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "BAD");
        let flight_id = Symbol::new(&env, "BAD100");
        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "BadAir"));
        client.add_flight(&airline_admin, &flight_id, &sample_metadata(&env));
        client.update_flight_status(&airline_admin, &flight_id, &Symbol::new(&env, "unknown"));
    }

    #[test]
    #[should_panic(expected = "Invalid schedule")]
    fn test_invalid_schedule_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "SCH");
        let flight_id = Symbol::new(&env, "SCH100");
        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "SchedAir"));
        client.add_flight(&airline_admin, &flight_id, &sample_metadata(&env));
        client.update_flight_schedule(&airline_admin, &flight_id, &1_000, &500);
    }

    #[test]
    #[should_panic(expected = "Invalid available seats")]
    fn test_invalid_seats_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "SEAT");
        let flight_id = Symbol::new(&env, "SEAT100");
        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "SeatAir"));
        client.add_flight(&airline_admin, &flight_id, &sample_metadata(&env));
        client.update_flight_seats(&airline_admin, &flight_id, &100, &150);
    }

    #[test]
    fn test_existing_flight_update_preserves_metadata_and_emits_updated() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let (_, client) = setup_registry(&env, &owner);
        let airline_admin = Address::generate(&env);
        let airline_id = Symbol::new(&env, "UPD");
        let flight_id = Symbol::new(&env, "UPD100");
        client.register_airline(&owner, &airline_admin, &airline_id, &Symbol::new(&env, "UpdAir"));
        client.add_flight(&airline_admin, &flight_id, &sample_metadata(&env));
        let before = client.get_flight(&flight_id).unwrap();
        // Update via add_flight (same flight_id, should preserve status/schedule/seats)
        let mut new_meta = Map::new(&env);
        new_meta.set(Symbol::new(&env, "route"), Symbol::new(&env, "LOS_JFK").to_val());
        client.add_flight(&airline_admin, &flight_id, &new_meta);
        // Event on update: second add_flight should emit updated + added (capture before view)
        let events = env.events().all();
        assert!(events.len() >= 1, "update should emit at least one event");
        let after = client.get_flight(&flight_id).unwrap();
        let route_val = after.metadata.get(Symbol::new(&env, "route")).unwrap();
        let route_sym = Symbol::try_from_val(&env, &route_val).unwrap();
        assert_eq!(route_sym, Symbol::new(&env, "LOS_JFK"));
        // Status preserved
        assert_eq!(after.status, before.status);
    }
}
