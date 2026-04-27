use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReceiptMetadata {
    pub booking_id: u64,
    pub flight_number: Symbol,
    pub from_airport: Symbol,
    pub to_airport: Symbol,
    pub seat: String,
    pub timestamp: u64,
    pub price: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: Symbol,
}

pub struct ReceiptStorage;

impl ReceiptStorage {
    pub fn get_balance(env: &Env, account: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&(symbol_short!("balance"), account))
            .unwrap_or(0)
    }

    pub fn set_balance(env: &Env, account: &Address, amount: i128) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("balance"), account), &amount);
    }

    pub fn get_metadata(env: &Env) -> Option<TokenMetadata> {
        env.storage().instance().get(&symbol_short!("metadata"))
    }

    pub fn set_metadata(env: &Env, metadata: &TokenMetadata) {
        env.storage()
            .instance()
            .set(&symbol_short!("metadata"), metadata);
    }

    pub fn get_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&symbol_short!("admin"))
    }

    pub fn set_admin(env: &Env, admin: &Address) {
        env.storage().instance().set(&symbol_short!("admin"), admin);
    }

    // Receipt-specific storage
    pub fn get_receipt(env: &Env, receipt_id: u64) -> Option<ReceiptMetadata> {
        env.storage().persistent().get(&(symbol_short!("receipt"), receipt_id))
    }

    pub fn set_receipt(env: &Env, receipt_id: u64, metadata: &ReceiptMetadata) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("receipt"), receipt_id), metadata);
    }

    pub fn get_owner(env: &Env, receipt_id: u64) -> Option<Address> {
        env.storage().persistent().get(&(symbol_short!("owner"), receipt_id))
    }

    pub fn set_owner(env: &Env, receipt_id: u64, owner: &Address) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("owner"), receipt_id), owner);
    }

    pub fn get_passenger_receipts(env: &Env, passenger: &Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("pass_recs"), passenger))
            .unwrap_or_else(|| Vec::new(env))
    }

    pub fn set_passenger_receipts(env: &Env, passenger: &Address, receipts: &Vec<u64>) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("pass_recs"), passenger), receipts);
    }

    pub fn next_id(env: &Env) -> u64 {
        let id: u64 = env.storage().instance().get(&symbol_short!("next_id")).unwrap_or(1);
        env.storage().instance().set(&symbol_short!("next_id"), &(id + 1));
        id
    }
}

#[contract]
pub struct BookingReceiptContract;

#[contractimpl]
impl BookingReceiptContract {
    pub fn initialize(env: Env, admin: Address, name: String, symbol: Symbol) {
        if ReceiptStorage::get_admin(&env).is_some() {
            panic!("Already initialized");
        }

        ReceiptStorage::set_admin(&env, &admin);

        let metadata = TokenMetadata { name, symbol };
        ReceiptStorage::set_metadata(&env, &metadata);
    }

    // --- Custom NFT Functions ---

    pub fn mint_receipt(
        env: Env,
        to: Address,
        booking_id: u64,
        flight_number: Symbol,
        from_airport: Symbol,
        to_airport: Symbol,
        seat: String,
        price: i128,
    ) -> u64 {
        let admin = ReceiptStorage::get_admin(&env).expect("Not initialized");
        admin.require_auth();

        let receipt_id = ReceiptStorage::next_id(&env);

        let metadata = ReceiptMetadata {
            booking_id,
            flight_number,
            from_airport,
            to_airport,
            seat,
            timestamp: env.ledger().timestamp(),
            price,
        };

        // Update balances and ownership
        let current_balance = ReceiptStorage::get_balance(&env, &to);
        ReceiptStorage::set_balance(&env, &to, current_balance + 1);

        ReceiptStorage::set_owner(&env, receipt_id, &to);
        ReceiptStorage::set_receipt(&env, receipt_id, &metadata);

        let mut passenger_receipts = ReceiptStorage::get_passenger_receipts(&env, &to);
        passenger_receipts.push_back(receipt_id);
        ReceiptStorage::set_passenger_receipts(&env, &to, &passenger_receipts);

        env.events().publish(
            (symbol_short!("mint"), symbol_short!("success")),
            (to, receipt_id, booking_id),
        );

        receipt_id
    }

    pub fn get_passenger_receipts(env: Env, passenger: Address) -> Vec<u64> {
        ReceiptStorage::get_passenger_receipts(&env, &passenger)
    }

    pub fn get_receipt_metadata(env: Env, receipt_id: u64) -> ReceiptMetadata {
        ReceiptStorage::get_receipt(&env, receipt_id).expect("Receipt not found")
    }

    pub fn verify_receipt(env: Env, passenger: Address, receipt_id: u64) -> bool {
        let owner = ReceiptStorage::get_owner(&env, receipt_id);
        if let Some(owner) = owner {
            owner == passenger
        } else {
            false
        }
    }

    // --- Soroban Token Interface (Fungible compatibility) ---

    pub fn allowance(_env: Env, _from: Address, _spender: Address) -> i128 {
        0
    }

    pub fn approve(_env: Env, _from: Address, _spender: Address, _amount: i128, _expiration_ledger: u32) {
        panic!("Non-transferable soulbound token");
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        ReceiptStorage::get_balance(&env, &id)
    }

    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        panic!("Non-transferable soulbound token");
    }

    pub fn transfer_from(_env: Env, _spender: Address, _from: Address, _to: Address, _amount: i128) {
        panic!("Non-transferable soulbound token");
    }

    pub fn burn(_env: Env, _from: Address, _amount: i128) {
        panic!("Burn not supported");
    }

    pub fn burn_from(_env: Env, _spender: Address, _from: Address, _amount: i128) {
        panic!("Burn not supported");
    }

    pub fn decimals(_env: Env) -> u32 {
        0
    }

    pub fn name(env: Env) -> String {
        ReceiptStorage::get_metadata(&env)
            .map(|m| m.name)
            .expect("Not initialized")
    }

    pub fn symbol(env: Env) -> Symbol {
        ReceiptStorage::get_metadata(&env)
            .map(|m| m.symbol)
            .expect("Not initialized")
    }
}

#[cfg(test)]
mod test;

