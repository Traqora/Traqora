use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};
use crate::access::{AccessControl, Role};

/// On-chain governance proposal: one vote per address per proposal (1 token-holder = 1 vote).
#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub id: u32,
    pub creator: Address,
    pub description: Symbol,
    pub vote_deadline: u64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub status: Symbol,
}

#[contracttype]
pub struct GovernanceConfig {
    /// Length of the voting window for new proposals (seconds).
    pub voting_period_secs: u64,
}

pub struct GovernanceStorageKey;

impl GovernanceStorageKey {
    pub fn get_proposal(env: &Env, proposal_id: u32) -> Option<Proposal> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("proposal"), proposal_id))
    }

    pub fn set_proposal(env: &Env, proposal_id: u32, proposal: &Proposal) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("proposal"), proposal_id), proposal);
    }

    pub fn has_voted(env: &Env, voter: &Address, proposal_id: u32) -> bool {
        env.storage()
            .persistent()
            .has(&(symbol_short!("vote"), voter, proposal_id))
    }

    pub fn record_vote(env: &Env, voter: &Address, proposal_id: u32) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("vote"), voter, proposal_id), &true);
    }

    pub fn get_config(env: &Env) -> Option<GovernanceConfig> {
        env.storage().instance().get(&symbol_short!("config"))
    }

    pub fn set_config(env: &Env, config: &GovernanceConfig) {
        env.storage()
            .instance()
            .set(&symbol_short!("config"), config);
    }

    pub fn get_proposal_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("p_count"))
            .unwrap_or(0)
    }

    pub fn set_proposal_count(env: &Env, count: u32) {
        env.storage()
            .instance()
            .set(&symbol_short!("p_count"), &count);
    }
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialize governance with a fixed voting duration for all proposals and an owner.
    pub fn init_governance(env: Env, owner: Address, voting_period_secs: u64) {
        assert!(voting_period_secs > 0, "Invalid voting period");
        assert!(
            GovernanceStorageKey::get_config(&env).is_none(),
            "Already initialized"
        );
        
        AccessControl::init_owner(&env, &owner);
        
        GovernanceStorageKey::set_config(
            &env,
            &GovernanceConfig {
                voting_period_secs,
            },
        );
    }

    /// Create a proposal; voting runs until `vote_deadline` (now + configured period).
    pub fn create_proposal(env: Env, creator: Address, description: Symbol) -> u32 {
        creator.require_auth();

        let config = GovernanceStorageKey::get_config(&env).expect("Not initialized");

        let count = GovernanceStorageKey::get_proposal_count(&env);
        let id = count
            .checked_add(1)
            .expect("Proposal id overflow");
        GovernanceStorageKey::set_proposal_count(&env, id);

        let now = env.ledger().timestamp();
        let vote_deadline = now.saturating_add(config.voting_period_secs);

        let proposal = Proposal {
            id,
            creator: creator.clone(),
            description: description.clone(),
            vote_deadline,
            yes_votes: 0,
            no_votes: 0,
            status: Symbol::new(&env, "open"),
        };

        GovernanceStorageKey::set_proposal(&env, id, &proposal);

        env.events()
            .publish((symbol_short!("proposal"), symbol_short!("created")), id);

        id
    }

    /// Cast a single vote (yes/no). Each address may vote at most once per proposal.
    pub fn cast_vote(env: Env, voter: Address, proposal_id: u32, support: bool) {
        voter.require_auth();

        assert!(
            !GovernanceStorageKey::has_voted(&env, &voter, proposal_id),
            "Already voted"
        );

        let mut proposal =
            GovernanceStorageKey::get_proposal(&env, proposal_id).expect("Proposal not found");

        assert!(
            proposal.status == Symbol::new(&env, "open"),
            "Proposal not open"
        );

        let now = env.ledger().timestamp();
        assert!(now <= proposal.vote_deadline, "Voting period ended");

        if support {
            proposal.yes_votes = proposal.yes_votes.saturating_add(1);
        } else {
            proposal.no_votes = proposal.no_votes.saturating_add(1);
        }

        GovernanceStorageKey::set_proposal(&env, proposal_id, &proposal);
        GovernanceStorageKey::record_vote(&env, &voter, proposal_id);

        env.events().publish(
            (symbol_short!("vote"), symbol_short!("cast")),
            (proposal_id, voter, support),
        );
    }

    /// Close voting after the deadline and record outcome.
    /// Only an admin can execute the outcome.
    pub fn execute_proposal(env: Env, executor: Address, proposal_id: u32) {
        AccessControl::require_admin(&env, &executor);

        let mut proposal =
            GovernanceStorageKey::get_proposal(&env, proposal_id).expect("Proposal not found");

        assert!(
            proposal.status == Symbol::new(&env, "open"),
            "Proposal not open"
        );

        let now = env.ledger().timestamp();
        assert!(now > proposal.vote_deadline, "Voting still active");

        proposal.status = if proposal.yes_votes > proposal.no_votes {
            Symbol::new(&env, "passed")
        } else {
            Symbol::new(&env, "rejected")
        };

        GovernanceStorageKey::set_proposal(&env, proposal_id, &proposal);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("executed")),
            (proposal_id, proposal.status.clone()),
        );
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

    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal> {
        GovernanceStorageKey::get_proposal(&env, proposal_id)
    }

    pub fn has_voted(env: Env, voter: Address, proposal_id: u32) -> bool {
        GovernanceStorageKey::has_voted(&env, &voter, proposal_id)
    }

    pub fn get_proposal_count(env: Env) -> u32 {
        GovernanceStorageKey::get_proposal_count(&env)
    }
}
