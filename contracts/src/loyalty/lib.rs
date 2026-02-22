use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct LoyaltyAccount {
    pub user: Address,
    pub tier: Symbol, // "bronze", "silver", "gold", "platinum"
    pub total_points: i128,
    pub lifetime_bookings: u64,
    pub lifetime_spent: i128,
    pub tier_updated_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct TierConfig {
    pub tier: Symbol,
    pub min_points: i128,
    pub min_bookings: u64,
    pub points_multiplier: u32, // basis points (100 = 1x, 150 = 1.5x)
    pub bonus_percentage: u32, // basis points
}

#[contracttype]
#[derive(Clone)]
pub struct PointsTransaction {
    pub transaction_id: u64,
    pub user: Address,
    pub points: i128,
    pub transaction_type: Symbol, // "earned", "redeemed", "bonus", "expired"
    pub booking_id: Option<u64>,
    pub created_at: u64,
}

pub struct LoyaltyStorageKey;

impl LoyaltyStorageKey {
    pub fn get_account(env: &Env, user: &Address) -> Option<LoyaltyAccount> {
        env.storage().persistent().get(&(symbol_short!("account"), user))
    }
    
    pub fn set_account(env: &Env, user: &Address, account: &LoyaltyAccount) {
        env.storage().persistent().set(&(symbol_short!("account"), user), account);
    }
    
    pub fn get_tier_config(env: &Env, tier: &Symbol) -> Option<TierConfig> {
        env.storage().persistent().get(&(symbol_short!("tier"), tier))
    }
    
    pub fn set_tier_config(env: &Env, tier: &Symbol, config: &TierConfig) {
        env.storage().persistent().set(&(symbol_short!("tier"), tier), config);
    }
}

#[contract]
pub struct LoyaltyContract;

#[contractimpl]
impl LoyaltyContract {
    // Initialize tier configurations
    pub fn initialize_tiers(env: Env) {
        let tiers = [
            TierConfig {
                tier: symbol_short!("bronze"),
                min_points: 0,
                min_bookings: 0,
                points_multiplier: 100,
                bonus_percentage: 0,
            },
            TierConfig {
                tier: symbol_short!("silver"),
                min_points: 1000,
                min_bookings: 5,
                points_multiplier: 125,
                bonus_percentage: 500, // 5%
            },
            TierConfig {
                tier: symbol_short!("gold"),
                min_points: 5000,
                min_bookings: 20,
                points_multiplier: 150,
                bonus_percentage: 1000, // 10%
            },
            TierConfig {
                tier: symbol_short!("platinum"),
                min_points: 20000,
                min_bookings: 50,
                points_multiplier: 200,
                bonus_percentage: 2000, // 20%
            },
        ];
        
        for config in tiers.iter() {
            LoyaltyStorageKey::set_tier_config(&env, &config.tier, config);
        }
    }
    
    // Get or create loyalty account
    pub fn get_or_create_account(env: Env, user: Address) -> LoyaltyAccount {
        if let Some(account) = LoyaltyStorageKey::get_account(&env, &user) {
            account
        } else {
            let new_account = LoyaltyAccount {
                user: user.clone(),
                tier: symbol_short!("bronze"),
                total_points: 0,
                lifetime_bookings: 0,
                lifetime_spent: 0,
                tier_updated_at: env.ledger().timestamp(),
            };
            LoyaltyStorageKey::set_account(&env, &user, &new_account);
            new_account
        }
    }
    
    // Award points for booking
    pub fn award_points(
        env: Env,
        user: Address,
        booking_amount: i128,
        booking_id: u64,
    ) -> i128 {
        let mut account = Self::get_or_create_account(env.clone(), user.clone());
        
        let tier_config = LoyaltyStorageKey::get_tier_config(&env, &account.tier)
            .expect("Tier config not found");
        
        // Base points: 1 point per $1 spent
        let base_points = booking_amount;
        
        // Apply tier multiplier
        let multiplier = tier_config.points_multiplier as i128;
        let earned_points = base_points * multiplier / 100;
        
        account.total_points += earned_points;
        account.lifetime_bookings += 1;
        account.lifetime_spent += booking_amount;
        
        // Check for tier upgrade
        Self::check_tier_upgrade(&env, &mut account);
        
        LoyaltyStorageKey::set_account(&env, &user, &account);
        
        env.events().publish(
            (symbol_short!("points"), symbol_short!("earned")),
            (user, earned_points, booking_id),
        );
        
        earned_points
    }
    
    // Redeem points for discount
    pub fn redeem_points(env: Env, user: Address, points: i128) -> i128 {
        user.require_auth();
        
        let mut account = LoyaltyStorageKey::get_account(&env, &user)
            .expect("Account not found");
        
        assert!(account.total_points >= points, "Insufficient points");
        assert!(points > 0, "Invalid points amount");
        
        // Conversion rate: 100 points = $1
        let discount = points / 100;
        
        account.total_points -= points;
        LoyaltyStorageKey::set_account(&env, &user, &account);
        
        env.events().publish(
            (symbol_short!("points"), symbol_short!("redeemed")),
            (user, points, discount),
        );
        
        discount
    }
    
    fn check_tier_upgrade(env: &Env, account: &mut LoyaltyAccount) {
        let tiers = [
            symbol_short!("platinum"),
            symbol_short!("gold"),
            symbol_short!("silver"),
            symbol_short!("bronze"),
        ];
        
        for tier in tiers.iter() {
            let config = LoyaltyStorageKey::get_tier_config(env, tier)
                .expect("Tier config not found");
            
            if account.total_points >= config.min_points 
                && account.lifetime_bookings >= config.min_bookings {
                if account.tier != *tier {
                    account.tier = tier.clone();
                    account.tier_updated_at = env.ledger().timestamp();
                    
                    env.events().publish(
                        (symbol_short!("tier"), symbol_short!("upgrade")),
                        (&account.user, tier),
                    );
                }
                break;
            }
        }
    }
    
    pub fn get_account(env: Env, user: Address) -> Option<LoyaltyAccount> {
        LoyaltyStorageKey::get_account(&env, &user)
    }
    
    pub fn get_tier_benefits(env: Env, tier: Symbol) -> Option<TierConfig> {
        LoyaltyStorageKey::get_tier_config(&env, &tier)
    }
}
