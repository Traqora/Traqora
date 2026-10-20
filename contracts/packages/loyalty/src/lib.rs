#![no_std]
use access::AccessControl;
use contract_events::{Action, Domain};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

const MIN_REDEEM_POINTS: i128 = 100;

/// Default points expiry window: 365 days.
pub const DEFAULT_POINTS_EXPIRY_SECS: u64 = 365 * 24 * 60 * 60;

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
    pub bonus_percentage: u32,  // basis points
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

/// A single points credit with its own expiry, so that a balance is always
/// the sum of the unexpired entries in the user's ledger.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointsLedgerEntry {
    /// Points credited by this entry (always positive).
    pub points: i128,
    /// Ledger timestamp at which the points were credited.
    pub earned_at: u64,
    /// Ledger timestamp at which the points stop counting towards the balance.
    pub expires_at: u64,
    /// Booking the points were earned on, when applicable.
    pub booking_id: Option<u64>,
}

/// Configured expiry window applied to every newly credited entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpiryPolicy {
    pub window_secs: u64,
}

pub struct LoyaltyStorageKey;

impl LoyaltyStorageKey {
    pub fn get_account(env: &Env, user: &Address) -> Option<LoyaltyAccount> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("account"), user))
    }

    pub fn set_account(env: &Env, user: &Address, account: &LoyaltyAccount) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("account"), user), account);
    }

    pub fn get_tier_config(env: &Env, tier: &Symbol) -> Option<TierConfig> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("tier"), tier))
    }

    pub fn set_tier_config(env: &Env, tier: &Symbol, config: &TierConfig) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("tier"), tier), config);
    }

    /// FIFO ledger of point credits, oldest first. Missing ledger == empty.
    pub fn get_ledger(env: &Env, user: &Address) -> Vec<PointsLedgerEntry> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("ledger"), user))
            .unwrap_or_else(|| Vec::new(env))
    }

    pub fn set_ledger(env: &Env, user: &Address, ledger: &Vec<PointsLedgerEntry>) {
        env.storage()
            .persistent()
            .set(&(symbol_short!("ledger"), user), ledger);
    }

    /// Falls back to the 365-day default so that a contract upgraded from a
    /// version without an explicit policy keeps deterministic behaviour.
    pub fn get_expiry_policy(env: &Env) -> ExpiryPolicy {
        env.storage()
            .instance()
            .get(&symbol_short!("expiry"))
            .unwrap_or(ExpiryPolicy {
                window_secs: DEFAULT_POINTS_EXPIRY_SECS,
            })
    }

    pub fn set_expiry_policy(env: &Env, policy: &ExpiryPolicy) {
        env.storage()
            .instance()
            .set(&symbol_short!("expiry"), policy);
    }
}

#[contract]
pub struct LoyaltyContract;

#[contractimpl]
impl LoyaltyContract {
    // Initialize tier configurations
    pub fn init_loyalty(env: Env) {
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

        LoyaltyStorageKey::set_expiry_policy(
            &env,
            &ExpiryPolicy {
                window_secs: DEFAULT_POINTS_EXPIRY_SECS,
            },
        );

        contract_events::emit(
            &env,
            Domain::Loyalty,
            Action::Init,
            env.ledger().timestamp(),
        );
    }

    /// Set the points expiry window applied to credits made from now on.
    ///
    /// Existing ledger entries keep the `expires_at` they were written with, so
    /// changing the policy never retroactively expires live balances.
    pub fn set_expiry_window(env: Env, admin: Address, window_secs: u64) {
        AccessControl::require_admin(&env, &admin);
        assert!(window_secs > 0, "Invalid expiry window");

        LoyaltyStorageKey::set_expiry_policy(&env, &ExpiryPolicy { window_secs });

        contract_events::emit(
            &env,
            Domain::Loyalty,
            Action::Set,
            (admin, env.ledger().timestamp(), window_secs),
        );
    }

    /// Current points expiry window in seconds.
    pub fn get_expiry_window(env: Env) -> u64 {
        LoyaltyStorageKey::get_expiry_policy(&env).window_secs
    }

    /// The account's FIFO points ledger, oldest credit first.
    pub fn get_points_ledger(env: Env, user: Address) -> Vec<PointsLedgerEntry> {
        LoyaltyStorageKey::get_ledger(&env, &user)
    }

    pub fn init_upgrade_owner(env: Env, owner: Address) {
        access::UpgradeTimelock::init_upgrade_owner(&env, &owner);
    }

    // Get or create loyalty account
    pub fn get_or_create_account(env: Env, user: Address) -> LoyaltyAccount {
        Self::load_account(&env, &user)
    }

    /// Expire due points and re-evaluate the tier, then return the account.
    ///
    /// Safe to call repeatedly: it only writes when a credit expired or the
    /// tier actually changed, so re-reading an account never emits duplicate
    /// `(points, expired)` or `(tier, ...)` events.
    pub fn refresh_account(env: Env, user: Address) -> LoyaltyAccount {
        Self::load_account(&env, &user)
    }

    // Award points for booking
    pub fn award_points(env: Env, user: Address, booking_amount: i128, booking_id: u64) -> i128 {
        let mut account = Self::load_account(&env, &user);

        let tier_config =
            LoyaltyStorageKey::get_tier_config(&env, &account.tier).expect("Tier config not found");

        // Base points: 1 point per $1 spent
        let base_points = booking_amount;

        // Apply tier multiplier
        let multiplier = tier_config.points_multiplier as i128;
        let earned_points = base_points * multiplier / 100;

        account.total_points += earned_points;
        account.lifetime_bookings += 1;
        account.lifetime_spent += booking_amount;

        let policy = LoyaltyStorageKey::get_expiry_policy(&env);
        let mut ledger = LoyaltyStorageKey::get_ledger(&env, &user);
        ledger.push_back(PointsLedgerEntry {
            points: earned_points,
            earned_at: env.ledger().timestamp(),
            expires_at: env.ledger().timestamp() + policy.window_secs,
            booking_id: Some(booking_id),
        });
        LoyaltyStorageKey::set_ledger(&env, &user, &ledger);

        // Check for tier change in either direction
        Self::recalc_tier(&env, &mut account);

        LoyaltyStorageKey::set_account(&env, &user, &account);

        contract_events::emit(
            &env,
            Domain::Points,
            Action::Earned,
            (
                user.clone(),
                env.ledger().timestamp(),
                earned_points,
                booking_id,
            ),
        );

        earned_points
    }

    // Accrue points for a passenger flight.
    pub fn accrue_points(env: Env, passenger: Address, flight_id: Symbol, amount: i128) -> i128 {
        passenger.require_auth();
        assert!(amount > 0, "Invalid points amount");

        let mut account = Self::load_account(&env, &passenger);
        account.total_points += amount;

        let policy = LoyaltyStorageKey::get_expiry_policy(&env);
        let mut ledger = LoyaltyStorageKey::get_ledger(&env, &passenger);
        ledger.push_back(PointsLedgerEntry {
            points: amount,
            earned_at: env.ledger().timestamp(),
            expires_at: env.ledger().timestamp() + policy.window_secs,
            booking_id: None,
        });
        LoyaltyStorageKey::set_ledger(&env, &passenger, &ledger);

        Self::recalc_tier(&env, &mut account);
        LoyaltyStorageKey::set_account(&env, &passenger, &account);

        contract_events::emit(
            &env,
            Domain::Points,
            Action::Accrued,
            (
                passenger.clone(),
                env.ledger().timestamp(),
                amount,
                flight_id,
            ),
        );

        amount
    }

    // Redeem points for discount
    pub fn redeem_points(env: Env, user: Address, points: i128) -> i128 {
        user.require_auth();

        // Expire first: expired points must never be spendable.
        let mut account = Self::load_account(&env, &user);

        assert!(
            points >= MIN_REDEEM_POINTS,
            "Below minimum redeemable points"
        );
        assert!(account.total_points >= points, "Insufficient points");
        assert!(points > 0, "Invalid points amount");

        // Conversion rate: 100 points = $1
        let discount = points / 100;

        // Spend the oldest credits first so a single expiry date never has to
        // split a balance that is not actually expiring.
        let mut ledger = LoyaltyStorageKey::get_ledger(&env, &user);
        Self::consume_points_oldest_first(&env, &mut ledger, points);
        LoyaltyStorageKey::set_ledger(&env, &user, &ledger);

        account.total_points = Self::ledger_total(&env, &ledger);
        Self::recalc_tier(&env, &mut account);
        LoyaltyStorageKey::set_account(&env, &user, &account);

        contract_events::emit(
            &env,
            Domain::Points,
            Action::Redeemed,
            (user.clone(), env.ledger().timestamp(), points, discount),
        );

        discount
    }

    /// Sum of the ledger entries that have not expired yet.
    fn ledger_total(env: &Env, ledger: &Vec<PointsLedgerEntry>) -> i128 {
        let now = env.ledger().timestamp();
        let mut total: i128 = 0;
        for entry in ledger.iter() {
            if entry.expires_at > now {
                total += entry.points;
            }
        }
        total
    }

    /// Drops every entry whose `expires_at` has been reached and reports how
    /// many points that removed. The caller is responsible for persisting the
    /// account and ledger.
    fn expire_points(
        env: &Env,
        user: &Address,
        account: &mut LoyaltyAccount,
        ledger: &mut Vec<PointsLedgerEntry>,
    ) -> i128 {
        let now = env.ledger().timestamp();
        let mut expired: i128 = 0;
        let mut remaining = Vec::new(env);

        for entry in ledger.iter() {
            if entry.expires_at <= now {
                expired += entry.points;
            } else {
                remaining.push_back(entry);
            }
        }

        if expired > 0 {
            *ledger = remaining;
            account.total_points = Self::ledger_total(env, ledger);
            contract_events::emit(
                env,
                Domain::Points,
                Action::Expired,
                (user.clone(), now, expired),
            );
        }

        expired
    }

    /// Removes `amount` points starting from the oldest ledger entry.
    fn consume_points_oldest_first(env: &Env, ledger: &mut Vec<PointsLedgerEntry>, amount: i128) {
        let now = env.ledger().timestamp();
        let mut remaining_to_spend = amount;
        let mut kept = Vec::new(env);

        for entry in ledger.iter() {
            if entry.expires_at <= now || remaining_to_spend <= 0 {
                kept.push_back(entry);
                continue;
            }
            if entry.points <= remaining_to_spend {
                remaining_to_spend -= entry.points;
            } else {
                let mut partial = entry.clone();
                partial.points -= remaining_to_spend;
                remaining_to_spend = 0;
                kept.push_back(partial);
            }
        }

        *ledger = kept;
    }

    /// Loads the account, expiring due points and re-evaluating the tier.
    fn load_account(env: &Env, user: &Address) -> LoyaltyAccount {
        let mut account = match LoyaltyStorageKey::get_account(env, user) {
            Some(existing) => existing,
            None => {
                let new_account = LoyaltyAccount {
                    user: user.clone(),
                    tier: symbol_short!("bronze"),
                    total_points: 0,
                    lifetime_bookings: 0,
                    lifetime_spent: 0,
                    tier_updated_at: env.ledger().timestamp(),
                };
                LoyaltyStorageKey::set_account(env, user, &new_account);
                new_account
            }
        };

        let mut ledger = LoyaltyStorageKey::get_ledger(env, user);
        let expired = Self::expire_points(env, user, &mut account, &mut ledger);
        Self::recalc_tier(env, &mut account);

        if expired > 0 {
            LoyaltyStorageKey::set_ledger(env, user, &ledger);
        }
        LoyaltyStorageKey::set_account(env, user, &account);

        account
    }

    /// Moves the account to the highest tier it still qualifies for, emitting
    /// `(tier, upgrade)` or `(tier, downgrade)` when the tier changes.
    ///
    /// `lifetime_bookings` never decreases, so a downgrade can only be caused by
    /// points expiring.
    fn recalc_tier(env: &Env, account: &mut LoyaltyAccount) {
        let tiers = [
            symbol_short!("platinum"),
            symbol_short!("gold"),
            symbol_short!("silver"),
            symbol_short!("bronze"),
        ];

        for tier in tiers.iter() {
            let config =
                LoyaltyStorageKey::get_tier_config(env, tier).expect("Tier config not found");

            if account.total_points >= config.min_points
                && account.lifetime_bookings >= config.min_bookings
            {
                if account.tier != *tier {
                    let previous = account.tier.clone();
                    account.tier = tier.clone();
                    account.tier_updated_at = env.ledger().timestamp();

                    let action = if Self::tier_rank(tier) > Self::tier_rank(&previous) {
                        Action::Upgrade
                    } else {
                        Action::Downgrade
                    };

                    contract_events::emit(
                        env,
                        Domain::Tier,
                        action,
                        (account.user.clone(), env.ledger().timestamp(), tier.clone()),
                    );
                }
                break;
            }
        }
    }

    /// bronze = 0 … platinum = 3
    fn tier_rank(tier: &Symbol) -> u32 {
        if *tier == symbol_short!("platinum") {
            3
        } else if *tier == symbol_short!("gold") {
            2
        } else if *tier == symbol_short!("silver") {
            1
        } else {
            0
        }
    }

    pub fn get_account(env: Env, user: Address) -> Option<LoyaltyAccount> {
        Some(Self::load_account(&env, &user))
    }

    pub fn get_tier_benefits(env: Env, tier: Symbol) -> Option<TierConfig> {
        LoyaltyStorageKey::get_tier_config(&env, &tier)
    }
}
