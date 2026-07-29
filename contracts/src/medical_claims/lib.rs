use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

/// Reconciliation status of a claim.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum ReconciliationStatus {
    Pending,
    PartiallyPaid,
    FullyReconciled,
    Disputed,
}

/// A medical claim submitted by a provider against an insurer.
#[contracttype]
#[derive(Clone)]
pub struct MedicalClaim {
    pub claim_id: u64,
    pub provider: Address,
    pub insurer: Address,
    pub claim_amount: i128,
    pub paid_amount: i128,
    pub outstanding: i128,
    pub status: ReconciliationStatus,
    pub submitted_at: u64,
}

// ── Storage helpers ──────────────────────────────────────────────────────────

fn claim_key(claim_id: u64) -> (Symbol, u64) {
    (symbol_short!("claim"), claim_id)
}

fn next_claim_key() -> Symbol {
    symbol_short!("nxt_clm")
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct MedicalClaimsContract;

#[contractimpl]
impl MedicalClaimsContract {
    /// Submit a new claim. Returns the assigned claim_id.
    pub fn submit_claim(
        env: Env,
        provider: Address,
        insurer: Address,
        claim_amount: i128,
        submitted_at: u64,
    ) -> u64 {
        provider.require_auth();
        assert!(claim_amount > 0, "claim_amount must be positive");

        let claim_id: u64 = env
            .storage()
            .instance()
            .get(&next_claim_key())
            .unwrap_or(1u64);
        env.storage()
            .instance()
            .set(&next_claim_key(), &(claim_id + 1));

        let claim = MedicalClaim {
            claim_id,
            provider,
            insurer,
            claim_amount,
            paid_amount: 0,
            outstanding: claim_amount,
            status: ReconciliationStatus::Pending,
            submitted_at,
        };
        env.storage().persistent().set(&claim_key(claim_id), &claim);
        claim_id
    }

    /// Apply a payment to a claim (called by reconcile_claim).
    ///
    /// Updates paid_amount, outstanding, and status atomically.
    /// Emits a `ClaimReconciled` event.
    pub fn reconcile_claim(
        env: Env,
        insurer: Address,
        claim_id: u64,
        payment_id: u64,
        payment_amount: i128,
    ) {
        insurer.require_auth();
        assert!(payment_amount > 0, "payment_amount must be positive");

        let mut claim: MedicalClaim = env
            .storage()
            .persistent()
            .get(&claim_key(claim_id))
            .expect("claim not found");

        if claim.insurer != insurer {
            panic!("unauthorized: not the claim insurer");
        }

        // Transactional update: both fields change together or neither does.
        claim.paid_amount += payment_amount;
        claim.outstanding = (claim.claim_amount - claim.paid_amount).max(0);
        claim.status = if claim.outstanding == 0 {
            ReconciliationStatus::FullyReconciled
        } else {
            ReconciliationStatus::PartiallyPaid
        };

        env.storage().persistent().set(&claim_key(claim_id), &claim);

        // Emit ClaimReconciled event.
        // topics = ["ClaimRecon", claim_id, payment_id]
        // data   = (claim_amount, payment_amount, outstanding)
        env.events().publish(
            (symbol_short!("ClaimRcn"), claim_id, payment_id),
            (claim.claim_amount, payment_amount, claim.outstanding),
        );
    }

    /// Mark a claim as Disputed.
    pub fn dispute_claim(env: Env, insurer: Address, claim_id: u64) {
        insurer.require_auth();
        let mut claim: MedicalClaim = env
            .storage()
            .persistent()
            .get(&claim_key(claim_id))
            .expect("claim not found");
        if claim.insurer != insurer {
            panic!("unauthorized");
        }
        claim.status = ReconciliationStatus::Disputed;
        env.storage().persistent().set(&claim_key(claim_id), &claim);
    }

    /// Return all unreconciled claims for an insurer that are older than
    /// `threshold_seconds` relative to `current_time`.
    pub fn get_unreconciled_claims(
        env: Env,
        insurer: Address,
        current_time: u64,
        threshold_seconds: u64,
    ) -> Vec<MedicalClaim> {
        let total: u64 = env
            .storage()
            .instance()
            .get(&next_claim_key())
            .unwrap_or(1u64);

        let mut result: Vec<MedicalClaim> = Vec::new(&env);
        for id in 1..total {
            if let Some(claim) = env
                .storage()
                .persistent()
                .get::<(Symbol, u64), MedicalClaim>(&claim_key(id))
            {
                let is_unreconciled = matches!(
                    claim.status,
                    ReconciliationStatus::Pending | ReconciliationStatus::PartiallyPaid
                );
                let is_old = current_time.saturating_sub(claim.submitted_at) >= threshold_seconds;
                if claim.insurer == insurer && is_unreconciled && is_old {
                    result.push_back(claim);
                }
            }
        }
        result
    }

    /// Retrieve a single claim by id.
    pub fn get_claim(env: Env, claim_id: u64) -> MedicalClaim {
        env.storage()
            .persistent()
            .get(&claim_key(claim_id))
            .expect("claim not found")
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, MedicalClaimsContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, MedicalClaimsContract);
        let client = MedicalClaimsContractClient::new(&env, &id);
        (env, client)
    }

    #[test]
    fn test_submit_and_full_reconciliation() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let insurer = Address::generate(&env);

        let claim_id = client.submit_claim(&provider, &insurer, &1000i128, &100u64);
        assert_eq!(claim_id, 1);

        client.reconcile_claim(&insurer, &claim_id, &42u64, &1000i128);

        let claim = client.get_claim(&claim_id);
        assert_eq!(claim.paid_amount, 1000);
        assert_eq!(claim.outstanding, 0);
        assert_eq!(claim.status, ReconciliationStatus::FullyReconciled);
    }

    #[test]
    fn test_partial_payment_tracking() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let insurer = Address::generate(&env);

        let claim_id = client.submit_claim(&provider, &insurer, &1000i128, &100u64);
        client.reconcile_claim(&insurer, &claim_id, &1u64, &400i128);

        let claim = client.get_claim(&claim_id);
        assert_eq!(claim.paid_amount, 400);
        assert_eq!(claim.outstanding, 600);
        assert_eq!(claim.status, ReconciliationStatus::PartiallyPaid);
    }

    #[test]
    fn test_get_unreconciled_claims() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let insurer = Address::generate(&env);

        // Two old pending claims, one recent, one fully reconciled.
        client.submit_claim(&provider, &insurer, &500i128, &100u64);
        client.submit_claim(&provider, &insurer, &300i128, &200u64);
        let recent_id = client.submit_claim(&provider, &insurer, &200i128, &900u64);
        let reconciled_id = client.submit_claim(&provider, &insurer, &100i128, &50u64);
        client.reconcile_claim(&insurer, &reconciled_id, &99u64, &100i128);

        let current_time = 1000u64;
        let threshold = 500u64; // older than 500s

        let unreconciled = client.get_unreconciled_claims(&insurer, &current_time, &threshold);
        // claim at t=100 (age 900) and t=200 (age 800) qualify; t=900 (age 100) does not.
        assert_eq!(unreconciled.len(), 2);
        let _ = recent_id; // suppress unused warning
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_wrong_insurer_cannot_reconcile() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let insurer = Address::generate(&env);
        let other = Address::generate(&env);

        let claim_id = client.submit_claim(&provider, &insurer, &500i128, &100u64);
        client.reconcile_claim(&other, &claim_id, &1u64, &500i128);
    }
}
