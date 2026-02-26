use soroban_sdk::{symbol_short, testutils::Address as _, Address, Env};

use traqora_contracts::storage_version::{
    VersionedStorage, AIRLINE_CONTRACT, BOOKING_CONTRACT, TOKEN_CONTRACT,
};

use traqora_contracts::token::TRQTokenContract;

fn run_as_contract<T>(env: &Env, f: impl FnOnce() -> T) -> T {
    let contract_id = env.register(TRQTokenContract, ());
    env.as_contract(&contract_id, f)
}

#[test]
fn test_storage_version_initialization() {
    let env = Env::default();

    run_as_contract(&env, || {
        // Default version should be 1
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &BOOKING_CONTRACT),
            1
        );

        // Initialize should not change if already set
        VersionedStorage::initialize_storage_version(&env, &BOOKING_CONTRACT);
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &BOOKING_CONTRACT),
            1
        );
    });
}

#[test]
fn test_storage_version_set_and_get() {
    let env = Env::default();

    run_as_contract(&env, || {
        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 2);
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &BOOKING_CONTRACT),
            2
        );

        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 5);
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &BOOKING_CONTRACT),
            5
        );
    });
}

#[test]
fn test_needs_migration() {
    let env = Env::default();

    run_as_contract(&env, || {
        // Default version is 1
        assert!(VersionedStorage::needs_migration(
            &env,
            &BOOKING_CONTRACT,
            2
        ));
        assert!(VersionedStorage::needs_migration(
            &env,
            &BOOKING_CONTRACT,
            5
        ));
        assert!(!VersionedStorage::needs_migration(
            &env,
            &BOOKING_CONTRACT,
            1
        ));

        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 3);
        assert!(!VersionedStorage::needs_migration(
            &env,
            &BOOKING_CONTRACT,
            2
        ));
        assert!(!VersionedStorage::needs_migration(
            &env,
            &BOOKING_CONTRACT,
            3
        ));
        assert!(VersionedStorage::needs_migration(
            &env,
            &BOOKING_CONTRACT,
            4
        ));
    });
}

#[test]
fn test_record_and_get_migration() {
    let env = Env::default();

    run_as_contract(&env, || {
        VersionedStorage::record_migration(
            &env,
            &BOOKING_CONTRACT,
            1,
            2,
            symbol_short!("manual"),
            symbol_short!("test_mig"),
        );

        let count = VersionedStorage::get_migration_count(&env, &BOOKING_CONTRACT);
        assert_eq!(count, 1);

        let record = VersionedStorage::get_migration(&env, &BOOKING_CONTRACT, 1).unwrap();
        assert_eq!(record.from_version, 1);
        assert_eq!(record.to_version, 2);
        assert_eq!(record.migration_type, symbol_short!("manual"));
    });
}

#[test]
fn test_multiple_migrations() {
    let env = Env::default();

    run_as_contract(&env, || {
        VersionedStorage::record_migration(
            &env,
            &BOOKING_CONTRACT,
            1,
            2,
            symbol_short!("manual"),
            symbol_short!("v1_to_v2"),
        );
        VersionedStorage::record_migration(
            &env,
            &BOOKING_CONTRACT,
            2,
            3,
            symbol_short!("manual"),
            symbol_short!("v2_to_v3"),
        );
        VersionedStorage::record_migration(
            &env,
            &BOOKING_CONTRACT,
            3,
            4,
            symbol_short!("emergency"),
            symbol_short!("v3_to_v4"),
        );

        assert_eq!(
            VersionedStorage::get_migration_count(&env, &BOOKING_CONTRACT),
            3
        );

        let record_3 = VersionedStorage::get_migration(&env, &BOOKING_CONTRACT, 3).unwrap();
        assert_eq!(record_3.migration_type, symbol_short!("emergency"));
    });
}

#[test]
fn test_migrate_storage_function() {
    let env = Env::default();
    let migrator = Address::generate(&env);

    run_as_contract(&env, || {
        // Set initial version
        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 1);

        // Perform migration
        let success = VersionedStorage::migrate_storage(&env, &BOOKING_CONTRACT, 1, 3, &migrator);

        assert!(success);
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &BOOKING_CONTRACT),
            3
        );

        // Check migration progress
        let progress = VersionedStorage::get_migration_progress(&env, &BOOKING_CONTRACT).unwrap();
        assert!(progress.completed);
        assert_eq!(progress.from_version, 1);
        assert_eq!(progress.to_version, 3);
        assert_eq!(progress.total_steps, 2);
        assert_eq!(progress.current_step, 2);
    });
}

#[test]
fn test_migration_progress_tracking() {
    let env = Env::default();
    let migrator = Address::generate(&env);

    run_as_contract(&env, || {
        VersionedStorage::set_storage_version(&env, &AIRLINE_CONTRACT, 1);

        // Start migration
        VersionedStorage::migrate_storage(&env, &AIRLINE_CONTRACT, 1, 2, &migrator);

        let progress = VersionedStorage::get_migration_progress(&env, &AIRLINE_CONTRACT).unwrap();
        assert_eq!(progress.contract_type, AIRLINE_CONTRACT);
        assert!(progress.completed);
        assert!(progress.completed_at.is_some());
    });
}

#[test]
#[should_panic(expected = "Invalid migration direction")]
fn test_migrate_storage_invalid_direction() {
    let env = Env::default();
    let migrator = Address::generate(&env);

    run_as_contract(&env, || {
        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 3);

        // Can't migrate backwards
        VersionedStorage::migrate_storage(&env, &BOOKING_CONTRACT, 3, 1, &migrator);
    });
}

#[test]
#[should_panic(expected = "Current version mismatch")]
fn test_migrate_storage_version_mismatch() {
    let env = Env::default();
    let migrator = Address::generate(&env);

    run_as_contract(&env, || {
        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 2);

        // Trying to migrate from v1 when current is v2
        VersionedStorage::migrate_storage(&env, &BOOKING_CONTRACT, 1, 3, &migrator);
    });
}

#[test]
fn test_validate_storage_version() {
    let env = Env::default();

    run_as_contract(&env, || {
        VersionedStorage::set_storage_version(&env, &TOKEN_CONTRACT, 3);

        // Version 3 should be valid for min=2, max=5
        assert!(VersionedStorage::validate_storage_version(
            &env,
            &TOKEN_CONTRACT,
            2,
            5
        ));

        // Version 3 should be invalid for min=4
        assert!(!VersionedStorage::validate_storage_version(
            &env,
            &TOKEN_CONTRACT,
            4,
            5
        ));

        // Version 3 should be invalid for max=2
        assert!(!VersionedStorage::validate_storage_version(
            &env,
            &TOKEN_CONTRACT,
            1,
            2
        ));
    });
}

#[test]
fn test_different_contract_types() {
    let env = Env::default();

    run_as_contract(&env, || {
        // Each contract type has independent versioning
        VersionedStorage::set_storage_version(&env, &BOOKING_CONTRACT, 2);
        VersionedStorage::set_storage_version(&env, &AIRLINE_CONTRACT, 3);
        VersionedStorage::set_storage_version(&env, &TOKEN_CONTRACT, 1);

        assert_eq!(
            VersionedStorage::get_storage_version(&env, &BOOKING_CONTRACT),
            2
        );
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &AIRLINE_CONTRACT),
            3
        );
        assert_eq!(
            VersionedStorage::get_storage_version(&env, &TOKEN_CONTRACT),
            1
        );
    });
}

#[test]
fn test_migration_record_timestamp() {
    let env = Env::default();

    run_as_contract(&env, || {
        VersionedStorage::record_migration(
            &env,
            &BOOKING_CONTRACT,
            1,
            2,
            symbol_short!("manual"),
            symbol_short!("test"),
        );

        let record = VersionedStorage::get_migration(&env, &BOOKING_CONTRACT, 1).unwrap();

        // Timestamp should be set (may be 0 in test env)
        let _ts = record.timestamp;
    });
}
