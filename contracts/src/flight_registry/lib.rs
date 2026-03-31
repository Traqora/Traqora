use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol, Val,
};
use crate::access::{AccessControl, Role};

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
}

#[contract]
pub struct FlightRegistryContract;

#[contractimpl]
impl FlightRegistryContract {
    pub fn initialize(env: Env, owner: Address) {
        AccessControl::init_owner(&env, &owner);
    }

    pub fn register_airline(env: Env, executor: Address, admin: Address, airline_id: Symbol, name: Symbol) {
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

        if let Some(existing) = FlightRegistryStorage::get_flight(&env, &flight_id) {
            assert!(existing.airline_admin == airline_admin, "Unauthorized");
        }

        let flight = FlightRecord {
            flight_id: flight_id.clone(),
            airline_id: airline_id.clone(),
            airline_admin: airline_admin.clone(),
            metadata,
        };

        FlightRegistryStorage::set_flight(&env, &flight_id, &flight);

        env.events().publish(
            (symbol_short!("flight"), symbol_short!("added"), flight_id),
            (airline_id, airline_admin),
        );
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
