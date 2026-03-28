use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, IntoVal, Map, String, Symbol, TryFromVal, Val,
};
use traqora_contracts::flight_registry::{FlightRegistryContract, FlightRegistryContractClient};

fn setup_registry<'a>(env: &'a Env) -> FlightRegistryContractClient<'a> {
    let contract_id = env.register(FlightRegistryContract, ());
    FlightRegistryContractClient::new(env, &contract_id)
}

fn sample_metadata(env: &Env, route: &str, aircraft: &str) -> Map<Symbol, Val> {
    let mut metadata = Map::new(env);
    metadata.set(
        Symbol::new(env, "route"),
        String::from_str(env, route).into_val(env),
    );
    metadata.set(
        Symbol::new(env, "aircraft"),
        String::from_str(env, aircraft).into_val(env),
    );
    metadata
}

#[test]
fn test_register_airline_and_get_flight() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup_registry(&env);
    let airline_admin = Address::generate(&env);
    let airline_id = Symbol::new(&env, "TRAQ");
    let flight_id = Symbol::new(&env, "TRAQ100");

    client.register_airline(
        &airline_admin,
        &airline_id,
        &Symbol::new(&env, "TraqoraAir"),
    );
    client.add_flight(
        &airline_admin,
        &flight_id,
        &sample_metadata(&env, "LOS-NBO", "A320"),
    );

    let flight = client.get_flight(&flight_id).unwrap();
    assert_eq!(flight.flight_id, flight_id);
    assert_eq!(flight.airline_id, airline_id);
    assert_eq!(flight.airline_admin, airline_admin);
    assert_eq!(
        String::try_from_val(
            &env,
            &flight
                .metadata
                .get(Symbol::new(&env, "route"))
                .expect("route metadata missing"),
        )
        .unwrap(),
        String::from_str(&env, "LOS-NBO")
    );
}

#[test]
fn test_same_airline_admin_can_update_flight_metadata() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup_registry(&env);
    let airline_admin = Address::generate(&env);
    let airline_id = Symbol::new(&env, "SKY");
    let flight_id = Symbol::new(&env, "SKY200");

    client.register_airline(&airline_admin, &airline_id, &Symbol::new(&env, "SkyBridge"));
    client.add_flight(
        &airline_admin,
        &flight_id,
        &sample_metadata(&env, "ABV-ACC", "A220"),
    );
    client.add_flight(
        &airline_admin,
        &flight_id,
        &sample_metadata(&env, "ABV-LHR", "A330"),
    );

    let updated = client.get_flight(&flight_id).unwrap();
    assert_eq!(
        String::try_from_val(
            &env,
            &updated
                .metadata
                .get(Symbol::new(&env, "route"))
                .expect("route metadata missing"),
        )
        .unwrap(),
        String::from_str(&env, "ABV-LHR")
    );
}

#[test]
#[should_panic(expected = "Airline not registered")]
fn test_add_flight_requires_registered_airline() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup_registry(&env);
    let airline_admin = Address::generate(&env);

    client.add_flight(
        &airline_admin,
        &Symbol::new(&env, "UNK100"),
        &sample_metadata(&env, "JFK-LHR", "B787"),
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_other_airline_admin_cannot_modify_existing_flight() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup_registry(&env);
    let first_admin = Address::generate(&env);
    let second_admin = Address::generate(&env);
    let flight_id = Symbol::new(&env, "MUX100");

    client.register_airline(
        &first_admin,
        &Symbol::new(&env, "MUXA"),
        &Symbol::new(&env, "MuxAir"),
    );
    client.register_airline(
        &second_admin,
        &Symbol::new(&env, "MUXB"),
        &Symbol::new(&env, "MuxJet"),
    );
    client.add_flight(
        &first_admin,
        &flight_id,
        &sample_metadata(&env, "LOS-JFK", "A321"),
    );

    client.add_flight(
        &second_admin,
        &flight_id,
        &sample_metadata(&env, "LOS-DXB", "B777"),
    );
}

#[test]
fn test_register_airline_and_add_flight_emit_events() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup_registry(&env);
    let airline_admin = Address::generate(&env);
    let airline_id = Symbol::new(&env, "EVNT");
    let flight_id = Symbol::new(&env, "EVNT900");

    client.register_airline(&airline_admin, &airline_id, &Symbol::new(&env, "EventAir"));
    client.add_flight(
        &airline_admin,
        &flight_id,
        &sample_metadata(&env, "DXB-SIN", "A350"),
    );

    let events = env.events().all();
    assert_eq!(events.len(), 2);

    let airline_event = events.get(0).unwrap();
    assert_eq!(
        Symbol::try_from_val(&env, &airline_event.1.get(0).unwrap()).unwrap(),
        Symbol::new(&env, "airline")
    );
    assert_eq!(
        Symbol::try_from_val(&env, &airline_event.1.get(1).unwrap()).unwrap(),
        Symbol::new(&env, "reg")
    );
    assert_eq!(
        Symbol::try_from_val(&env, &airline_event.1.get(2).unwrap()).unwrap(),
        airline_id
    );
    let airline_data: (Address, Symbol) = TryFromVal::try_from_val(&env, &airline_event.2).unwrap();
    assert_eq!(airline_data.0, airline_admin);
    assert_eq!(airline_data.1, Symbol::new(&env, "EventAir"));

    let flight_event = events.get(1).unwrap();
    assert_eq!(
        Symbol::try_from_val(&env, &flight_event.1.get(0).unwrap()).unwrap(),
        Symbol::new(&env, "flight")
    );
    assert_eq!(
        Symbol::try_from_val(&env, &flight_event.1.get(1).unwrap()).unwrap(),
        Symbol::new(&env, "added")
    );
    assert_eq!(
        Symbol::try_from_val(&env, &flight_event.1.get(2).unwrap()).unwrap(),
        flight_id
    );
    let flight_data: (Symbol, Address) = TryFromVal::try_from_val(&env, &flight_event.2).unwrap();
    assert_eq!(flight_data.0, airline_id);
    assert_eq!(flight_data.1, airline_admin);
    assert_eq!(flight_event.0, client.address);
}
