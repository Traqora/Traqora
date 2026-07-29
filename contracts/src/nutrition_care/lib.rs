use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

/// A single outcome measurement linked to a care plan version.
#[contracttype]
#[derive(Clone)]
pub struct Outcome {
    pub plan_id: u64,
    pub plan_version: u32,
    pub metric: Symbol,  // e.g. symbol_short!("weight"), symbol_short!("hba1c")
    pub value: i128,     // scaled integer (e.g. milligrams, grams×100)
    pub measured_at: u64,
}

/// Minimal care plan record (version tracking only).
#[contracttype]
#[derive(Clone)]
pub struct CarePlan {
    pub plan_id: u64,
    pub patient: Address,
    pub provider: Address,
    pub version: u32,
}

// ── Storage keys ────────────────────────────────────────────────────────────

fn plan_key(plan_id: u64) -> (Symbol, u64) {
    (symbol_short!("plan"), plan_id)
}

fn outcomes_key(plan_id: u64) -> (Symbol, u64) {
    (symbol_short!("outcomes"), plan_id)
}

fn next_plan_key() -> Symbol {
    symbol_short!("next_plan")
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct NutritionCareContract;

#[contractimpl]
impl NutritionCareContract {
    /// Create a new care plan. Returns the assigned plan_id.
    pub fn create_plan(env: Env, provider: Address, patient: Address) -> u64 {
        provider.require_auth();
        let plan_id: u64 = env
            .storage()
            .instance()
            .get(&next_plan_key())
            .unwrap_or(1u64);
        env.storage()
            .instance()
            .set(&next_plan_key(), &(plan_id + 1));

        let plan = CarePlan {
            plan_id,
            patient,
            provider,
            version: 1,
        };
        env.storage().persistent().set(&plan_key(plan_id), &plan);
        plan_id
    }

    /// Record a clinical outcome linked to the current version of a care plan.
    ///
    /// Only the provider who owns the plan may call this.
    /// Emits a `NutritionOutcomeRecorded` event.
    pub fn link_outcome(
        env: Env,
        provider: Address,
        plan_id: u64,
        metric: Symbol,
        value: i128,
        measured_at: u64,
    ) {
        provider.require_auth();

        let plan: CarePlan = env
            .storage()
            .persistent()
            .get(&plan_key(plan_id))
            .expect("plan not found");

        // Only the plan's provider may record outcomes.
        if plan.provider != provider {
            panic!("unauthorized: not the plan provider");
        }

        let outcome = Outcome {
            plan_id,
            plan_version: plan.version,
            metric: metric.clone(),
            value,
            measured_at,
        };

        // Append to the outcomes list for this plan.
        let mut outcomes: Vec<Outcome> = env
            .storage()
            .persistent()
            .get(&outcomes_key(plan_id))
            .unwrap_or_else(|| Vec::new(&env));
        outcomes.push_back(outcome);
        env.storage()
            .persistent()
            .set(&outcomes_key(plan_id), &outcomes);

        // Emit event: topics = ["NutrOutcome", plan_id], data = (metric, value, measured_at)
        env.events().publish(
            (symbol_short!("NutrOut"), plan_id),
            (metric, value, measured_at),
        );
    }

    /// Return all outcome measurements for a plan, in chronological order
    /// (outcomes are appended in order, so the stored Vec is already sorted).
    pub fn get_plan_outcomes(env: Env, plan_id: u64) -> Vec<Outcome> {
        env.storage()
            .persistent()
            .get(&outcomes_key(plan_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Retrieve a care plan by id.
    pub fn get_plan(env: Env, plan_id: u64) -> CarePlan {
        env.storage()
            .persistent()
            .get(&plan_key(plan_id))
            .expect("plan not found")
    }

    /// Bump the plan version (e.g. when the dietary prescription changes).
    /// Only the plan's provider may do this.
    pub fn update_plan_version(env: Env, provider: Address, plan_id: u64) {
        provider.require_auth();
        let mut plan: CarePlan = env
            .storage()
            .persistent()
            .get(&plan_key(plan_id))
            .expect("plan not found");
        if plan.provider != provider {
            panic!("unauthorized: not the plan provider");
        }
        plan.version += 1;
        env.storage().persistent().set(&plan_key(plan_id), &plan);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, NutritionCareContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, NutritionCareContract);
        let client = NutritionCareContractClient::new(&env, &contract_id);
        (env, client)
    }

    #[test]
    fn test_create_plan_and_link_outcome() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let patient = Address::generate(&env);

        let plan_id = client.create_plan(&provider, &patient);
        assert_eq!(plan_id, 1);

        client.link_outcome(
            &provider,
            &plan_id,
            &symbol_short!("weight"),
            &7500i128, // 75.00 kg × 100
            &1_000_000u64,
        );

        let outcomes = client.get_plan_outcomes(&plan_id);
        assert_eq!(outcomes.len(), 1);
        let o = outcomes.get(0).unwrap();
        assert_eq!(o.metric, symbol_short!("weight"));
        assert_eq!(o.value, 7500);
        assert_eq!(o.plan_version, 1);
    }

    #[test]
    fn test_outcomes_linked_to_plan_version() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let patient = Address::generate(&env);

        let plan_id = client.create_plan(&provider, &patient);

        client.link_outcome(&provider, &plan_id, &symbol_short!("hba1c"), &65i128, &100u64);
        client.update_plan_version(&provider, &plan_id);
        client.link_outcome(&provider, &plan_id, &symbol_short!("hba1c"), &58i128, &200u64);

        let outcomes = client.get_plan_outcomes(&plan_id);
        assert_eq!(outcomes.len(), 2);
        assert_eq!(outcomes.get(0).unwrap().plan_version, 1);
        assert_eq!(outcomes.get(1).unwrap().plan_version, 2);
    }

    #[test]
    fn test_chronological_order() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let patient = Address::generate(&env);
        let plan_id = client.create_plan(&provider, &patient);

        for t in [100u64, 200, 300] {
            client.link_outcome(&provider, &plan_id, &symbol_short!("weight"), &(t as i128), &t);
        }

        let outcomes = client.get_plan_outcomes(&plan_id);
        assert_eq!(outcomes.len(), 3);
        assert!(outcomes.get(0).unwrap().measured_at < outcomes.get(1).unwrap().measured_at);
        assert!(outcomes.get(1).unwrap().measured_at < outcomes.get(2).unwrap().measured_at);
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_wrong_provider_cannot_record() {
        let (env, client) = setup();
        let provider = Address::generate(&env);
        let other = Address::generate(&env);
        let patient = Address::generate(&env);
        let plan_id = client.create_plan(&provider, &patient);
        client.link_outcome(&other, &plan_id, &symbol_short!("weight"), &100i128, &1u64);
    }
}
