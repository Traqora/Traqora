use soroban_sdk::{contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SyncCursorKey {
    ProviderCursor(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SyncCursor {
    pub provider_id: Symbol,
    pub cursor: Symbol,
    pub updated_at: u64,
}

pub fn get_cursor(env: &Env, provider_id: &Symbol) -> Option<Symbol> {
    let key = SyncCursorKey::ProviderCursor(provider_id.clone());
    env.storage().persistent().get(&key).map(|sc: SyncCursor| sc.cursor)
}

pub fn set_cursor(env: &Env, provider_id: &Symbol, cursor: &Symbol) {
    let key = SyncCursorKey::ProviderCursor(provider_id.clone());
    let timestamp = env.ledger().timestamp();
    let sync_cursor = SyncCursor {
        provider_id: provider_id.clone(),
        cursor: cursor.clone(),
        updated_at: timestamp,
    };
    env.storage().persistent().set(&key, &sync_cursor);
}
