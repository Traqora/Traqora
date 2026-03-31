use soroban_sdk::{contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Role {
    Owner = 0,
    Admin = 1,
    Operator = 2,
}

#[contracttype]
pub enum DataKey {
    Owner,
    Role(Address, Role),
}

pub struct AccessControl;

impl AccessControl {
    /// Initialize the owner of the contract.
    pub fn init_owner(env: &Env, owner: &Address) {
        if env.storage().instance().has(&DataKey::Owner) {
            panic!("Owner already initialized");
        }
        env.storage().instance().set(&DataKey::Owner, owner);
    }

    /// Get the current owner.
    pub fn get_owner(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .expect("Owner not initialized")
    }

    /// Check if an address has a specific role.
    /// Note: Owner implicitly has all roles. Admin implicitly has Operator role.
    pub fn has_role(env: &Env, address: &Address, role: Role) -> bool {
        // Owner has all roles
        if let Some(owner) = env.storage().instance().get::<_, Address>(&DataKey::Owner) {
            if &owner == address {
                return true;
            }
        }

        match role {
            Role::Owner => false, // Only the explicit owner check above returns true for Owner
            Role::Admin => env.storage().persistent().has(&DataKey::Role(address.clone(), Role::Admin)),
            Role::Operator => {
                // Admin also has Operator role
                env.storage().persistent().has(&DataKey::Role(address.clone(), Role::Admin)) ||
                env.storage().persistent().has(&DataKey::Role(address.clone(), Role::Operator))
            }
        }
    }

    /// Set a role for an address. Only the owner can call this.
    pub fn set_role(env: &Env, caller: &Address, target: &Address, role: Role, enabled: bool) {
        Self::require_owner(env, caller);
        
        if enabled {
            env.storage().persistent().set(&DataKey::Role(target.clone(), role), &true);
        } else {
            env.storage().persistent().remove(&DataKey::Role(target.clone(), role));
        }
    }

    /// Transfer ownership to a new address. Only the current owner can call this.
    pub fn transfer_ownership(env: &Env, caller: &Address, new_owner: &Address) {
        Self::require_owner(env, caller);
        env.storage().instance().set(&DataKey::Owner, new_owner);
    }

    /// Assert that the address is the owner.
    pub fn require_owner(env: &Env, address: &Address) {
        address.require_auth();
        let owner = Self::get_owner(env);
        if &owner != address {
            panic!("Not the owner");
        }
    }

    /// Assert that the address has at least the Admin role.
    pub fn require_admin(env: &Env, address: &Address) {
        address.require_auth();
        if !Self::has_role(env, address, Role::Admin) {
            panic!("Not an admin");
        }
    }

    /// Assert that the address has at least the Operator role.
    pub fn require_operator(env: &Env, address: &Address) {
        address.require_auth();
        if !Self::has_role(env, address, Role::Operator) {
            panic!("Not an operator");
        }
    }
}
