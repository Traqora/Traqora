#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, Env};

    #[test]
    fn test_governance_quorum_and_config() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(GovernanceContract, ());
        let client = GovernanceContractClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        client.init_governance(&owner, &86400);

        let config = GovernanceStorageKey::get_config(&env).unwrap();
        assert_eq!(config.voting_period_secs, 86400);
        assert_eq!(config.quorum, 0);

        // Update config with quorum
        client.set_config(&owner, &3600, &5);
        let updated_config = GovernanceStorageKey::get_config(&env).unwrap();
        assert_eq!(updated_config.voting_period_secs, 3600);
        assert_eq!(updated_config.quorum, 5);
    }
}
