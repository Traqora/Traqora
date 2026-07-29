use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// A payment record stored in the financial ledger.
#[contracttype]
#[derive(Clone)]
pub struct PaymentRecord {
    pub payment_id: u64,
    pub payer: Address,
    pub payee: Address,
    pub amount: i128,
    pub recorded_at: u64,
}

// ── Storage helpers ──────────────────────────────────────────────────────────

fn payment_key(payment_id: u64) -> (Symbol, u64) {
    (symbol_short!("payment"), payment_id)
}

fn next_payment_key() -> Symbol {
    symbol_short!("nxt_pay")
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct FinancialRecordsContract;

#[contractimpl]
impl FinancialRecordsContract {
    /// Record a new payment. Returns the assigned payment_id.
    pub fn record_payment(
        env: Env,
        payer: Address,
        payee: Address,
        amount: i128,
        recorded_at: u64,
    ) -> u64 {
        payer.require_auth();
        assert!(amount > 0, "amount must be positive");

        let payment_id: u64 = env
            .storage()
            .instance()
            .get(&next_payment_key())
            .unwrap_or(1u64);
        env.storage()
            .instance()
            .set(&next_payment_key(), &(payment_id + 1));

        let record = PaymentRecord {
            payment_id,
            payer,
            payee,
            amount,
            recorded_at,
        };
        env.storage()
            .persistent()
            .set(&payment_key(payment_id), &record);
        payment_id
    }

    /// Retrieve a payment record by id.
    pub fn get_payment(env: Env, payment_id: u64) -> PaymentRecord {
        env.storage()
            .persistent()
            .get(&payment_key(payment_id))
            .expect("payment not found")
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_record_and_retrieve_payment() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, FinancialRecordsContract);
        let client = FinancialRecordsContractClient::new(&env, &id);

        let payer = Address::generate(&env);
        let payee = Address::generate(&env);

        let payment_id = client.record_payment(&payer, &payee, &500i128, &1000u64);
        assert_eq!(payment_id, 1);

        let record = client.get_payment(&payment_id);
        assert_eq!(record.amount, 500);
        assert_eq!(record.payer, payer);
    }
}
