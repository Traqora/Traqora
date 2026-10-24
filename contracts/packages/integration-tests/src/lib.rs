pub mod time;

use airline::{AirlineContract, AirlineContractClient};
use booking::{BookingContract, BookingContractClient};
use booking_receipt::{BookingReceiptContract, BookingReceiptContractClient};
use governance::{GovernanceContract, GovernanceContractClient};
use loyalty::{LoyaltyContract, LoyaltyContractClient};
use refund::{RefundContract, RefundContractClient};
use refund_automation::{RefundAutomationContract, RefundAutomationContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};
use token::{TRQTokenContract, TRQTokenContractClient};

pub mod snapshot_review;

pub struct Contracts<'a> {
    pub token: TRQTokenContractClient<'a>,
    pub booking: BookingContractClient<'a>,
    pub airline: AirlineContractClient<'a>,
    pub loyalty: LoyaltyContractClient<'a>,
    pub governance: GovernanceContractClient<'a>,
    pub refund: RefundContractClient<'a>,
    pub refund_automation: RefundAutomationContractClient<'a>,
    pub booking_receipt: BookingReceiptContractClient<'a>,
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
    let refund_automation_id = env.register(RefundAutomationContract, ());
    let booking_receipt_id = env.register(BookingReceiptContract, ());

    Contracts {
        token: TRQTokenContractClient::new(env, &token_id),
        booking: BookingContractClient::new(env, &booking_id),
        airline: AirlineContractClient::new(env, &airline_id),
        loyalty: LoyaltyContractClient::new(env, &loyalty_id),
        governance: GovernanceContractClient::new(env, &governance_id),
        refund: RefundContractClient::new(env, &refund_id),
        refund_automation: RefundAutomationContractClient::new(env, &refund_automation_id),
        booking_receipt: BookingReceiptContractClient::new(env, &booking_receipt_id),
    }
}

pub fn initialize_token(env: &Env, token: &TRQTokenContractClient, admin: &Address) {
    token.init_token(
        admin,
        &String::from_str(env, "TRQ"),
        &Symbol::new(env, "TRQ"),
        &7,
    );
}

pub fn register_and_verify_airline(
    env: &Env,
    airline_client: &AirlineContractClient,
    owner: &Address,
    airline: &Address,
) {
    airline_client.register_airline(
        airline,
        &Symbol::new(env, "TraqoraAir"),
        &Symbol::new(env, "TQ"),
    );
    airline_client.verify_airline(owner, airline);
}

/// Soroban transaction envelope state and expiration helper for issue #766.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SorobanTransactionEnvelope {
    pub sequence_number: u32,
    pub time_bounds_min: u64,
    pub time_bounds_max: u64,
    pub footprint_valid: bool,
    pub simulated: bool,
}

impl SorobanTransactionEnvelope {
    pub fn new(sequence_number: u32, time_bounds_min: u64, time_bounds_max: u64) -> Self {
        Self {
            sequence_number,
            time_bounds_min,
            time_bounds_max,
            footprint_valid: true,
            simulated: false,
        }
    }

    pub fn is_expired(&self, current_ledger_seq: u32, current_timestamp: u64) -> bool {
        !self.footprint_valid
            || current_ledger_seq > self.time_bounds_max as u32
            || current_timestamp > self.time_bounds_max
            || current_timestamp < self.time_bounds_min
    }

    pub fn simulate_and_rebuild(
        &mut self,
        new_ledger_seq: u32,
        new_time_min: u64,
        new_time_max: u64,
    ) {
        // Discard expired simulation state and rebuild envelope footprint and bounds
        self.sequence_number = new_ledger_seq;
        self.time_bounds_min = new_time_min;
        self.time_bounds_max = new_time_max;
        self.footprint_valid = true;
        self.simulated = true;
    }
}
