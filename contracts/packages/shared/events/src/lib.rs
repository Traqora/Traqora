#![no_std]
//! Canonical contract-event vocabulary (issue #517).
//!
//! Every Traqora contract package emits events through this crate so that
//! topic names are defined exactly once for the whole workspace, and so that
//! events use the canonical two-topic form documented in
//! `contracts/EVENTS.md`:
//!
//! ```text
//! topics: (contract_topic: symbol, action_topic: symbol)
//! data:   (actor: Address, timestamp: u64, primary_id: u64, ...payload)
//! ```
//!
//! `flight_registry` is the one documented exception: it publishes an
//! entity id as a third topic via [`emit_indexed`] so `getEvents` can filter
//! `(flight, added, <flight_id>)` without decoding the event data. Its arity
//! is asserted by the registry integration tests, so the exception is kept
//! explicit here rather than folded into [`emit`].
//!
//! The `Domain` values map 1:1 to the "contract domain" column of EVENTS.md and
//! the `Action` values map 1:1 to the "action" column. Symbol *values* are
//! unchanged from the previous per-package `symbol_short!` literals, so existing
//! indexers and the SDK filters documented in EVENTS.md keep working.

use soroban_sdk::{symbol_short, Address, Env, IntoVal, Symbol, Val};

/// Topic[0] — the contract domain that emitted the event.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Domain {
    /// FlightBooking contract.
    Booking,
    /// Refund + RefundAutomation contracts.
    Refund,
    /// Refund policy configuration.
    Policy,
    /// Loyalty program contract.
    Loyalty,
    /// Loyalty point balance movements.
    Points,
    /// Loyalty tier movements.
    Tier,
    /// Dispute + DisputeResolution contracts.
    Dispute,
    /// Dispute evidence.
    Evidence,
    /// Juror registry/selection.
    Juror,
    /// Juror votes.
    Vote,
    /// Dispute verdict settlement.
    Verdict,
    /// Juror rewards.
    Reward,
    /// Dispute phase transitions.
    Phase,
    /// AdminMultisig contract.
    Admin,
    /// Admin/governance proposals.
    Proposal,
    /// Executed admin actions.
    Action,
    /// Emergency stop controls.
    Emergency,
    /// Multisig signer membership.
    Signer,
    /// Multisig approval threshold.
    Threshold,
    /// Contract parameter changes.
    Param,
    /// Contract/proxy upgrades.
    Upgrade,
    /// Airline dynamic-pricing configuration.
    Pricing,
    /// Airline registry.
    Airline,
    /// Flight registry.
    Flight,
    /// FlightBooking seat reservations.
    Seat,
    /// TRQ token contract.
    Token,
    /// Token/receipt minting.
    Mint,
    /// Token transfers.
    Transfer,
    /// Token allowance approval.
    Approve,
    /// Token transfer-from (allowance spend).
    TrFrom,
    /// Upgradeable proxy.
    Proxy,
    /// Storage layout migrations.
    Storage,
    /// Multisig configuration.
    Multisig,
    /// Flight status oracle.
    Oracle,
}

impl Domain {
    /// The canonical topic symbol for this domain.
    pub fn symbol(self) -> Symbol {
        match self {
            Domain::Booking => symbol_short!("booking"),
            Domain::Refund => symbol_short!("refund"),
            Domain::Policy => symbol_short!("policy"),
            Domain::Loyalty => symbol_short!("loyalty"),
            Domain::Points => symbol_short!("points"),
            Domain::Tier => symbol_short!("tier"),
            Domain::Dispute => symbol_short!("dispute"),
            Domain::Evidence => symbol_short!("evidence"),
            Domain::Juror => symbol_short!("juror"),
            Domain::Vote => symbol_short!("vote"),
            Domain::Verdict => symbol_short!("verdict"),
            Domain::Reward => symbol_short!("reward"),
            Domain::Phase => symbol_short!("phase"),
            Domain::Admin => symbol_short!("admin"),
            Domain::Proposal => symbol_short!("proposal"),
            Domain::Action => symbol_short!("action"),
            Domain::Emergency => symbol_short!("emergency"),
            Domain::Signer => symbol_short!("signer"),
            Domain::Threshold => symbol_short!("threshold"),
            Domain::Param => symbol_short!("param"),
            Domain::Upgrade => symbol_short!("upgrade"),
            Domain::Pricing => symbol_short!("pricing"),
            Domain::Airline => symbol_short!("airline"),
            Domain::Flight => symbol_short!("flight"),
            Domain::Seat => symbol_short!("seat"),
            Domain::Token => symbol_short!("token"),
            Domain::Mint => symbol_short!("mint"),
            Domain::Transfer => symbol_short!("transfer"),
            Domain::Approve => symbol_short!("approve"),
            Domain::TrFrom => symbol_short!("tr_from"),
            Domain::Proxy => symbol_short!("proxy"),
            Domain::Storage => symbol_short!("storage"),
            Domain::Multisig => symbol_short!("multisig"),
            Domain::Oracle => symbol_short!("oracle"),
        }
    }
}

/// Topic[1] — the action performed within a [`Domain`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Action {
    Init,
    Created,
    Paid,
    Released,
    Refunded,
    Cancelled,
    Approved,
    Rejected,
    Requested,
    Set,
    Partial,
    Automated,
    Batch,
    Dispute,
    Resolved,
    Earned,
    Accrued,
    Redeemed,
    Expired,
    Upgrade,
    Downgrade,
    Filed,
    Responded,
    Submitted,
    Selected,
    Committed,
    Revealed,
    Finalized,
    Appealed,
    Executed,
    Claimed,
    Opened,
    Counter,
    Reveal,
    Added,
    Removed,
    Updated,
    Changed,
    Stopped,
    Resumed,
    Scheduled,
    RolledBack,
    Proposed,
    Timelock,
    Migrated,
    Reg,
    Verified,
    Status,
    Details,
    Schedule,
    Seats,
    Price,
    Success,
    Cast,
    Provider,
    Settled,
    Paused,
    Unpaused,
    Reserved,
    Oracle,
}

impl Action {
    /// The canonical topic symbol for this action.
    pub fn symbol(self) -> Symbol {
        match self {
            Action::Init => symbol_short!("init"),
            Action::Created => symbol_short!("created"),
            Action::Paid => symbol_short!("paid"),
            Action::Released => symbol_short!("released"),
            Action::Refunded => symbol_short!("refunded"),
            Action::Cancelled => symbol_short!("cancelled"),
            Action::Approved => symbol_short!("approved"),
            Action::Rejected => symbol_short!("rejected"),
            Action::Requested => symbol_short!("requested"),
            Action::Set => symbol_short!("set"),
            Action::Partial => symbol_short!("partial"),
            Action::Automated => symbol_short!("automated"),
            Action::Batch => symbol_short!("batch"),
            Action::Dispute => symbol_short!("dispute"),
            Action::Resolved => symbol_short!("resolved"),
            Action::Earned => symbol_short!("earned"),
            Action::Accrued => symbol_short!("accrued"),
            Action::Redeemed => symbol_short!("redeemed"),
            Action::Expired => symbol_short!("expired"),
            Action::Upgrade => symbol_short!("upgrade"),
            Action::Downgrade => symbol_short!("downgrade"),
            Action::Filed => symbol_short!("filed"),
            Action::Responded => symbol_short!("responded"),
            Action::Submitted => symbol_short!("submitted"),
            Action::Selected => symbol_short!("selected"),
            Action::Committed => symbol_short!("committed"),
            Action::Revealed => symbol_short!("revealed"),
            Action::Finalized => symbol_short!("finalized"),
            Action::Appealed => symbol_short!("appealed"),
            Action::Executed => symbol_short!("executed"),
            Action::Claimed => symbol_short!("claimed"),
            Action::Opened => symbol_short!("opened"),
            Action::Counter => symbol_short!("counter"),
            Action::Reveal => symbol_short!("reveal"),
            Action::Added => symbol_short!("added"),
            Action::Removed => symbol_short!("removed"),
            Action::Updated => symbol_short!("updated"),
            Action::Changed => symbol_short!("changed"),
            Action::Stopped => symbol_short!("stopped"),
            Action::Resumed => symbol_short!("resumed"),
            Action::Scheduled => symbol_short!("scheduled"),
            Action::RolledBack => symbol_short!("rollback"),
            Action::Proposed => symbol_short!("proposed"),
            Action::Timelock => symbol_short!("timelock"),
            Action::Migrated => symbol_short!("migrated"),
            Action::Reg => symbol_short!("reg"),
            Action::Verified => symbol_short!("verified"),
            Action::Status => symbol_short!("status"),
            Action::Details => symbol_short!("details"),
            Action::Schedule => symbol_short!("schedule"),
            Action::Seats => symbol_short!("seats"),
            Action::Price => symbol_short!("price"),
            Action::Success => symbol_short!("success"),
            Action::Cast => symbol_short!("cast"),
            Action::Provider => symbol_short!("provider"),
            Action::Settled => symbol_short!("settled"),
            Action::Paused => symbol_short!("paused"),
            Action::Unpaused => symbol_short!("unpaused"),
            Action::Reserved => symbol_short!("reserved"),
            Action::Oracle => symbol_short!("oracle"),
        }
    }
}

/// Publishes a canonical event: `topics = (domain, action)`, `data = data`.
///
/// Using this helper (instead of `env.events().publish` with hand-written
/// literals) is what guarantees the two-topic naming contract: a package cannot
/// invent a new topic spelling, nor publish a one- or three-topic event, without
/// changing this crate and `contracts/EVENTS.md` together.
///
/// `data` should follow the canonical
/// `(actor, env.ledger().timestamp(), primary_id, ...payload)` order. Packages
/// whose domain is keyed by a `Symbol` (for example `flight_id`) keep the
/// documented per-package field order instead; see EVENTS.md.
pub fn emit<T>(env: &Env, domain: Domain, action: Action, data: T)
where
    T: IntoVal<Env, Val>,
{
    env.events()
        .publish((domain.symbol(), action.symbol()), data);
}

/// Publishes an "indexed" event whose third topic carries the entity id, used
/// by `flight_registry` so `getEvents` can filter by
/// `(flight, added, <flight_id>)` without unpacking the event data.
///
/// Kept as a separate helper (rather than relaxing [`emit`]) so the
/// canonical two-topic form stays the default everywhere else.
pub fn emit_indexed<T, I>(env: &Env, domain: Domain, action: Action, index: I, data: T)
where
    T: IntoVal<Env, Val>,
    I: IntoVal<Env, Val>,
{
    env.events()
        .publish((domain.symbol(), action.symbol(), index), data);
}

/// Builds the canonical `data` prefix `(actor, timestamp, primary_id)`.
///
/// Splitting this out keeps the actor/timestamp pair in the same position for
/// every event so indexers can decode the first two fields generically.
pub fn actor_ts_id(env: &Env, actor: Address, primary_id: u64) -> (Address, u64, u64) {
    (actor, env.ledger().timestamp(), primary_id)
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Address, Env,
    };

    #[test]
    fn domain_symbols_match_the_documented_topics() {
        assert_eq!(Domain::Booking.symbol(), symbol_short!("booking"));
        assert_eq!(Domain::Refund.symbol(), symbol_short!("refund"));
        assert_eq!(Domain::Loyalty.symbol(), symbol_short!("loyalty"));
        assert_eq!(Domain::Points.symbol(), symbol_short!("points"));
        assert_eq!(Domain::Tier.symbol(), symbol_short!("tier"));
        assert_eq!(Domain::Dispute.symbol(), symbol_short!("dispute"));
        assert_eq!(Domain::Admin.symbol(), symbol_short!("admin"));
        assert_eq!(Domain::Proposal.symbol(), symbol_short!("proposal"));
        assert_eq!(Domain::TrFrom.symbol(), symbol_short!("tr_from"));
    }

    #[test]
    fn action_symbols_match_the_documented_topics() {
        assert_eq!(Action::Init.symbol(), symbol_short!("init"));
        assert_eq!(Action::Created.symbol(), symbol_short!("created"));
        assert_eq!(Action::RolledBack.symbol(), symbol_short!("rollback"));
        assert_eq!(Action::Success.symbol(), symbol_short!("success"));
    }

    #[test]
    fn emit_publishes_exactly_two_topics() {
        let env = Env::default();
        emit(
            &env,
            Domain::Booking,
            Action::Created,
            (Address::generate(&env), env.ledger().timestamp(), 7u64),
        );

        let events = env.events().all();
        assert_eq!(events.len(), 1);
        assert_eq!(events.get(0).unwrap().1.len(), 2);
    }

    #[test]
    fn actor_ts_id_orders_fields_canonically() {
        let env = Env::default();
        env.ledger().set_timestamp(1_234);
        let actor = Address::generate(&env);
        let (a, ts, id) = actor_ts_id(&env, actor.clone(), 42);
        assert_eq!(a, actor);
        assert_eq!(ts, 1_234);
        assert_eq!(id, 42);
    }
}
