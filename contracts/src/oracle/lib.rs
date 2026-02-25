use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
pub struct OracleProvider {
    pub address: Address,
    pub stake: i128,
    pub registered_at: u64,
    pub slashed: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct OracleConfig {
    pub admin: Address,
    pub min_stake: i128,
    pub consensus_threshold: u32,
    pub booking_contract: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct FlightStatusReport {
    pub flight_number: Symbol,
    pub booking_id: u64,
    pub status: Symbol,
    pub provider: Address,
    pub timestamp: u64,
    pub proof: BytesN<32>,
}

pub struct OracleStorage;

impl OracleStorage {
    pub fn get_config(env: &Env) -> Option<OracleConfig> {
        env.storage().instance().get(&symbol_short!("cfg"))
    }
    pub fn set_config(env: &Env, cfg: &OracleConfig) {
        env.storage().instance().set(&symbol_short!("cfg"), cfg);
    }
    pub fn get_provider(env: &Env, addr: &Address) -> Option<OracleProvider> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("prov"), addr))
    }
    pub fn set_provider(env: &Env, addr: &Address, prov: &OracleProvider) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("prov"), addr), prov);
    }
    pub fn status_count(
        env: &Env,
        flight_number: &Symbol,
        booking_id: u64,
        status: &Symbol,
    ) -> u32 {
        env.storage()
            .persistent()
            .get(&(symbol_short!("cnt"), flight_number, booking_id, status))
            .unwrap_or(0u32)
    }
    pub fn inc_status_count(env: &Env, flight_number: &Symbol, booking_id: u64, status: &Symbol) {
        let c = Self::status_count(env, flight_number, booking_id, status);
        env.storage().persistent().set(
            &(symbol_short!("cnt"), flight_number, booking_id, status),
            &(c + 1),
        );
    }
    pub fn get_report(
        env: &Env,
        flight_number: &Symbol,
        booking_id: u64,
        idx: u32,
    ) -> Option<FlightStatusReport> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("rep"), flight_number, booking_id, idx))
    }
    pub fn add_report(
        env: &Env,
        flight_number: &Symbol,
        booking_id: u64,
        report: &FlightStatusReport,
    ) {
        let mut idx = 0u32;
        loop {
            if Self::get_report(env, flight_number, booking_id, idx).is_none() {
                break;
            }
            idx += 1;
        }
        env.storage().persistent().set(
            &(symbol_short!("rep"), flight_number, booking_id, idx),
            report,
        );
    }
}

#[contract]
pub struct FlightOracle;

#[contractimpl]
impl FlightOracle {
    pub fn initialize(
        env: Env,
        admin: Address,
        min_stake: i128,
        consensus_threshold: u32,
        booking_contract: Address,
    ) {
        admin.require_auth();
        assert!(
            OracleStorage::get_config(&env).is_none(),
            "Already initialized"
        );
        assert!(min_stake > 0, "Invalid min_stake");
        assert!(consensus_threshold > 0, "Invalid threshold");
        let cfg = OracleConfig {
            admin: admin.clone(),
            min_stake,
            consensus_threshold,
            booking_contract,
        };
        OracleStorage::set_config(&env, &cfg);
        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("init")),
            (admin, min_stake, consensus_threshold),
        );
    }

    pub fn register_oracle_provider(env: Env, admin: Address, provider: Address, stake: i128) {
        admin.require_auth();
        let cfg = OracleStorage::get_config(&env).expect("Not initialized");
        assert!(cfg.admin == admin, "Unauthorized");
        assert!(stake >= cfg.min_stake, "Insufficient stake");
        assert!(
            OracleStorage::get_provider(&env, &provider).is_none(),
            "Already registered"
        );
        let prov = OracleProvider {
            address: provider.clone(),
            stake,
            registered_at: env.ledger().timestamp(),
            slashed: false,
        };
        OracleStorage::set_provider(&env, &provider, &prov);
        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("provider")),
            (provider, stake),
        );
    }

    pub fn submit_flight_status(
        env: Env,
        provider: Address,
        flight_number: Symbol,
        booking_id: u64,
        status: Symbol,
        timestamp: u64,
        proof: BytesN<32>,
    ) {
        provider.require_auth();
        let prov = OracleStorage::get_provider(&env, &provider).expect("Provider not registered");
        assert!(!prov.slashed, "Provider slashed");

        let mut msg = Bytes::new(&env);
        let booking_bytes = booking_id.to_be_bytes();
        for b in booking_bytes.iter() {
            msg.push_back(*b);
        }
        let ts_bytes = timestamp.to_be_bytes();
        for b in ts_bytes.iter() {
            msg.push_back(*b);
        }

        let computed: BytesN<32> = env.crypto().keccak256(&msg).into();
        assert!(computed == proof, "Invalid proof");

        let report = FlightStatusReport {
            flight_number: flight_number.clone(),
            booking_id,
            status: status.clone(),
            provider: provider.clone(),
            timestamp,
            proof,
        };
        OracleStorage::add_report(&env, &flight_number, booking_id, &report);
        OracleStorage::inc_status_count(&env, &flight_number, booking_id, &status);

        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("status")),
            (flight_number, booking_id, status.clone(), provider),
        );
    }

    pub fn verify_flight_completion(env: Env, flight_number: Symbol, booking_id: u64) {
        let cfg = OracleStorage::get_config(&env).expect("Not initialized");
        let status = symbol_short!("completed");
        let count = OracleStorage::status_count(&env, &flight_number, booking_id, &status);
        assert!(count >= cfg.consensus_threshold, "Insufficient consensus");

        let booking_client =
            crate::booking::BookingContractClient::new(&env, &cfg.booking_contract);
        let self_addr = env.current_contract_address();
        booking_client.oracle_release_payment(&self_addr, &booking_id);

        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("settled")),
            (booking_id, status),
        );
    }

    pub fn verify_airline_cancellation(env: Env, flight_number: Symbol, booking_id: u64) {
        let cfg = OracleStorage::get_config(&env).expect("Not initialized");
        let status = symbol_short!("cancelled");
        let count = OracleStorage::status_count(&env, &flight_number, booking_id, &status);
        assert!(count >= cfg.consensus_threshold, "Insufficient consensus");

        let booking_client =
            crate::booking::BookingContractClient::new(&env, &cfg.booking_contract);
        let self_addr = env.current_contract_address();
        booking_client.oracle_refund_airline_cancel(&self_addr, &booking_id);

        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("refunded")),
            (booking_id, status),
        );
    }
}
