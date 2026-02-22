use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub title: Symbol,
    pub description: Symbol,
    pub proposal_type: Symbol, // "fee_change", "feature", "upgrade"
    pub voting_start: u64,
    pub voting_end: u64,
    pub yes_votes: i128,
    pub no_votes: i128,
    pub status: Symbol, // "active", "passed", "rejected", "executed"
    pub executed: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct Vote {
    pub voter: Address,
    pub proposal_id: u64,
    pub support: bool, // true = yes, false = no
    pub voting_power: i128,
}

#[contracttype]
pub struct GovernanceConfig {
    pub min_voting_period: u64,
    pub quorum: i128,
    pub proposal_threshold: i128,
}

pub struct GovernanceStorageKey;

impl GovernanceStorageKey {
    pub fn get_proposal(env: &Env, proposal_id: u64) -> Option<Proposal> {
        env.storage().persistent().get(&(symbol_short!("proposal"), proposal_id))
    }
    
    pub fn set_proposal(env: &Env, proposal_id: u64, proposal: &Proposal) {
        env.storage().persistent().set(&(symbol_short!("proposal"), proposal_id), proposal);
    }
    
    pub fn has_voted(env: &Env, voter: &Address, proposal_id: u64) -> bool {
        env.storage().persistent().has(&(symbol_short!("vote"), voter, proposal_id))
    }
    
    pub fn record_vote(env: &Env, voter: &Address, proposal_id: u64) {
        env.storage().persistent().set(&(symbol_short!("vote"), voter, proposal_id), &true);
    }
    
    pub fn get_config(env: &Env) -> Option<GovernanceConfig> {
        env.storage().instance().get(&symbol_short!("config"))
    }
    
    pub fn set_config(env: &Env, config: &GovernanceConfig) {
        env.storage().instance().set(&symbol_short!("config"), config);
    }
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    pub fn initialize(
        env: Env,
        min_voting_period: u64,
        quorum: i128,
        proposal_threshold: i128,
    ) {
        let config = GovernanceConfig {
            min_voting_period,
            quorum,
            proposal_threshold,
        };
        GovernanceStorageKey::set_config(&env, &config);
    }
    
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        title: Symbol,
        description: Symbol,
        proposal_type: Symbol,
        voting_period: u64,
    ) -> u64 {
        proposer.require_auth();
        
        let config = GovernanceStorageKey::get_config(&env)
            .expect("Not initialized");
        
        assert!(
            voting_period >= config.min_voting_period,
            "Voting period too short"
        );
        
        let proposal_id = env.ledger().timestamp();
        let current_time = env.ledger().timestamp();
        
        let proposal = Proposal {
            proposal_id,
            proposer,
            title,
            description,
            proposal_type,
            voting_start: current_time,
            voting_end: current_time + voting_period,
            yes_votes: 0,
            no_votes: 0,
            status: symbol_short!("active"),
            executed: false,
        };
        
        GovernanceStorageKey::set_proposal(&env, proposal_id, &proposal);
        
        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("created")),
            proposal_id,
        );
        
        proposal_id
    }
    
    pub fn cast_vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        support: bool,
        voting_power: i128,
    ) {
        voter.require_auth();
        
        assert!(
            !GovernanceStorageKey::has_voted(&env, &voter, proposal_id),
            "Already voted"
        );
        
        let mut proposal = GovernanceStorageKey::get_proposal(&env, proposal_id)
            .expect("Proposal not found");
        
        let current_time = env.ledger().timestamp();
        assert!(current_time <= proposal.voting_end, "Voting period ended");
        assert!(
            proposal.status == symbol_short!("active"),
            "Proposal not active"
        );
        
        if support {
            proposal.yes_votes += voting_power;
        } else {
            proposal.no_votes += voting_power;
        }
        
        GovernanceStorageKey::set_proposal(&env, proposal_id, &proposal);
        GovernanceStorageKey::record_vote(&env, &voter, proposal_id);
        
        env.events().publish(
            (symbol_short!("vote"), symbol_short!("cast")),
            (proposal_id, voter, support),
        );
    }
    
    pub fn finalize_proposal(env: Env, proposal_id: u64) {
        let mut proposal = GovernanceStorageKey::get_proposal(&env, proposal_id)
            .expect("Proposal not found");
        
        let current_time = env.ledger().timestamp();
        assert!(current_time > proposal.voting_end, "Voting still active");
        assert!(
            proposal.status == symbol_short!("active"),
            "Already finalized"
        );
        
        let config = GovernanceStorageKey::get_config(&env).expect("Not initialized");
        let total_votes = proposal.yes_votes + proposal.no_votes;
        
        // Check quorum
        if total_votes >= config.quorum {
            if proposal.yes_votes > proposal.no_votes {
                proposal.status = symbol_short!("passed");
            } else {
                proposal.status = symbol_short!("rejected");
            }
        } else {
            proposal.status = symbol_short!("rejected");
        }
        
        GovernanceStorageKey::set_proposal(&env, proposal_id, &proposal);
        
        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("finalized")),
            (proposal_id, proposal.status),
        );
    }
    
    pub fn get_proposal(env: Env, proposal_id: u64) -> Option<Proposal> {
        GovernanceStorageKey::get_proposal(&env, proposal_id)
    }
    
    pub fn has_voted(env: Env, voter: Address, proposal_id: u64) -> bool {
        GovernanceStorageKey::has_voted(&env, &voter, proposal_id)
    }
}
