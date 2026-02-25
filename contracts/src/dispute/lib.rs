use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputePhase {
    Evidence,
    JurySelection,
    CommitVote,
    RevealVote,
    Appeal,
    Finalized,
}

#[contracttype]
#[derive(Clone)]
pub struct Dispute {
    pub dispute_id: u64,
    pub refund_request_id: u64,
    pub passenger: Address,
    pub airline: Address,
    pub amount: i128,
    pub passenger_stake: i128,
    pub airline_stake: i128,
    pub phase: DisputePhase,
    pub evidence_deadline: u64,
    pub voting_deadline: u64,
    pub reveal_deadline: u64,
    pub appeal_deadline: u64,
    pub passenger_evidence_count: u32,
    pub airline_evidence_count: u32,
    pub jury_size: u32,
    pub votes_for_passenger: u32,
    pub votes_for_airline: u32,
    pub verdict: Option<Symbol>,
    pub appealed: bool,
    pub created_at: u64,
    pub finalized_at: Option<u64>,
}

#[contracttype]
#[derive(Clone)]
pub struct Evidence {
    pub dispute_id: u64,
    pub submitter: Address,
    pub evidence_hash: BytesN<32>,
    pub description: Symbol,
    pub submitted_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct JurorSelection {
    pub dispute_id: u64,
    pub juror: Address,
    pub token_balance: i128,
    pub selected_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct VoteCommit {
    pub dispute_id: u64,
    pub juror: Address,
    pub commit_hash: BytesN<32>,
    pub committed_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct VoteReveal {
    pub dispute_id: u64,
    pub juror: Address,
    pub vote_for_passenger: bool,
    pub salt: BytesN<32>,
    pub revealed_at: u64,
}

#[contracttype]
pub struct DisputeConfig {
    pub min_stake_percentage: u32,
    pub jury_size: u32,
    pub evidence_period: u64,
    pub voting_period: u64,
    pub reveal_period: u64,
    pub appeal_period: u64,
    pub appeal_stake_multiplier: u32,
    pub jury_reward_pool_percentage: u32,
}

pub struct DisputeStorageKey;

impl DisputeStorageKey {
    pub fn get_dispute(env: &Env, dispute_id: u64) -> Option<Dispute> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("dispute"), dispute_id))
    }

    pub fn set_dispute(env: &Env, dispute_id: u64, dispute: &Dispute) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("dispute"), dispute_id), dispute);
    }

    pub fn get_dispute_count(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("d_count"))
            .unwrap_or(0)
    }

    pub fn set_dispute_count(env: &Env, count: u64) {
        env.storage()
            .instance()
            .set(&symbol_short!("d_count"), &count);
    }

    pub fn get_evidence(env: &Env, dispute_id: u64, index: u32) -> Option<Evidence> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("evidence"), dispute_id, index))
    }

    pub fn set_evidence(env: &Env, dispute_id: u64, index: u32, evidence: &Evidence) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("evidence"), dispute_id, index), evidence);
    }

    pub fn get_juror(env: &Env, dispute_id: u64, index: u32) -> Option<JurorSelection> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("juror"), dispute_id, index))
    }

    pub fn set_juror(env: &Env, dispute_id: u64, index: u32, juror: &JurorSelection) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("juror"), dispute_id, index), juror);
    }

    pub fn is_juror(env: &Env, dispute_id: u64, address: &Address) -> bool {
        env.storage()
            .persistent()
            .has(&(symbol_short!("is_juror"), dispute_id, address))
    }

    pub fn mark_as_juror(env: &Env, dispute_id: u64, address: &Address) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("is_juror"), dispute_id, address), &true);
    }

    pub fn get_vote_commit(env: &Env, dispute_id: u64, juror: &Address) -> Option<VoteCommit> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("v_commit"), dispute_id, juror))
    }

    pub fn set_vote_commit(env: &Env, dispute_id: u64, juror: &Address, commit: &VoteCommit) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("v_commit"), dispute_id, juror), commit);
    }

    pub fn get_vote_reveal(env: &Env, dispute_id: u64, juror: &Address) -> Option<VoteReveal> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("v_reveal"), dispute_id, juror))
    }

    pub fn set_vote_reveal(env: &Env, dispute_id: u64, juror: &Address, reveal: &VoteReveal) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("v_reveal"), dispute_id, juror), reveal);
    }

    pub fn get_config(env: &Env) -> Option<DisputeConfig> {
        env.storage().instance().get(&symbol_short!("config"))
    }

    pub fn set_config(env: &Env, config: &DisputeConfig) {
        env.storage()
            .instance()
            .set(&symbol_short!("config"), config);
    }

    pub fn get_stake(env: &Env, dispute_id: u64, party: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&(symbol_short!("stake"), dispute_id, party))
            .unwrap_or(0)
    }

    pub fn set_stake(env: &Env, dispute_id: u64, party: &Address, amount: i128) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("stake"), dispute_id, party), &amount);
    }
}

#[contract]
pub struct DisputeContract;

#[contractimpl]
impl DisputeContract {
    pub fn initialize(
        env: Env,
        min_stake_percentage: u32,
        jury_size: u32,
        evidence_period: u64,
        voting_period: u64,
        reveal_period: u64,
        appeal_period: u64,
        appeal_stake_multiplier: u32,
        jury_reward_pool_percentage: u32,
    ) {
        assert!(
            DisputeStorageKey::get_config(&env).is_none(),
            "Already initialized"
        );

        let config = DisputeConfig {
            min_stake_percentage,
            jury_size,
            evidence_period,
            voting_period,
            reveal_period,
            appeal_period,
            appeal_stake_multiplier,
            jury_reward_pool_percentage,
        };

        DisputeStorageKey::set_config(&env, &config);

        env.events()
            .publish((symbol_short!("dispute"), symbol_short!("init")), jury_size);
    }

    pub fn file_dispute(
        env: Env,
        passenger: Address,
        airline: Address,
        refund_request_id: u64,
        amount: i128,
        passenger_stake: i128,
    ) -> u64 {
        passenger.require_auth();

        let config = DisputeStorageKey::get_config(&env).expect("Contract not initialized");

        let min_stake = amount * config.min_stake_percentage as i128 / 10000;
        assert!(passenger_stake >= min_stake, "Insufficient stake");

        let dispute_count = DisputeStorageKey::get_dispute_count(&env);
        let dispute_id = dispute_count + 1;
        DisputeStorageKey::set_dispute_count(&env, dispute_id);

        let current_time = env.ledger().timestamp();

        let dispute = Dispute {
            dispute_id,
            refund_request_id,
            passenger: passenger.clone(),
            airline: airline.clone(),
            amount,
            passenger_stake,
            airline_stake: 0,
            phase: DisputePhase::Evidence,
            evidence_deadline: current_time + config.evidence_period,
            voting_deadline: current_time + config.evidence_period + config.voting_period,
            reveal_deadline: current_time
                + config.evidence_period
                + config.voting_period
                + config.reveal_period,
            appeal_deadline: current_time
                + config.evidence_period
                + config.voting_period
                + config.reveal_period
                + config.appeal_period,
            passenger_evidence_count: 0,
            airline_evidence_count: 0,
            jury_size: config.jury_size,
            votes_for_passenger: 0,
            votes_for_airline: 0,
            verdict: None,
            appealed: false,
            created_at: current_time,
            finalized_at: None,
        };

        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);
        DisputeStorageKey::set_stake(&env, dispute_id, &passenger, passenger_stake);

        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("filed")),
            (dispute_id, passenger, airline, amount),
        );

        dispute_id
    }

    pub fn airline_respond(env: Env, airline: Address, dispute_id: u64, airline_stake: i128) {
        airline.require_auth();

        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        assert!(dispute.airline == airline, "Not the airline in dispute");
        assert!(
            dispute.phase == DisputePhase::Evidence,
            "Evidence phase ended"
        );
        assert!(dispute.airline_stake == 0, "Already responded");

        let config = DisputeStorageKey::get_config(&env).expect("Not initialized");
        let min_stake = dispute.amount * config.min_stake_percentage as i128 / 10000;
        assert!(airline_stake >= min_stake, "Insufficient stake");

        dispute.airline_stake = airline_stake;
        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);
        DisputeStorageKey::set_stake(&env, dispute_id, &airline, airline_stake);

        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("responded")),
            (dispute_id, airline, airline_stake),
        );
    }

    pub fn submit_evidence(
        env: Env,
        submitter: Address,
        dispute_id: u64,
        evidence_hash: BytesN<32>,
        description: Symbol,
    ) {
        submitter.require_auth();

        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();
        assert!(
            current_time <= dispute.evidence_deadline,
            "Evidence period ended"
        );
        assert!(
            dispute.phase == DisputePhase::Evidence,
            "Not in evidence phase"
        );

        let is_passenger = submitter == dispute.passenger;
        let is_airline = submitter == dispute.airline;
        assert!(is_passenger || is_airline, "Not a party to dispute");

        let evidence_index = if is_passenger {
            dispute.passenger_evidence_count += 1;
            dispute.passenger_evidence_count - 1
        } else {
            dispute.airline_evidence_count += 1;
            dispute.airline_evidence_count - 1
        };

        let evidence = Evidence {
            dispute_id,
            submitter: submitter.clone(),
            evidence_hash: evidence_hash.clone(),
            description,
            submitted_at: current_time,
        };

        DisputeStorageKey::set_evidence(&env, dispute_id, evidence_index, &evidence);
        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);

        env.events().publish(
            (symbol_short!("evidence"), symbol_short!("submitted")),
            (dispute_id, submitter, evidence.evidence_hash.clone()),
        );
    }

    pub fn select_as_juror(env: Env, juror: Address, dispute_id: u64, token_balance: i128) {
        juror.require_auth();

        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();

        if current_time > dispute.evidence_deadline && dispute.phase == DisputePhase::Evidence {
            dispute.phase = DisputePhase::JurySelection;
            DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);
        }

        assert!(
            dispute.phase == DisputePhase::JurySelection
                || dispute.phase == DisputePhase::CommitVote,
            "Not in jury selection phase"
        );
        assert!(token_balance > 0, "Must hold TRQ tokens");
        assert!(
            !DisputeStorageKey::is_juror(&env, dispute_id, &juror),
            "Already selected"
        );
        assert!(
            juror != dispute.passenger && juror != dispute.airline,
            "Parties cannot be jurors"
        );

        let juror_count = Self::get_juror_count(env.clone(), dispute_id);
        assert!(juror_count < dispute.jury_size, "Jury full");

        let selection = JurorSelection {
            dispute_id,
            juror: juror.clone(),
            token_balance,
            selected_at: current_time,
        };

        DisputeStorageKey::set_juror(&env, dispute_id, juror_count, &selection);
        DisputeStorageKey::mark_as_juror(&env, dispute_id, &juror);

        if juror_count + 1 >= dispute.jury_size {
            dispute.phase = DisputePhase::CommitVote;
            DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);
        }

        env.events().publish(
            (symbol_short!("juror"), symbol_short!("selected")),
            (dispute_id, juror, token_balance),
        );
    }

    pub fn commit_vote(env: Env, juror: Address, dispute_id: u64, commit_hash: BytesN<32>) {
        juror.require_auth();

        let dispute = DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();
        assert!(
            current_time <= dispute.voting_deadline,
            "Voting period ended"
        );
        assert!(
            dispute.phase == DisputePhase::CommitVote,
            "Not in commit phase"
        );
        assert!(
            DisputeStorageKey::is_juror(&env, dispute_id, &juror),
            "Not a juror"
        );
        assert!(
            DisputeStorageKey::get_vote_commit(&env, dispute_id, &juror).is_none(),
            "Already committed"
        );

        let commit = VoteCommit {
            dispute_id,
            juror: juror.clone(),
            commit_hash,
            committed_at: current_time,
        };

        DisputeStorageKey::set_vote_commit(&env, dispute_id, &juror, &commit);

        env.events().publish(
            (symbol_short!("vote"), symbol_short!("committed")),
            (dispute_id, juror),
        );
    }

    pub fn advance_to_reveal(env: Env, dispute_id: u64) {
        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();
        assert!(
            current_time > dispute.voting_deadline,
            "Voting period not ended"
        );
        assert!(
            dispute.phase == DisputePhase::CommitVote,
            "Not in commit phase"
        );

        dispute.phase = DisputePhase::RevealVote;
        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);

        env.events().publish(
            (symbol_short!("phase"), symbol_short!("reveal")),
            dispute_id,
        );
    }

    pub fn reveal_vote(
        env: Env,
        juror: Address,
        dispute_id: u64,
        vote_for_passenger: bool,
        salt: BytesN<32>,
    ) {
        juror.require_auth();

        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();
        assert!(
            current_time <= dispute.reveal_deadline,
            "Reveal period ended"
        );
        assert!(
            dispute.phase == DisputePhase::RevealVote,
            "Not in reveal phase"
        );

        let commit =
            DisputeStorageKey::get_vote_commit(&env, dispute_id, &juror).expect("No commit found");

        assert!(
            DisputeStorageKey::get_vote_reveal(&env, dispute_id, &juror).is_none(),
            "Already revealed"
        );

        // Build hash input - vote (1 byte) + salt (32 bytes) = 33 bytes
        let mut hash_bytes = Bytes::new(&env);
        hash_bytes.push_back(if vote_for_passenger { 1u8 } else { 0u8 });
        let salt_bytes = salt.to_array();
        for byte in salt_bytes.iter() {
            hash_bytes.push_back(*byte);
        }

        let computed_hash: BytesN<32> = env.crypto().keccak256(&hash_bytes).into();
        assert!(computed_hash == commit.commit_hash, "Invalid reveal");

        let reveal = VoteReveal {
            dispute_id,
            juror: juror.clone(),
            vote_for_passenger,
            salt,
            revealed_at: current_time,
        };

        DisputeStorageKey::set_vote_reveal(&env, dispute_id, &juror, &reveal);

        if vote_for_passenger {
            dispute.votes_for_passenger += 1;
        } else {
            dispute.votes_for_airline += 1;
        }

        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);

        env.events().publish(
            (symbol_short!("vote"), symbol_short!("revealed")),
            (dispute_id, juror, vote_for_passenger),
        );
    }

    pub fn finalize_dispute(env: Env, dispute_id: u64) {
        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();
        assert!(
            current_time > dispute.reveal_deadline,
            "Reveal period not ended"
        );
        assert!(
            dispute.phase == DisputePhase::RevealVote,
            "Not in reveal phase"
        );

        let total_votes = dispute.votes_for_passenger + dispute.votes_for_airline;
        assert!(total_votes > 0, "No votes revealed");

        let verdict = if dispute.votes_for_passenger > dispute.votes_for_airline {
            symbol_short!("passenger")
        } else if dispute.votes_for_airline > dispute.votes_for_passenger {
            symbol_short!("airline")
        } else {
            symbol_short!("tie")
        };

        dispute.verdict = Some(verdict.clone());
        dispute.phase = DisputePhase::Appeal;
        dispute.finalized_at = Some(current_time);

        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);

        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("finalized")),
            (dispute_id, verdict),
        );
    }

    pub fn file_appeal(env: Env, appellant: Address, dispute_id: u64, appeal_stake: i128) {
        appellant.require_auth();

        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();
        assert!(
            current_time <= dispute.appeal_deadline,
            "Appeal period ended"
        );
        assert!(dispute.phase == DisputePhase::Appeal, "Not in appeal phase");
        assert!(!dispute.appealed, "Already appealed");

        let verdict = dispute.verdict.clone().expect("No verdict");
        let is_losing_party = (verdict == symbol_short!("airline")
            && appellant == dispute.passenger)
            || (verdict == symbol_short!("passenger") && appellant == dispute.airline);

        assert!(is_losing_party, "Only losing party can appeal");

        let config = DisputeStorageKey::get_config(&env).expect("Not initialized");
        let required_stake = dispute.amount * config.appeal_stake_multiplier as i128 / 10000;
        assert!(appeal_stake >= required_stake, "Insufficient appeal stake");

        dispute.appealed = true;
        dispute.phase = DisputePhase::Evidence;

        let new_evidence_deadline = current_time + config.evidence_period;
        dispute.evidence_deadline = new_evidence_deadline;
        dispute.voting_deadline = new_evidence_deadline + config.voting_period;
        dispute.reveal_deadline =
            new_evidence_deadline + config.voting_period + config.reveal_period;
        dispute.appeal_deadline = new_evidence_deadline
            + config.voting_period
            + config.reveal_period
            + config.appeal_period;

        dispute.votes_for_passenger = 0;
        dispute.votes_for_airline = 0;
        dispute.verdict = None;

        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);

        let current_stake = DisputeStorageKey::get_stake(&env, dispute_id, &appellant);
        DisputeStorageKey::set_stake(&env, dispute_id, &appellant, current_stake + appeal_stake);

        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("appealed")),
            (dispute_id, appellant, appeal_stake),
        );
    }

    pub fn execute_verdict(env: Env, dispute_id: u64) {
        let mut dispute =
            DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let current_time = env.ledger().timestamp();

        if dispute.phase == DisputePhase::Appeal {
            assert!(
                current_time > dispute.appeal_deadline,
                "Appeal period not ended"
            );
        }

        let verdict = dispute.verdict.clone().expect("No verdict");
        assert!(
            verdict != symbol_short!("tie"),
            "Cannot execute tie verdict"
        );

        dispute.phase = DisputePhase::Finalized;
        DisputeStorageKey::set_dispute(&env, dispute_id, &dispute);

        let config = DisputeStorageKey::get_config(&env).expect("Not initialized");
        let total_stake_pool = dispute.passenger_stake + dispute.airline_stake;
        let jury_reward_pool =
            total_stake_pool * config.jury_reward_pool_percentage as i128 / 10000;

        let (winner, loser) = if verdict == symbol_short!("passenger") {
            (dispute.passenger.clone(), dispute.airline.clone())
        } else {
            (dispute.airline.clone(), dispute.passenger.clone())
        };

        env.events().publish(
            (symbol_short!("verdict"), symbol_short!("executed")),
            (dispute_id, winner, loser, dispute.amount, jury_reward_pool),
        );
    }

    pub fn claim_juror_reward(env: Env, juror: Address, dispute_id: u64) -> i128 {
        juror.require_auth();

        let dispute = DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        assert!(
            dispute.phase == DisputePhase::Finalized,
            "Dispute not finalized"
        );

        let reveal =
            DisputeStorageKey::get_vote_reveal(&env, dispute_id, &juror).expect("No vote revealed");

        let verdict = dispute.verdict.clone().expect("No verdict");

        let voted_correctly = (verdict == symbol_short!("passenger") && reveal.vote_for_passenger)
            || (verdict == symbol_short!("airline") && !reveal.vote_for_passenger);

        assert!(voted_correctly, "Did not vote with majority");

        let config = DisputeStorageKey::get_config(&env).expect("Not initialized");
        let total_stake_pool = dispute.passenger_stake + dispute.airline_stake;
        let jury_reward_pool =
            total_stake_pool * config.jury_reward_pool_percentage as i128 / 10000;

        let winning_votes = if verdict == symbol_short!("passenger") {
            dispute.votes_for_passenger
        } else {
            dispute.votes_for_airline
        };

        let reward = jury_reward_pool / winning_votes as i128;

        env.events().publish(
            (symbol_short!("reward"), symbol_short!("claimed")),
            (dispute_id, juror.clone(), reward),
        );

        reward
    }

    pub fn get_dispute(env: Env, dispute_id: u64) -> Option<Dispute> {
        DisputeStorageKey::get_dispute(&env, dispute_id)
    }

    pub fn get_evidence(env: Env, dispute_id: u64, index: u32) -> Option<Evidence> {
        DisputeStorageKey::get_evidence(&env, dispute_id, index)
    }

    pub fn get_juror(env: Env, dispute_id: u64, index: u32) -> Option<JurorSelection> {
        DisputeStorageKey::get_juror(&env, dispute_id, index)
    }

    pub fn get_juror_count(env: Env, dispute_id: u64) -> u32 {
        let dispute = DisputeStorageKey::get_dispute(&env, dispute_id).expect("Dispute not found");

        let mut count = 0u32;
        while count < dispute.jury_size {
            if DisputeStorageKey::get_juror(&env, dispute_id, count).is_none() {
                break;
            }
            count += 1;
        }
        count
    }

    pub fn is_juror(env: Env, dispute_id: u64, address: Address) -> bool {
        DisputeStorageKey::is_juror(&env, dispute_id, &address)
    }

    pub fn get_vote_commit(env: Env, dispute_id: u64, juror: Address) -> Option<VoteCommit> {
        DisputeStorageKey::get_vote_commit(&env, dispute_id, &juror)
    }

    pub fn get_vote_reveal(env: Env, dispute_id: u64, juror: Address) -> Option<VoteReveal> {
        DisputeStorageKey::get_vote_reveal(&env, dispute_id, &juror)
    }

    pub fn get_dispute_count(env: Env) -> u64 {
        DisputeStorageKey::get_dispute_count(&env)
    }

    pub fn get_config(env: Env) -> Option<DisputeConfig> {
        DisputeStorageKey::get_config(&env)
    }
}
