use soroban_sdk::{contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SyncCursorKey {
    Cursor(Address),
}

pub fn get_cursor(env: &Env, provider: &Address) -> Option<soroban_sdk::String> {
    let key = SyncCursorKey::Cursor(provider.clone());
    env.storage().persistent().get(&key)
}

pub fn set_cursor(env: &Env, provider: &Address, cursor: &soroban_sdk::String) {
    let key = SyncCursorKey::Cursor(provider.clone());
    env.storage().persistent().set(&key, cursor);
}
