use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Symbol, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    pub booking_id: Symbol,
    pub token: Address,
    pub amount: i128,
    pub released: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct Dispute {
    pub dispute_id: u32,
    pub booking_id: Symbol,
    pub claimant: Address,
    pub claimant_evidence_hash: BytesN<32>,
    pub respondent: Option<Address>,
    pub respondent_evidence_hash: Option<BytesN<32>>,
    pub resolved: bool,
    pub ruling_for_claimant: Option<bool>,
    pub winner: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Arbiter(Address),
    NextDisputeId,
    Escrow(Symbol),
    Dispute(u32),
    BookingToDispute(Symbol),
}

#[contract]
pub struct DisputeResolutionContract;

#[contractimpl]
impl DisputeResolutionContract {
    pub fn initialize(env: Env, admin: Address, arbiters: Vec<Address>) {
        assert!(
            env.storage().instance().get::<_, Address>(&DataKey::Admin).is_none(),
            "Already initialized"
        );

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextDisputeId, &1u32);

        let mut i = 0u32;
        while i < arbiters.len() {
            let arbiter = arbiters.get(i).unwrap();
            env.storage()
                .persistent()
                .set(&DataKey::Arbiter(arbiter), &true);
            i += 1;
        }
    }

    pub fn set_arbiter(env: Env, admin: Address, arbiter: Address, enabled: bool) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(stored_admin == admin, "Not admin");
        env.storage()
            .persistent()
            .set(&DataKey::Arbiter(arbiter), &enabled);
    }

    pub fn deposit_escrow(
        env: Env,
        booking_id: Symbol,
        depositor: Address,
        token_address: Address,
        amount: i128,
    ) {
        depositor.require_auth();
        assert!(amount > 0, "Invalid amount");
        assert!(
            env.storage()
                .persistent()
                .get::<_, Escrow>(&DataKey::Escrow(booking_id.clone()))
                .is_none(),
            "Escrow already exists"
        );

        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            booking_id: booking_id.clone(),
            token: token_address,
            amount,
            released: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(booking_id), &escrow);
    }

    pub fn open_dispute(
        env: Env,
        booking_id: Symbol,
        claimant: Address,
        evidence_hash: BytesN<32>,
    ) -> u32 {
        claimant.require_auth();
        assert!(
            env.storage()
                .persistent()
                .get::<_, u32>(&DataKey::BookingToDispute(booking_id.clone()))
                .is_none(),
            "Dispute already exists"
        );

        let escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(booking_id.clone()))
            .expect("Escrow not found");
        assert!(!escrow.released, "Escrow already released");
        assert!(escrow.amount > 0, "No escrow balance");

        let dispute_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextDisputeId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextDisputeId, &(dispute_id + 1));

        let dispute = Dispute {
            dispute_id,
            booking_id: booking_id.clone(),
            claimant: claimant.clone(),
            claimant_evidence_hash: evidence_hash,
            respondent: None,
            respondent_evidence_hash: None,
            resolved: false,
            ruling_for_claimant: None,
            winner: None,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        env.storage()
            .persistent()
            .set(&DataKey::BookingToDispute(booking_id), &dispute_id);

        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("opened")),
            (dispute_id, claimant),
        );

        dispute_id
    }

    pub fn submit_counter_evidence(
        env: Env,
        dispute_id: u32,
        respondent: Address,
        hash: BytesN<32>,
    ) {
        respondent.require_auth();
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .expect("Dispute not found");
        assert!(!dispute.resolved, "Dispute already resolved");
        assert!(dispute.claimant != respondent, "Claimant cannot be respondent");
        assert!(
            dispute.respondent_evidence_hash.is_none(),
            "Counter evidence already submitted"
        );

        if let Some(existing_respondent) = dispute.respondent.clone() {
            assert!(existing_respondent == respondent, "Invalid respondent");
        } else {
            dispute.respondent = Some(respondent.clone());
        }
        dispute.respondent_evidence_hash = Some(hash);

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);
        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("counter")),
            (dispute_id, respondent),
        );
    }

    pub fn resolve_dispute(env: Env, dispute_id: u32, arbiter: Address, ruling: bool) {
        arbiter.require_auth();
        assert!(Self::is_arbiter(env.clone(), arbiter.clone()), "Not authorized arbiter");

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .expect("Dispute not found");
        assert!(!dispute.resolved, "Dispute already resolved");

        let winner = if ruling {
            dispute.claimant.clone()
        } else {
            dispute
                .respondent
                .clone()
                .expect("Respondent must submit counter evidence")
        };

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(dispute.booking_id.clone()))
            .expect("Escrow not found");
        assert!(!escrow.released, "Escrow already released");
        assert!(escrow.amount > 0, "No escrow balance");

        let payout_amount = escrow.amount;
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &winner, &payout_amount);

        escrow.amount = 0;
        escrow.released = true;
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(dispute.booking_id.clone()), &escrow);

        dispute.resolved = true;
        dispute.ruling_for_claimant = Some(ruling);
        dispute.winner = Some(winner.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);

        env.events().publish(
            (symbol_short!("dispute"), symbol_short!("resolved")),
            (dispute_id, arbiter, winner, payout_amount),
        );
    }

    pub fn is_arbiter(env: Env, arbiter: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Arbiter(arbiter))
            .unwrap_or(false)
    }

    pub fn get_dispute(env: Env, dispute_id: u32) -> Option<Dispute> {
        env.storage().persistent().get(&DataKey::Dispute(dispute_id))
    }

    pub fn get_escrow(env: Env, booking_id: Symbol) -> Option<Escrow> {
        env.storage().persistent().get(&DataKey::Escrow(booking_id))
    }
}
