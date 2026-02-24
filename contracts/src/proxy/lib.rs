use soroban_sdk::{contract, contractimpl, contractmeta, contracttype, symbol_short, Address, BytesN, Env, Symbol, Vec};

// Contract meta for version tracking
contractmeta!(key = "version", val = "1.0.0");
contractmeta!(key = "contract_type", val = "proxy");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProxyState {
    Active,
    Paused,
    Upgrading,
}

#[contracttype]
#[derive(Clone)]
pub struct ProxyConfig {
    pub admin: Address,
    pub implementation: BytesN<32>,
    pub state: ProxyState,
    pub version: u32,
    pub storage_version: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct MultisigConfig {
    pub signers: Vec<Address>,
    pub threshold: u32,
    pub proposal_count: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct UpgradeProposal {
    pub proposal_id: u64,
    pub new_implementation: BytesN<32>,
    pub new_storage_version: Option<u32>,
    pub proposed_at: u64,
    pub approvals: Vec<Address>,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct StorageMigration {
    pub from_version: u32,
    pub to_version: u32,
    pub migration_type: Symbol,
    pub completed: bool,
}

pub struct ProxyStorage;

impl ProxyStorage {
    pub fn get_config(env: &Env) -> Option<ProxyConfig> {
        env.storage().instance().get(&symbol_short!("config"))
    }
    
    pub fn set_config(env: &Env, config: &ProxyConfig) {
        env.storage().instance().set(&symbol_short!("config"), config);
    }
    
    pub fn get_multisig(env: &Env) -> Option<MultisigConfig> {
        env.storage().instance().get(&symbol_short!("multisig"))
    }
    
    pub fn set_multisig(env: &Env, multisig: &MultisigConfig) {
        env.storage().instance().set(&symbol_short!("multisig"), multisig);
    }
    
    pub fn get_upgrade_proposal(env: &Env, proposal_id: u64) -> Option<UpgradeProposal> {
        env.storage().persistent().get(&(symbol_short!("upgrade"), proposal_id))
    }
    
    pub fn set_upgrade_proposal(env: &Env, proposal_id: u64, proposal: &UpgradeProposal) {
        env.storage().persistent().set(&(symbol_short!("upgrade"), proposal_id), proposal);
    }
    
    pub fn get_multisig_proposal_count(env: &Env) -> u64 {
        env.storage().instance().get(&symbol_short!("ms_count")).unwrap_or(0)
    }
    
    pub fn set_multisig_proposal_count(env: &Env, count: u64) {
        env.storage().instance().set(&symbol_short!("ms_count"), &count);
    }
    
    pub fn has_approved(env: &Env, proposal_id: u64, signer: &Address) -> bool {
        env.storage().persistent().has(&(symbol_short!("approved"), proposal_id, signer))
    }
    
    pub fn record_approval(env: &Env, proposal_id: u64, signer: &Address) {
        env.storage().persistent().set(&(symbol_short!("approved"), proposal_id, signer), &true);
    }
    
    pub fn get_storage_migration(env: &Env, from_version: u32, to_version: u32) -> Option<StorageMigration> {
        env.storage().persistent().get(&(symbol_short!("migration"), from_version, to_version))
    }
    
    pub fn set_storage_migration(env: &Env, migration: &StorageMigration) {
        env.storage().persistent().set(
            &(symbol_short!("migration"), migration.from_version, migration.to_version),
            migration
        );
    }
}

#[contract]
pub struct ContractProxy;

#[contractimpl]
impl ContractProxy {
    pub fn initialize(
        env: Env,
        admin: Address,
        implementation: BytesN<32>,
        signers: Vec<Address>,
        threshold: u32,
    ) {
        assert!(ProxyStorage::get_config(&env).is_none(), "Already initialized");
        assert!(signers.len() >= threshold as u32, "Threshold exceeds signer count");
        assert!(threshold > 0, "Threshold must be > 0");
        
        let config = ProxyConfig {
            admin: admin.clone(),
            implementation,
            state: ProxyState::Active,
            version: 1,
            storage_version: 1,
        };
        
        let multisig = MultisigConfig {
            signers,
            threshold,
            proposal_count: 0,
        };
        
        ProxyStorage::set_config(&env, &config);
        ProxyStorage::set_multisig(&env, &multisig);
        
        env.events().publish(
            (symbol_short!("proxy"), symbol_short!("init")),
            (admin, implementation, threshold),
        );
    }
    
    pub fn propose_upgrade(
        env: Env,
        proposer: Address,
        new_implementation: BytesN<32>,
        new_storage_version: Option<u32>,
    ) -> u64 {
        proposer.require_auth();
        
        let multisig = ProxyStorage::get_multisig(&env).expect("Multisig not configured");
        assert!(
            Self::is_signer(&multisig, &proposer),
            "Not an authorized signer"
        );
        
        let proposal_count = ProxyStorage::get_multisig_proposal_count(&env) + 1;
        ProxyStorage::set_multisig_proposal_count(&env, proposal_count);
        
        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());
        
        let proposal = UpgradeProposal {
            proposal_id: proposal_count,
            new_implementation,
            new_storage_version,
            proposed_at: env.ledger().timestamp(),
            approvals,
            executed: false,
        };
        
        ProxyStorage::set_upgrade_proposal(&env, proposal_count, &proposal);
        ProxyStorage::record_approval(&env, proposal_count, &proposer);
        
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("proposed")),
            (proposal_count, new_implementation),
        );
        
        proposal_count
    }
    
    pub fn approve_upgrade(env: Env, signer: Address, proposal_id: u64) {
        signer.require_auth();
        
        let multisig = ProxyStorage::get_multisig(&env).expect("Multisig not configured");
        assert!(
            Self::is_signer(&multisig, &signer),
            "Not an authorized signer"
        );
        
        let mut proposal = ProxyStorage::get_upgrade_proposal(&env, proposal_id)
            .expect("Proposal not found");
        
        assert!(!proposal.executed, "Already executed");
        assert!(
            !ProxyStorage::has_approved(&env, proposal_id, &signer),
            "Already approved"
        );
        
        proposal.approvals.push_back(signer.clone());
        ProxyStorage::set_upgrade_proposal(&env, proposal_id, &proposal);
        ProxyStorage::record_approval(&env, proposal_id, &signer);
        
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("approved")),
            (proposal_id, signer),
        );
    }
    
    pub fn upgrade_to(env: Env, executor: Address, proposal_id: u64) {
        executor.require_auth();
        
        let multisig = ProxyStorage::get_multisig(&env).expect("Multisig not configured");
        assert!(
            Self::is_signer(&multisig, &executor),
            "Not an authorized signer"
        );
        
        let mut proposal = ProxyStorage::get_upgrade_proposal(&env, proposal_id)
            .expect("Proposal not found");
        
        assert!(!proposal.executed, "Already executed");
        assert!(
            proposal.approvals.len() >= multisig.threshold,
            "Insufficient approvals"
        );
        
        let mut config = ProxyStorage::get_config(&env).expect("Not initialized");
        
        config.state = ProxyState::Upgrading;
        ProxyStorage::set_config(&env, &config);
        
        let old_implementation = config.implementation.clone();
        config.implementation = proposal.new_implementation.clone();
        config.version += 1;
        
        if let Some(new_storage_version) = proposal.new_storage_version {
            let old_storage_version = config.storage_version;
            config.storage_version = new_storage_version;
            
            let migration = StorageMigration {
                from_version: old_storage_version,
                to_version: new_storage_version,
                migration_type: symbol_short!("upgrade"),
                completed: false,
            };
            ProxyStorage::set_storage_migration(&env, &migration);
        }
        
        proposal.executed = true;
        ProxyStorage::set_upgrade_proposal(&env, proposal_id, &proposal);
        
        config.state = ProxyState::Active;
        ProxyStorage::set_config(&env, &config);
        
        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("executed")),
            (proposal_id, config.version, old_implementation, proposal.new_implementation),
        );
    }
    
    pub fn pause_contract(env: Env, admin: Address) {
        admin.require_auth();
        
        let mut config = ProxyStorage::get_config(&env).expect("Not initialized");
        assert!(config.admin == admin, "Unauthorized");
        
        config.state = ProxyState::Paused;
        ProxyStorage::set_config(&env, &config);
        
        env.events().publish(
            (symbol_short!("proxy"), symbol_short!("paused")),
            admin,
        );
    }
    
    pub fn unpause_contract(env: Env, admin: Address) {
        admin.require_auth();
        
        let mut config = ProxyStorage::get_config(&env).expect("Not initialized");
        assert!(config.admin == admin, "Unauthorized");
        
        config.state = ProxyState::Active;
        ProxyStorage::set_config(&env, &config);
        
        env.events().publish(
            (symbol_short!("proxy"), symbol_short!("unpaused")),
            admin,
        );
    }
    
    pub fn migrate_storage(env: Env, migrator: Address, from_version: u32, to_version: u32) {
        migrator.require_auth();
        
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        assert!(config.admin == migrator, "Unauthorized");
        assert!(
            config.state == ProxyState::Upgrading || config.state == ProxyState::Paused,
            "Contract must be paused or upgrading"
        );
        
        let mut migration = ProxyStorage::get_storage_migration(&env, from_version, to_version)
            .expect("Migration not found");
        
        assert!(!migration.completed, "Migration already completed");
        
        migration.completed = true;
        ProxyStorage::set_storage_migration(&env, &migration);
        
        env.events().publish(
            (symbol_short!("storage"), symbol_short!("migrated")),
            (from_version, to_version),
        );
    }
    
    pub fn update_multisig(
        env: Env,
        admin: Address,
        new_signers: Vec<Address>,
        new_threshold: u32,
    ) {
        admin.require_auth();
        
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        assert!(config.admin == admin, "Unauthorized");
        
        assert!(new_signers.len() >= new_threshold as u32, "Threshold exceeds signer count");
        assert!(new_threshold > 0, "Threshold must be > 0");
        
        let mut multisig = ProxyStorage::get_multisig(&env).expect("Multisig not configured");
        multisig.signers = new_signers;
        multisig.threshold = new_threshold;
        
        ProxyStorage::set_multisig(&env, &multisig);
        
        env.events().publish(
            (symbol_short!("multisig"), symbol_short!("updated")),
            new_threshold,
        );
    }
    
    pub fn get_implementation(env: Env) -> BytesN<32> {
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        config.implementation
    }
    
    pub fn get_proxy_state(env: Env) -> ProxyState {
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        config.state
    }
    
    pub fn get_version(env: Env) -> u32 {
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        config.version
    }
    
    pub fn get_storage_version(env: Env) -> u32 {
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        config.storage_version
    }
    
    pub fn get_upgrade_proposal(env: Env, proposal_id: u64) -> Option<UpgradeProposal> {
        ProxyStorage::get_upgrade_proposal(&env, proposal_id)
    }
    
    pub fn get_multisig_config(env: Env) -> Option<MultisigConfig> {
        ProxyStorage::get_multisig(&env)
    }
    
    pub fn is_paused(env: Env) -> bool {
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        config.state == ProxyState::Paused
    }
    
    pub fn is_upgrading(env: Env) -> bool {
        let config = ProxyStorage::get_config(&env).expect("Not initialized");
        config.state == ProxyState::Upgrading
    }
    
    fn is_signer(multisig: &MultisigConfig, address: &Address) -> bool {
        for signer in multisig.signers.iter() {
            if signer == *address {
                return true;
            }
        }
        false
    }
}
