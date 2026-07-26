#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, contractclient};
use access::{AccessControl, Role};

#[contracttype]
#[derive(Clone)]
pub struct Booking {
    pub booking_id: u64,
    pub passenger: Address,
    pub airline: Address,
    pub flight_number: Symbol,
    pub from_airport: Symbol,
    pub to_airport: Symbol,
    pub departure_time: u64,
    pub price: i128,
    pub token: Address,
    pub amount_escrowed: i128,
    pub status: Symbol,
    pub created_at: u64,
}

#[contractclient(name = "BookingClient")]
pub trait BookingInterface {
    fn get_booking(env: Env, booking_id: u64) -> Option<Booking>;
    fn settle_cancellation(env: Env, booking_id: u64, caller: Address, passenger_refund_bps: u32) -> (i128, i128);
}

#[contractclient(name = "RefundClient")]
pub trait RefundInterface {
    fn request_refund(env: Env, passenger: Address, booking_id: u64, amount: i128, currency: Symbol, reason: Symbol) -> u64;
    fn process_refund(env: Env, admin: Address, request_id: u64);
    fn approve_refund(env: Env, admin: Address, request_id: u64, approved_amount: i128);
    fn reject_refund(env: Env, admin: Address, request_id: u64, reason: Symbol);
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    BookingContract,
    RefundContract,
    BookingMap(Symbol),
    Cancelled(Symbol),
    Dispute(Symbol),
    DisputeResolution(Symbol),
}

#[contracttype]
#[derive(Clone)]
pub struct CancellationResult {
    pub tier: Symbol,
    pub passenger_refund: i128,
    pub airline_amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Dispute {
    pub refund_id: Symbol,
    pub booking_id: u64,
    pub passenger: Address,
    pub reason: Symbol,
    pub status: Symbol,
    pub created_at: u64,
    pub resolved_at: Option<u64>,
    pub resolution: Option<Symbol>,
}

const FULL_REFUND_WINDOW_SECS: u64 = 72 * 60 * 60;
const PARTIAL_REFUND_WINDOW_SECS: u64 = 24 * 60 * 60;
const FULL_REFUND_BPS: u32 = 10_000;
const PARTIAL_REFUND_BPS: u32 = 5_000;
const NO_REFUND_BPS: u32 = 0;

#[contract]
pub struct RefundAutomationContract;

#[contractimpl]
impl RefundAutomationContract {
    pub fn initialize(env: Env, owner: Address, booking_contract: Address, refund_contract: Address) {
        if env
            .storage()
            .instance()
            .has(&DataKey::BookingContract)
        {
            panic!("Already initialized");
        }

        AccessControl::init_owner(&env, &owner);

        env.storage()
            .instance()
            .set(&DataKey::BookingContract, &booking_contract);
        env.storage()
            .instance()
            .set(&DataKey::RefundContract, &refund_contract);
    }

    pub fn register_booking(env: Env, executor: Address, booking_id: Symbol, booking_numeric_id: u64) {
        AccessControl::require_operator(&env, &executor);
        let _: Address = env
            .storage()
            .instance()
            .get(&DataKey::BookingContract)
            .expect("Not initialized");

        if env
            .storage()
            .persistent()
            .has(&DataKey::BookingMap(booking_id.clone()))
        {
            panic!("Booking already registered");
        }

        env.storage()
            .persistent()
            .set(&DataKey::BookingMap(booking_id), &booking_numeric_id);
    }

    pub fn cancel_booking(env: Env, booking_id: Symbol, caller: Address) -> CancellationResult {
        caller.require_auth();

        let is_cancelled = env
            .storage()
            .persistent()
            .get(&DataKey::Cancelled(booking_id.clone()))
            .unwrap_or(false);
        if is_cancelled {
            panic!("Booking already cancelled");
        }

        let booking_numeric_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::BookingMap(booking_id.clone()))
            .expect("Booking not registered");

        let booking_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::BookingContract)
            .expect("Not initialized");

        let booking_client = BookingClient::new(&env, &booking_contract);
        let booking = booking_client
            .get_booking(&booking_numeric_id)
            .expect("Booking not found");

        let now = env.ledger().timestamp();
        let time_until_departure = booking.departure_time.saturating_sub(now);

        let (tier, passenger_refund_bps) = if time_until_departure > FULL_REFUND_WINDOW_SECS {
            (symbol_short!("full"), FULL_REFUND_BPS)
        } else if time_until_departure >= PARTIAL_REFUND_WINDOW_SECS {
            (symbol_short!("partial"), PARTIAL_REFUND_BPS)
        } else {
            (symbol_short!("no_refund"), NO_REFUND_BPS)
        };

        let settlement = booking_client.settle_cancellation(
            &booking_numeric_id,
            &caller,
            &passenger_refund_bps,
        );

        env.storage()
            .persistent()
            .set(&DataKey::Cancelled(booking_id.clone()), &true);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("cancelled")),
            (
                booking_id.clone(),
                tier.clone(),
                settlement.0,
                settlement.1,
                caller,
                booking_numeric_id,
            ),
        );

        CancellationResult {
            tier,
            passenger_refund: settlement.0,
            airline_amount: settlement.1,
        }
    }

    pub fn automate_refund(env: Env, caller: Address, booking_id: Symbol, cancellation_reason: Symbol) -> CancellationResult {
        caller.require_auth();

        let booking_numeric_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::BookingMap(booking_id.clone()))
            .expect("Booking not registered");

        let booking_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::BookingContract)
            .expect("Not initialized");

        let booking_client = BookingClient::new(&env, &booking_contract);
        let booking = booking_client
            .get_booking(&booking_numeric_id)
            .expect("Booking not found");

        let now = env.ledger().timestamp();
        let time_until_departure = booking.departure_time.saturating_sub(now);

        let (tier, passenger_refund_bps) = if time_until_departure > FULL_REFUND_WINDOW_SECS {
            (symbol_short!("full"), FULL_REFUND_BPS)
        } else if time_until_departure >= PARTIAL_REFUND_WINDOW_SECS {
            (symbol_short!("partial"), PARTIAL_REFUND_BPS)
        } else {
            (symbol_short!("no_refund"), NO_REFUND_BPS)
        };

        let settlement = booking_client.settle_cancellation(
            &booking_numeric_id,
            &caller,
            &passenger_refund_bps,
        );

        if passenger_refund_bps > 0 {
            let refund_contract: Address = env
                .storage()
                .instance()
                .get(&DataKey::RefundContract)
                .expect("Refund contract not initialized");

            let refund_client = RefundClient::new(&env, &refund_contract);
            refund_client.request_refund(
                &booking.passenger,
                &booking_numeric_id,
                &settlement.0,
                &symbol_short!("USDC"),
                &cancellation_reason,
            );
        }

        env.storage()
            .persistent()
            .set(&DataKey::Cancelled(booking_id.clone()), &true);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("automated")),
            (
                booking_id.clone(),
                tier.clone(),
                settlement.0,
                settlement.1,
                cancellation_reason,
            ),
        );

        CancellationResult {
            tier,
            passenger_refund: settlement.0,
            airline_amount: settlement.1,
        }
    }

    pub fn process_batch_refunds(env: Env, admin: Address, booking_ids: Vec<Symbol>) -> u32 {
        AccessControl::require_operator(&env, &admin);

        let refund_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::RefundContract)
            .expect("Refund contract not initialized");

        let refund_client = RefundClient::new(&env, &refund_contract);
        let mut processed: u32 = 0;

        for booking_id in booking_ids.iter() {
            let is_cancelled = env
                .storage()
                .persistent()
                .get(&DataKey::Cancelled(booking_id.clone()))
                .unwrap_or(false);
            if !is_cancelled {
                continue;
            }

            let booking_numeric_id: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::BookingMap(booking_id.clone()))
                .expect("Booking not registered");

            let booking_contract: Address = env
                .storage()
                .instance()
                .get(&DataKey::BookingContract)
                .expect("Not initialized");

            let booking_client = BookingClient::new(&env, &booking_contract);
            let booking = booking_client
                .get_booking(&booking_numeric_id)
                .expect("Booking not found");

            let refund_id = refund_client.request_refund(
                &booking.passenger,
                &booking_numeric_id,
                &0i128,
                &symbol_short!("USDC"),
                &symbol_short!("batch"),
            );

            refund_client.process_refund(&admin, &refund_id);
            processed += 1;
        }

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("batch")),
            (admin, env.ledger().timestamp(), processed),
        );

        processed
    }

    pub fn submit_dispute(env: Env, passenger: Address, refund_id: Symbol, booking_numeric_id: u64, reason: Symbol) {
        passenger.require_auth();

        let dispute = Dispute {
            refund_id: refund_id.clone(),
            booking_id: booking_numeric_id,
            passenger: passenger.clone(),
            reason,
            status: symbol_short!("open"),
            created_at: env.ledger().timestamp(),
            resolved_at: None,
            resolution: None,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(refund_id.clone()), &dispute);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("dispute")),
            (passenger, refund_id, booking_numeric_id, env.ledger().timestamp()),
        );
    }

    pub fn resolve_dispute(env: Env, admin: Address, refund_id: Symbol, resolution: Symbol) {
        AccessControl::require_operator(&env, &admin);

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(refund_id.clone()))
            .expect("Dispute not found");

        assert!(
            dispute.status == symbol_short!("open"),
            "Dispute already resolved"
        );

        dispute.status = symbol_short!("resolved");
        dispute.resolved_at = Some(env.ledger().timestamp());
        dispute.resolution = Some(resolution.clone());

        env.storage()
            .persistent()
            .set(&DataKey::DisputeResolution(refund_id.clone()), &resolution);
        env.storage()
            .persistent()
            .set(&DataKey::Dispute(refund_id), &dispute);

        env.events().publish(
            (symbol_short!("refund"), symbol_short!("resolved")),
            (admin, refund_id, resolution, env.ledger().timestamp()),
        );
    }

    pub fn get_cancellation_result(env: Env, booking_id: Symbol) -> Option<bool> {
        env.storage()
            .persistent()
            .get(&DataKey::Cancelled(booking_id))
    }

    pub fn get_dispute(env: Env, refund_id: Symbol) -> Option<Dispute> {
        env.storage()
            .persistent()
            .get(&DataKey::Dispute(refund_id))
    }

    pub fn is_cancelled(env: Env, booking_id: Symbol) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Cancelled(booking_id))
            .unwrap_or(false)
    }

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
}
