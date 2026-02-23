use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, String};
use traqora_contracts::token::{TRQTokenContract, TRQTokenContractClient};
use traqora_contracts::booking::{BookingContract, BookingContractClient};
use traqora_contracts::airline::{AirlineContract, AirlineContractClient};
use traqora_contracts::loyalty::{LoyaltyContract, LoyaltyContractClient};
use traqora_contracts::governance::{GovernanceContract, GovernanceContractClient};
use traqora_contracts::refund::{RefundContract, RefundContractClient};

pub struct Contracts<'a> {
    pub token: TRQTokenContractClient<'a>,
    pub booking: BookingContractClient<'a>,
    pub airline: AirlineContractClient<'a>,
    pub loyalty: LoyaltyContractClient<'a>,
    pub governance: GovernanceContractClient<'a>,
    pub refund: RefundContractClient<'a>,
}

pub struct Actors {
    pub admin: Address,
    pub passenger: Address,
    pub airline: Address,
}

pub fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

pub fn generate_actors(env: &Env) -> Actors {
    Actors {
        admin: Address::generate(env),
        passenger: Address::generate(env),
        airline: Address::generate(env),
    }
}

pub fn register_contracts<'a>(env: &'a Env) -> Contracts<'a> {
    let token_id = env.register(TRQTokenContract, ());
    let booking_id = env.register(BookingContract, ());
    let airline_id = env.register(AirlineContract, ());
    let loyalty_id = env.register(LoyaltyContract, ());
    let governance_id = env.register(GovernanceContract, ());
    let refund_id = env.register(RefundContract, ());

    Contracts {
        token: TRQTokenContractClient::new(env, &token_id),
        booking: BookingContractClient::new(env, &booking_id),
        airline: AirlineContractClient::new(env, &airline_id),
        loyalty: LoyaltyContractClient::new(env, &loyalty_id),
        governance: GovernanceContractClient::new(env, &governance_id),
        refund: RefundContractClient::new(env, &refund_id),
    }
}

pub fn initialize_token(env: &Env, token: &TRQTokenContractClient, admin: &Address) {
    token.initialize(
        admin,
        &String::from_str(env, "TRQ"),
        &Symbol::new(env, "TRQ"),
        &7,
    );
}

pub fn register_and_verify_airline(
    env: &Env,
    airline_client: &AirlineContractClient,
    airline: &Address,
) {
    airline_client.register_airline(
        airline,
        &Symbol::new(env, "TraqoraAir"),
        &Symbol::new(env, "TQ"),
    );
    airline_client.verify_airline(&Address::generate(env), airline);
}
