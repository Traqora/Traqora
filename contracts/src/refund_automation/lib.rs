use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};
use crate::access::{AccessControl, Role};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    BookingContract,
    BookingMap(Symbol),
    Cancelled(Symbol),
}

#[contracttype]
#[derive(Clone)]
pub struct CancellationResult {
    pub tier: Symbol,
    pub passenger_refund: i128,
    pub airline_amount: i128,
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
    pub fn initialize(env: Env, owner: Address, booking_contract: Address) {
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

        let booking_client = crate::booking::BookingContractClient::new(&env, &booking_contract);
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
                booking_id,
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

    pub fn is_cancelled(env: Env, booking_id: Symbol) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Cancelled(booking_id))
            .unwrap_or(false)
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
}
