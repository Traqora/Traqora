use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short, Address, Env, Symbol, Vec,
};

// Contract metadata
contractmeta!(key = "version", val = "1.0.0");
contractmeta!(key = "contract_type", val = "admin_multisig");

/// Action types for admin proposals
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdminActionType {
    EmergencyStop,
    EmergencyResume,
    ParameterChange,
    ContractUpgrade,
    AddSigner,
    RemoveSigner,
    UpdateThreshold,
}

/// Admin action proposal with expiration
#[contracttype]
#[derive(Clone)]
pub struct AdminProposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub action_type: AdminActionType,
    pub target_contract: Option<Address>,
    pub parameter_key: Option<Symbol>,
    pub parameter_value: Option<i128>,
    pub target_address: Option<Address>,
    pub new_threshold: Option<u32>,
    pub proposed_at: u64,
    pub expires_at: u64,
    pub approvals: Vec<Address>,
    pub executed: bool,
    pub cancelled: bool,
}

/// Multi-signature configuration
#[contracttype]
#[derive(Clone)]
pub struct MultisigConfig {
    pub signers: Vec<Address>,
    pub threshold: u32,
    pub proposal_expiration: u64,
}

/// Storage helper for admin operations
pub struct AdminStorage;

impl AdminStorage {
    pub fn get_multisig_config(env: &Env) -> Option<MultisigConfig> {
        env.storage()
            .instance()
            .get(&symbol_short!("ms_config"))
    }

    pub fn set_multisig_config(env: &Env, config: &MultisigConfig) {
        env.storage()
            .instance()
            .set(&symbol_short!("ms_config"), config);
    }

    pub fn get_proposal(env: &Env, proposal_id: u64) -> Option<AdminProposal> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("proposal"), proposal_id))
    }

    pub fn set_proposal(env: &Env, proposal_id: u64, proposal: &AdminProposal) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("proposal"), proposal_id), proposal);
    }

    pub fn get_proposal_count(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("p_count"))
            .unwrap_or(0)
    }

    pub fn set_proposal_count(env: &Env, count: u64) {
        env.storage()
            .instance()
            .set(&symbol_short!("p_count"), &count);
    }

    pub fn has_approved(env: &Env, proposal_id: u64, signer: &Address) -> bool {
        env.storage()
            .persistent()
            .has(&(symbol_short!("approved"), proposal_id, signer))
    }

    pub fn record_approval(env: &Env, proposal_id: u64, signer: &Address) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("approved"), proposal_id, signer), &true);
    }

    pub fn is_emergency_stopped(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("e_stop"))
            .unwrap_or(false)
    }

    pub fn set_emergency_stopped(env: &Env, stopped: bool) {
        env.storage()
            .instance()
            .set(&symbol_short!("e_stop"), &stopped);
    }
}

#[contract]
pub struct AdminMultisig;

#[contractimpl]
impl AdminMultisig {
    /// Initialize the multi-signature admin system
    /// 
    /// # Arguments
    /// * `signers` - Initial list of authorized signers
    /// * `threshold` - Number of signatures required (2-of-3, 3-of-5, etc.)
    /// * `proposal_expiration` - Time in seconds before proposals expire
    pub fn initialize(
        env: Env,
        signers: Vec<Address>,
        threshold: u32,
        proposal_expiration: u64,
    ) {
        assert!(
            AdminStorage::get_multisig_config(&env).is_none(),
            "Already initialized"
        );
        assert!(signers.len() >= threshold as u32, "Threshold exceeds signer count");
        assert!(threshold > 0, "Threshold must be > 0");
        assert!(threshold >= 2, "Threshold must be at least 2 for security");
        assert!(proposal_expiration > 0, "Expiration must be > 0");

        let config = MultisigConfig {
            signers,
            threshold,
            proposal_expiration,
        };

        AdminStorage::set_multisig_config(&env, &config);

        env.events().publish(
            (symbol_short!("admin"), symbol_short!("init")),
            threshold,
        );
    }

    /// Propose an admin action
    /// 
    /// # Arguments
    /// * `proposer` - Address of the proposer (must be a signer)
    /// * `action_type` - Type of admin action to perform
    /// * `target_contract` - Optional target contract address
    /// * `parameter_key` - Optional parameter key for parameter changes
    /// * `parameter_value` - Optional parameter value
    /// * `target_address` - Optional address for add/remove signer actions
    /// * `new_threshold` - Optional new threshold for threshold updates
    pub fn propose_admin_action(
        env: Env,
        proposer: Address,
        action_type: AdminActionType,
        target_contract: Option<Address>,
        parameter_key: Option<Symbol>,
        parameter_value: Option<i128>,
        target_address: Option<Address>,
        new_threshold: Option<u32>,
    ) -> u64 {
        proposer.require_auth();

        let config = AdminStorage::get_multisig_config(&env).expect("Not initialized");
        assert!(
            Self::is_signer(&config, &proposer),
            "Not an authorized signer"
        );

        // Validate action-specific parameters
        match action_type {
            AdminActionType::ParameterChange => {
                assert!(parameter_key.is_some(), "Parameter key required");
                assert!(parameter_value.is_some(), "Parameter value required");
            }
            AdminActionType::AddSigner | AdminActionType::RemoveSigner => {
                assert!(target_address.is_some(), "Target address required");
            }
            AdminActionType::UpdateThreshold => {
                assert!(new_threshold.is_some(), "New threshold required");
                let threshold = new_threshold.unwrap();
                assert!(threshold > 0, "Threshold must be > 0");
                assert!(threshold >= 2, "Threshold must be at least 2");
            }
            _ => {}
        }

        let proposal_count = AdminStorage::get_proposal_count(&env) + 1;
        AdminStorage::set_proposal_count(&env, proposal_count);

        let current_time = env.ledger().timestamp();
        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());

        let proposal = AdminProposal {
            proposal_id: proposal_count,
            proposer: proposer.clone(),
            action_type: action_type.clone(),
            target_contract,
            parameter_key,
            parameter_value,
            target_address,
            new_threshold,
            proposed_at: current_time,
            expires_at: current_time + config.proposal_expiration,
            approvals,
            executed: false,
            cancelled: false,
        };

        AdminStorage::set_proposal(&env, proposal_count, &proposal);
        AdminStorage::record_approval(&env, proposal_count, &proposer);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("created")),
            (proposal_count, action_type),
        );

        proposal_count
    }

    /// Approve an admin action proposal
    /// 
    /// # Arguments
    /// * `signer` - Address of the approving signer
    /// * `proposal_id` - ID of the proposal to approve
    pub fn approve_admin_action(env: Env, signer: Address, proposal_id: u64) {
        signer.require_auth();

        let config = AdminStorage::get_multisig_config(&env).expect("Not initialized");
        assert!(
            Self::is_signer(&config, &signer),
            "Not an authorized signer"
        );

        let mut proposal =
            AdminStorage::get_proposal(&env, proposal_id).expect("Proposal not found");

        assert!(!proposal.executed, "Already executed");
        assert!(!proposal.cancelled, "Proposal cancelled");
        assert!(
            env.ledger().timestamp() <= proposal.expires_at,
            "Proposal expired"
        );
        assert!(
            !AdminStorage::has_approved(&env, proposal_id, &signer),
            "Already approved"
        );

        proposal.approvals.push_back(signer.clone());
        AdminStorage::set_proposal(&env, proposal_id, &proposal);
        AdminStorage::record_approval(&env, proposal_id, &signer);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("approved")),
            (proposal_id, signer),
        );
    }

    /// Execute an approved admin action
    /// 
    /// # Arguments
    /// * `executor` - Address executing the action (must be a signer)
    /// * `proposal_id` - ID of the proposal to execute
    pub fn execute_admin_action(env: Env, executor: Address, proposal_id: u64) {
        executor.require_auth();

        let config = AdminStorage::get_multisig_config(&env).expect("Not initialized");
        assert!(
            Self::is_signer(&config, &executor),
            "Not an authorized signer"
        );

        let mut proposal =
            AdminStorage::get_proposal(&env, proposal_id).expect("Proposal not found");

        assert!(!proposal.executed, "Already executed");
        assert!(!proposal.cancelled, "Proposal cancelled");
        assert!(
            env.ledger().timestamp() <= proposal.expires_at,
            "Proposal expired"
        );
        assert!(
            proposal.approvals.len() >= config.threshold,
            "Insufficient approvals"
        );

        // Execute the action atomically
        match proposal.action_type {
            AdminActionType::EmergencyStop => {
                AdminStorage::set_emergency_stopped(&env, true);
                env.events().publish(
                    (symbol_short!("emergency"), symbol_short!("stopped")),
                    proposal_id,
                );
            }
            AdminActionType::EmergencyResume => {
                AdminStorage::set_emergency_stopped(&env, false);
                env.events().publish(
                    (symbol_short!("emergency"), symbol_short!("resumed")),
                    proposal_id,
                );
            }
            AdminActionType::AddSigner => {
                let new_signer = proposal.target_address.clone().expect("No target address");
                Self::add_signer_internal(env.clone(), new_signer.clone());
                env.events().publish(
                    (symbol_short!("signer"), symbol_short!("added")),
                    (proposal_id, new_signer),
                );
            }
            AdminActionType::RemoveSigner => {
                let remove_signer = proposal.target_address.clone().expect("No target address");
                Self::remove_signer_internal(env.clone(), remove_signer.clone());
                env.events().publish(
                    (symbol_short!("signer"), symbol_short!("removed")),
                    (proposal_id, remove_signer),
                );
            }
            AdminActionType::UpdateThreshold => {
                let new_threshold = proposal.new_threshold.expect("No new threshold");
                Self::update_threshold_internal(env.clone(), new_threshold);
                env.events().publish(
                    (symbol_short!("threshold"), symbol_short!("updated")),
                    (proposal_id, new_threshold),
                );
            }
            AdminActionType::ParameterChange => {
                let key = proposal.parameter_key.clone().expect("No parameter key");
                let value = proposal.parameter_value.expect("No parameter value");
                env.events().publish(
                    (symbol_short!("param"), symbol_short!("changed")),
                    (proposal_id, key, value),
                );
            }
            AdminActionType::ContractUpgrade => {
                env.events().publish(
                    (symbol_short!("upgrade"), symbol_short!("executed")),
                    proposal_id,
                );
            }
        }

        proposal.executed = true;
        AdminStorage::set_proposal(&env, proposal_id, &proposal);

        env.events().publish(
            (symbol_short!("action"), symbol_short!("executed")),
            (proposal_id, proposal.action_type),
        );
    }

    /// Cancel a proposal (only by proposer before execution)
    pub fn cancel_proposal(env: Env, proposer: Address, proposal_id: u64) {
        proposer.require_auth();

        let mut proposal =
            AdminStorage::get_proposal(&env, proposal_id).expect("Proposal not found");

        assert!(proposal.proposer == proposer, "Only proposer can cancel");
        assert!(!proposal.executed, "Already executed");
        assert!(!proposal.cancelled, "Already cancelled");

        proposal.cancelled = true;
        AdminStorage::set_proposal(&env, proposal_id, &proposal);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("cancelled")),
            proposal_id,
        );
    }

    /// Add a new signer (internal, called after multi-sig approval)
    fn add_signer_internal(env: Env, new_signer: Address) {
        let mut config = AdminStorage::get_multisig_config(&env).expect("Not initialized");

        // Check if already a signer
        for signer in config.signers.iter() {
            assert!(signer != new_signer, "Already a signer");
        }

        config.signers.push_back(new_signer);
        AdminStorage::set_multisig_config(&env, &config);
    }

    /// Remove a signer (internal, called after multi-sig approval)
    fn remove_signer_internal(env: Env, remove_signer: Address) {
        let mut config = AdminStorage::get_multisig_config(&env).expect("Not initialized");

        let mut new_signers = Vec::new(&env);
        let mut found = false;

        for signer in config.signers.iter() {
            if signer == remove_signer {
                found = true;
            } else {
                new_signers.push_back(signer);
            }
        }

        assert!(found, "Signer not found");
        assert!(
            new_signers.len() >= config.threshold as u32,
            "Cannot remove: would fall below threshold"
        );

        config.signers = new_signers;
        AdminStorage::set_multisig_config(&env, &config);
    }

    /// Update threshold (internal, called after multi-sig approval)
    fn update_threshold_internal(env: Env, new_threshold: u32) {
        let mut config = AdminStorage::get_multisig_config(&env).expect("Not initialized");

        assert!(
            config.signers.len() >= new_threshold as u32,
            "Threshold exceeds signer count"
        );
        assert!(new_threshold >= 2, "Threshold must be at least 2");

        config.threshold = new_threshold;
        AdminStorage::set_multisig_config(&env, &config);
    }

    /// Check if address is a signer
    fn is_signer(config: &MultisigConfig, address: &Address) -> bool {
        for signer in config.signers.iter() {
            if signer == *address {
                return true;
            }
        }
        false
    }

    // Query functions

    pub fn get_proposal(env: Env, proposal_id: u64) -> Option<AdminProposal> {
        AdminStorage::get_proposal(&env, proposal_id)
    }

    pub fn get_multisig_config(env: Env) -> Option<MultisigConfig> {
        AdminStorage::get_multisig_config(&env)
    }

    pub fn get_proposal_count(env: Env) -> u64 {
        AdminStorage::get_proposal_count(&env)
    }

    pub fn is_emergency_stopped(env: Env) -> bool {
        AdminStorage::is_emergency_stopped(&env)
    }

    pub fn has_approved(env: Env, proposal_id: u64, signer: Address) -> bool {
        AdminStorage::has_approved(&env, proposal_id, &signer)
    }

    pub fn is_signer_address(env: Env, address: Address) -> bool {
        if let Some(config) = AdminStorage::get_multisig_config(&env) {
            Self::is_signer(&config, &address)
        } else {
            false
        }
    }
}
