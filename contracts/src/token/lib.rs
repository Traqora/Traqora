use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol};

// TRQ Token - Traqora Governance and Loyalty Token
// This token is used for DAO governance voting and loyalty rewards

#[contracttype]
#[derive(Clone)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: Symbol,
    pub decimals: u32,
    pub total_supply: i128,
}

#[contracttype]
pub struct Allowance {
    pub amount: i128,
    pub expiration_ledger: u32,
}

pub struct TokenStorage;

impl TokenStorage {
    pub fn get_balance(env: &Env, account: &Address) -> i128 {
        env.storage().persistent().get(&(symbol_short!("balance"), account)).unwrap_or(0)
    }
    
    pub fn set_balance(env: &Env, account: &Address, amount: i128) {
        env.storage().persistent().set(&(symbol_short!("balance"), account), &amount);
    }
    
    pub fn get_allowance(env: &Env, owner: &Address, spender: &Address) -> Option<Allowance> {
        env.storage().temporary().get(&(symbol_short!("allowance"), owner, spender))
    }
    
    pub fn set_allowance(env: &Env, owner: &Address, spender: &Address, allowance: &Allowance) {
        env.storage().temporary().set(&(symbol_short!("allowance"), owner, spender), allowance);
    }
    
    pub fn get_metadata(env: &Env) -> Option<TokenMetadata> {
        env.storage().instance().get(&symbol_short!("metadata"))
    }
    
    pub fn set_metadata(env: &Env, metadata: &TokenMetadata) {
        env.storage().instance().set(&symbol_short!("metadata"), metadata);
    }
    
    pub fn get_admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&symbol_short!("admin"))
    }
    
    pub fn set_admin(env: &Env, admin: &Address) {
        env.storage().instance().set(&symbol_short!("admin"), admin);
    }
}

#[contract]
pub struct TRQTokenContract;

#[contractimpl]
impl TRQTokenContract {
    pub fn initialize(env: Env, admin: Address, name: String, symbol: Symbol, decimals: u32) {
        if TokenStorage::get_admin(&env).is_some() {
            panic!("Already initialized");
        }
        
        TokenStorage::set_admin(&env, &admin);
        
        let metadata = TokenMetadata {
            name,
            symbol: symbol.clone(),
            decimals,
            total_supply: 0,
        };
        TokenStorage::set_metadata(&env, &metadata);
        
        env.events().publish(
            (symbol_short!("token"), symbol_short!("init")),
            (admin, symbol.clone()),
        );
    }
    
    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        admin.require_auth();
        
        assert!(
            TokenStorage::get_admin(&env) == Some(admin),
            "Unauthorized"
        );
        assert!(amount > 0, "Invalid amount");
        
        let current_balance = TokenStorage::get_balance(&env, &to);
        TokenStorage::set_balance(&env, &to, current_balance + amount);
        
        let mut metadata = TokenStorage::get_metadata(&env).expect("Not initialized");
        metadata.total_supply += amount;
        TokenStorage::set_metadata(&env, &metadata);
        
        env.events().publish(
            (symbol_short!("mint"), symbol_short!("success")),
            (to, amount),
        );
    }
    
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        
        assert!(amount > 0, "Invalid amount");
        
        let from_balance = TokenStorage::get_balance(&env, &from);
        assert!(from_balance >= amount, "Insufficient balance");
        
        TokenStorage::set_balance(&env, &from, from_balance - amount);
        
        let to_balance = TokenStorage::get_balance(&env, &to);
        TokenStorage::set_balance(&env, &to, to_balance + amount);
        
        env.events().publish(
            (symbol_short!("transfer"), symbol_short!("success")),
            (from, to, amount),
        );
    }
    
    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        owner.require_auth();
        
        let allowance = Allowance {
            amount,
            expiration_ledger,
        };
        
        TokenStorage::set_allowance(&env, &owner, &spender, &allowance);
        
        env.events().publish(
            (symbol_short!("approve"), symbol_short!("success")),
            (owner, spender, amount),
        );
    }
    
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        
        let allowance = TokenStorage::get_allowance(&env, &from, &spender)
            .expect("No allowance set");
        
        assert!(
            env.ledger().sequence() <= allowance.expiration_ledger,
            "Allowance expired"
        );
        assert!(allowance.amount >= amount, "Insufficient allowance");
        
        // Update allowance
        let new_allowance = Allowance {
            amount: allowance.amount - amount,
            expiration_ledger: allowance.expiration_ledger,
        };
        TokenStorage::set_allowance(&env, &from, &spender, &new_allowance);
        
        // Perform transfer
        let from_balance = TokenStorage::get_balance(&env, &from);
        assert!(from_balance >= amount, "Insufficient balance");
        
        TokenStorage::set_balance(&env, &from, from_balance - amount);
        
        let to_balance = TokenStorage::get_balance(&env, &to);
        TokenStorage::set_balance(&env, &to, to_balance + amount);
        
        env.events().publish(
            (symbol_short!("tr_from"), symbol_short!("success")),
            (from, to, amount),
        );
    }
    
    pub fn balance_of(env: Env, account: Address) -> i128 {
        TokenStorage::get_balance(&env, &account)
    }
    
    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        if let Some(allowance) = TokenStorage::get_allowance(&env, &owner, &spender) {
            if env.ledger().sequence() <= allowance.expiration_ledger {
                allowance.amount
            } else {
                0
            }
        } else {
            0
        }
    }
    
    pub fn total_supply(env: Env) -> i128 {
        TokenStorage::get_metadata(&env)
            .map(|m| m.total_supply)
            .unwrap_or(0)
    }
    
    pub fn decimals(env: Env) -> u32 {
        TokenStorage::get_metadata(&env)
            .map(|m| m.decimals)
            .unwrap_or(7)
    }
    
    pub fn name(env: Env) -> String {
        TokenStorage::get_metadata(&env)
            .map(|m| m.name)
            .expect("Not initialized")
    }
    
    pub fn symbol(env: Env) -> Symbol {
        TokenStorage::get_metadata(&env)
            .map(|m| m.symbol)
            .expect("Not initialized")
    }
}
