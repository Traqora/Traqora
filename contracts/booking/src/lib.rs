use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, symbol_short};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BookingState {
    Pending = 0,
    Confirmed = 1,
    Completed = 2,
    Cancelled = 3,
}

#[contracttype]
pub enum DataKey {
    State(u64),
    Owner(u64),
}

#[contract]
pub struct BookingContract;

#[contractimpl]
impl BookingContract {
    pub fn initialize_booking(env: Env, booking_id: u64, owner: Address) {
        owner.require_auth();
        let state_key = DataKey::State(booking_id);
        if env.storage().instance().has(&state_key) {
            panic!("booking already exists");
        }
        env.storage().instance().set(&state_key, &BookingState::Pending);
        env.storage().instance().set(&DataKey::Owner(booking_id), &owner);
    }

    pub fn transition(env: Env, booking_id: u64, new_state: BookingState) {
        let owner_key = DataKey::Owner(booking_id);
        let owner: Address = env.storage().instance().get(&owner_key).expect("booking does not exist");
        owner.require_auth();

        let state_key = DataKey::State(booking_id);
        let current_state: BookingState = env.storage().instance().get(&state_key).expect("booking does not exist");

        let legal = match (current_state, new_state) {
            (BookingState::Pending, BookingState::Confirmed) => true,
            (BookingState::Pending, BookingState::Cancelled) => true,
            (BookingState::Confirmed, BookingState::Completed) => true,
            (BookingState::Confirmed, BookingState::Cancelled) => true,
            _ => false,
        };

        if !legal {
            panic!("illegal state transition");
        }

        env.storage().instance().set(&state_key, &new_state);
    }

    pub fn get_state(env: Env, booking_id: u64) -> BookingState {
        let state_key = DataKey::State(booking_id);
        env.storage().instance().get(&state_key).expect("booking does not exist")
    }
}
