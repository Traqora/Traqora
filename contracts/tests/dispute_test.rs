#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, BytesN, Env, Symbol,
};

mod dispute {
    soroban_sdk::contractimport!(
        file = "../target/wasm32-unknown-unknown/release/traqora_contracts.wasm"
    );
}

fn create_dispute_contract(env: &Env) -> Address {
    env.register_contract(None, dispute::Contract)
}

fn advance_ledger(env: &Env, seconds: u64) {
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + seconds,
        protocol_version: 20,
        sequence_number: env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });
}

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(
        &2000,  // min_stake_percentage (20%)
        &5,     // jury_size
        &86400, // evidence_period (1 day)
        &86400, // voting_period (1 day)
        &86400, // reveal_period (1 day)
        &86400, // appeal_period (1 day)
        &5000,  // appeal_stake_multiplier (50%)
        &2000,  // jury_reward_pool_percentage (20%)
    );
    
    let config = client.get_config();
    assert!(config.is_some());
    assert_eq!(config.unwrap().jury_size, 5);
}

#[test]
fn test_file_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &5, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(
        &passenger,
        &airline,
        &1,      // refund_request_id
        &10000,  // amount
        &2000,   // passenger_stake (20% of amount)
    );
    
    assert_eq!(dispute_id, 1);
    
    let dispute = client.get_dispute(&dispute_id);
    assert!(dispute.is_some());
    
    let dispute = dispute.unwrap();
    assert_eq!(dispute.passenger, passenger);
    assert_eq!(dispute.airline, airline);
    assert_eq!(dispute.amount, 10000);
    assert_eq!(dispute.passenger_stake, 2000);
}

#[test]
#[should_panic(expected = "Insufficient stake")]
fn test_file_dispute_insufficient_stake() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &5, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    client.file_dispute(
        &passenger,
        &airline,
        &1,
        &10000,
        &1000, // Only 10%, need 20%
    );
}

#[test]
fn test_airline_respond() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &5, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    
    client.airline_respond(&airline, &dispute_id, &2000);
    
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute.airline_stake, 2000);
}

#[test]
fn test_submit_evidence() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &5, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    let evidence_hash = BytesN::from_array(&env, &[1u8; 32]);
    let description = Symbol::new(&env, "flight_delay");
    
    client.submit_evidence(&passenger, &dispute_id, &evidence_hash, &description);
    
    let evidence = client.get_evidence(&dispute_id, &0);
    assert!(evidence.is_some());
    
    let evidence = evidence.unwrap();
    assert_eq!(evidence.submitter, passenger);
    assert_eq!(evidence.evidence_hash, evidence_hash);
}

#[test]
fn test_jury_selection() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    assert!(client.is_juror(&dispute_id, &juror1));
    assert!(client.is_juror(&dispute_id, &juror2));
    assert!(client.is_juror(&dispute_id, &juror3));
    
    let juror_count = client.get_juror_count(&dispute_id);
    assert_eq!(juror_count, 3);
}

#[test]
#[should_panic(expected = "Parties cannot be jurors")]
fn test_party_cannot_be_juror() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    
    advance_ledger(&env, 86401);
    
    client.select_as_juror(&passenger, &dispute_id, &1000);
}

#[test]
fn test_commit_reveal_voting() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    let salt1 = BytesN::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::from_array(&env, &[2u8; 32]);
    let salt3 = BytesN::from_array(&env, &[3u8; 32]);
    
    let commit_hash1 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt1.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash2 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt2.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash3 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt3.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    client.commit_vote(&juror1, &dispute_id, &commit_hash1);
    client.commit_vote(&juror2, &dispute_id, &commit_hash2);
    client.commit_vote(&juror3, &dispute_id, &commit_hash3);
    
    advance_ledger(&env, 86401);
    
    client.advance_to_reveal(&dispute_id);
    
    client.reveal_vote(&juror1, &dispute_id, &true, &salt1);
    client.reveal_vote(&juror2, &dispute_id, &true, &salt2);
    client.reveal_vote(&juror3, &dispute_id, &false, &salt3);
    
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute.votes_for_passenger, 2);
    assert_eq!(dispute.votes_for_airline, 1);
}

#[test]
fn test_finalize_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    let salt1 = BytesN::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::from_array(&env, &[2u8; 32]);
    let salt3 = BytesN::from_array(&env, &[3u8; 32]);
    
    let commit_hash1 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt1.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash2 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt2.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash3 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt3.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    client.commit_vote(&juror1, &dispute_id, &commit_hash1);
    client.commit_vote(&juror2, &dispute_id, &commit_hash2);
    client.commit_vote(&juror3, &dispute_id, &commit_hash3);
    
    advance_ledger(&env, 86401);
    client.advance_to_reveal(&dispute_id);
    
    client.reveal_vote(&juror1, &dispute_id, &true, &salt1);
    client.reveal_vote(&juror2, &dispute_id, &true, &salt2);
    client.reveal_vote(&juror3, &dispute_id, &false, &salt3);
    
    advance_ledger(&env, 86401);
    
    client.finalize_dispute(&dispute_id);
    
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert!(dispute.verdict.is_some());
    assert_eq!(dispute.verdict.unwrap(), Symbol::new(&env, "passenger"));
}

#[test]
fn test_appeal_mechanism() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    let salt1 = BytesN::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::from_array(&env, &[2u8; 32]);
    let salt3 = BytesN::from_array(&env, &[3u8; 32]);
    
    let commit_hash1 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt1.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash2 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt2.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash3 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt3.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    client.commit_vote(&juror1, &dispute_id, &commit_hash1);
    client.commit_vote(&juror2, &dispute_id, &commit_hash2);
    client.commit_vote(&juror3, &dispute_id, &commit_hash3);
    
    advance_ledger(&env, 86401);
    client.advance_to_reveal(&dispute_id);
    
    client.reveal_vote(&juror1, &dispute_id, &false, &salt1);
    client.reveal_vote(&juror2, &dispute_id, &false, &salt2);
    client.reveal_vote(&juror3, &dispute_id, &true, &salt3);
    
    advance_ledger(&env, 86401);
    client.finalize_dispute(&dispute_id);
    
    let dispute_before_appeal = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute_before_appeal.verdict.unwrap(), Symbol::new(&env, "airline"));
    
    client.file_appeal(&passenger, &dispute_id, &5000);
    
    let dispute_after_appeal = client.get_dispute(&dispute_id).unwrap();
    assert!(dispute_after_appeal.appealed);
    assert!(dispute_after_appeal.verdict.is_none());
}

#[test]
fn test_execute_verdict() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    let salt1 = BytesN::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::from_array(&env, &[2u8; 32]);
    let salt3 = BytesN::from_array(&env, &[3u8; 32]);
    
    let commit_hash1 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt1.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash2 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt2.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash3 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt3.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    client.commit_vote(&juror1, &dispute_id, &commit_hash1);
    client.commit_vote(&juror2, &dispute_id, &commit_hash2);
    client.commit_vote(&juror3, &dispute_id, &commit_hash3);
    
    advance_ledger(&env, 86401);
    client.advance_to_reveal(&dispute_id);
    
    client.reveal_vote(&juror1, &dispute_id, &true, &salt1);
    client.reveal_vote(&juror2, &dispute_id, &true, &salt2);
    client.reveal_vote(&juror3, &dispute_id, &false, &salt3);
    
    advance_ledger(&env, 86401);
    client.finalize_dispute(&dispute_id);
    
    advance_ledger(&env, 86401);
    client.execute_verdict(&dispute_id);
    
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute.verdict.unwrap(), Symbol::new(&env, "passenger"));
}

#[test]
fn test_claim_juror_reward() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    let salt1 = BytesN::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::from_array(&env, &[2u8; 32]);
    let salt3 = BytesN::from_array(&env, &[3u8; 32]);
    
    let commit_hash1 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt1.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash2 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt2.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash3 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt3.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    client.commit_vote(&juror1, &dispute_id, &commit_hash1);
    client.commit_vote(&juror2, &dispute_id, &commit_hash2);
    client.commit_vote(&juror3, &dispute_id, &commit_hash3);
    
    advance_ledger(&env, 86401);
    client.advance_to_reveal(&dispute_id);
    
    client.reveal_vote(&juror1, &dispute_id, &true, &salt1);
    client.reveal_vote(&juror2, &dispute_id, &true, &salt2);
    client.reveal_vote(&juror3, &dispute_id, &false, &salt3);
    
    advance_ledger(&env, 86401);
    client.finalize_dispute(&dispute_id);
    
    advance_ledger(&env, 86401);
    client.execute_verdict(&dispute_id);
    
    let reward1 = client.claim_juror_reward(&juror1, &dispute_id);
    let reward2 = client.claim_juror_reward(&juror2, &dispute_id);
    
    let total_stake = 4000i128;
    let reward_pool = total_stake * 2000 / 10000;
    let expected_reward = reward_pool / 2;
    
    assert_eq!(reward1, expected_reward);
    assert_eq!(reward2, expected_reward);
}

#[test]
#[should_panic(expected = "Did not vote with majority")]
fn test_claim_juror_reward_wrong_vote() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &3, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    client.airline_respond(&airline, &dispute_id, &2000);
    
    advance_ledger(&env, 86401);
    
    let juror1 = Address::generate(&env);
    let juror2 = Address::generate(&env);
    let juror3 = Address::generate(&env);
    
    client.select_as_juror(&juror1, &dispute_id, &1000);
    client.select_as_juror(&juror2, &dispute_id, &1500);
    client.select_as_juror(&juror3, &dispute_id, &2000);
    
    let salt1 = BytesN::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::from_array(&env, &[2u8; 32]);
    let salt3 = BytesN::from_array(&env, &[3u8; 32]);
    
    let commit_hash1 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt1.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash2 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(1u32);
        for byte in salt2.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    let commit_hash3 = env.crypto().keccak256(&{
        let mut v = soroban_sdk::vec![&env];
        v.push_back(0u32);
        for byte in salt3.to_array().iter() {
            v.push_back(*byte as u32);
        }
        v.to_bytes()
    });
    
    client.commit_vote(&juror1, &dispute_id, &commit_hash1);
    client.commit_vote(&juror2, &dispute_id, &commit_hash2);
    client.commit_vote(&juror3, &dispute_id, &commit_hash3);
    
    advance_ledger(&env, 86401);
    client.advance_to_reveal(&dispute_id);
    
    client.reveal_vote(&juror1, &dispute_id, &true, &salt1);
    client.reveal_vote(&juror2, &dispute_id, &true, &salt2);
    client.reveal_vote(&juror3, &dispute_id, &false, &salt3);
    
    advance_ledger(&env, 86401);
    client.finalize_dispute(&dispute_id);
    
    advance_ledger(&env, 86401);
    client.execute_verdict(&dispute_id);
    
    client.claim_juror_reward(&juror3, &dispute_id);
}

#[test]
fn test_complete_dispute_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = create_dispute_contract(&env);
    let client = dispute::Client::new(&env, &contract_id);
    
    client.initialize(&2000, &5, &86400, &86400, &86400, &86400, &5000, &2000);
    
    let passenger = Address::generate(&env);
    let airline = Address::generate(&env);
    
    let dispute_id = client.file_dispute(&passenger, &airline, &1, &10000, &2000);
    assert_eq!(dispute_id, 1);
    
    client.airline_respond(&airline, &dispute_id, &2000);
    
    let evidence_hash1 = BytesN::from_array(&env, &[1u8; 32]);
    let evidence_hash2 = BytesN::from_array(&env, &[2u8; 32]);
    
    client.submit_evidence(&passenger, &dispute_id, &evidence_hash1, &Symbol::new(&env, "delay"));
    client.submit_evidence(&airline, &dispute_id, &evidence_hash2, &Symbol::new(&env, "weather"));
    
    advance_ledger(&env, 86401);
    
    let jurors: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    
    for juror in &jurors {
        client.select_as_juror(juror, &dispute_id, &1000);
    }
    
    let salts: Vec<BytesN<32>> = (0..5)
        .map(|i| BytesN::from_array(&env, &[i as u8; 32]))
        .collect();
    
    let votes = vec![true, true, true, false, false];
    
    for (i, juror) in jurors.iter().enumerate() {
        let commit_hash = env.crypto().keccak256(&{
            let mut v = soroban_sdk::vec![&env];
            v.push_back(if votes[i] { 1u32 } else { 0u32 });
            for byte in salts[i].to_array().iter() {
                v.push_back(*byte as u32);
            }
            v.to_bytes()
        });
        client.commit_vote(juror, &dispute_id, &commit_hash);
    }
    
    advance_ledger(&env, 86401);
    client.advance_to_reveal(&dispute_id);
    
    for (i, juror) in jurors.iter().enumerate() {
        client.reveal_vote(juror, &dispute_id, &votes[i], &salts[i]);
    }
    
    advance_ledger(&env, 86401);
    client.finalize_dispute(&dispute_id);
    
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute.verdict.unwrap(), Symbol::new(&env, "passenger"));
    assert_eq!(dispute.votes_for_passenger, 3);
    assert_eq!(dispute.votes_for_airline, 2);
    
    advance_ledger(&env, 86401);
    client.execute_verdict(&dispute_id);
    
    for (i, juror) in jurors.iter().enumerate() {
        if votes[i] {
            let reward = client.claim_juror_reward(juror, &dispute_id);
            assert!(reward > 0);
        }
    }
}
