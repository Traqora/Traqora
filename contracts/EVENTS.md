# Traqora Contract Events

All events follow a standard schema for consistent off-chain indexing and monitoring.

## Standard Event Schema

```
topics: (contract_topic: symbol, action_topic: symbol)
data:   (actor: Address, timestamp: u64, primary_id: u64, ...action_specific_payload)
```

- `contract_topic` — identifies the contract domain (e.g. `booking`, `refund`, `loyalty`)
- `action_topic` — identifies the action (e.g. `created`, `paid`, `approved`)
- `actor` — the address that triggered the action (passenger, airline, oracle, etc.)
- `timestamp` — ledger timestamp at the time of the event (`env.ledger().timestamp()`)
- `primary_id` — the main entity ID (booking_id, request_id, etc.)
- additional payload fields are action-specific (see tables below)

The topic vocabulary is defined once, in
[`packages/shared/events`](packages/shared/events/src/lib.rs) (`contract-events`).
Every contract publishes through its `emit` helper, so a topic spelling can only
change there — and in this document — never in an individual contract:

```rust
contract_events::emit(&env, Domain::Booking, Action::Created, data);
```

Two deviations are intentional and are called out below:

- **`flight_registry` uses a third topic.** It publishes the entity id as
  `topic[2]` through `emit_indexed`, so a subscriber can filter
  `(flight, added, <flight_id>)` without decoding the payload. Every other
  package is two topics.
- **A few events are keyed by `Symbol` rather than a numeric id** (`airline`
  code, `flight_number`, flight id), so their `data` keeps a
  domain-specific field order instead of the `(actor, timestamp, primary_id)`
  prefix. These are marked below.

The tables list what each contract actually publishes. A `Domain`/`Action`
variant may exist in `contract-events` without being emitted anywhere — the
enums are the vocabulary, the tables are the actual event log.

---

## Booking Contract (`booking`)

| topics                 | data fields                                                                             | description                            |
|------------------------|------------------------------------------------------------------------------------------|----------------------------------------|
| `(booking, oracle)`    | `(admin, timestamp, oracle)`                                                              | Trusted oracle address registered      |
| `(booking, created)`   | `(passenger, timestamp, booking_id, airline, flight_number, price)`                       | New booking created in pending state   |
| `(booking, paid)`      | `(passenger, timestamp, booking_id, amount)`                                              | Payment escrowed; booking confirmed    |
| `(booking, released)`  | `(airline \| oracle, timestamp, booking_id, released_amount)`                             | Escrow released to airline post-flight |
| `(booking, refunded)`  | `(passenger \| oracle, timestamp, booking_id, refunded_amount)`                           | Escrow refunded to passenger           |
| `(booking, cancelled)` | `(caller, timestamp, booking_id, passenger_refund, airline_amount)`                       | Booking cancelled; split of the escrow |

### Querying via Stellar SDK (JavaScript)

```js
const server = new StellarSdk.SorobanRpc.Server(rpcUrl);
const events = await server.getEvents({
  startLedger: fromLedger,
  filters: [{
    type: "contract",
    contractIds: [BOOKING_CONTRACT_ID],
    topics: [
      [StellarSdk.xdr.ScVal.scvSymbol("booking")],
      [StellarSdk.xdr.ScVal.scvSymbol("created")],
    ],
  }],
});
```

---

## FlightBooking Contract (`flight_booking`)

| topics              | data fields                                                              | description                       |
|---------------------|--------------------------------------------------------------------------|-----------------------------------|
| `(seat, reserved)`  | `(passenger, created_at, booking_id, flight_id, seat, amount)`           | Seat reserved; ledger and off-chain ids linked |

`flight_id` and `seat` are `Symbol`s here, so the payload keeps its
domain-specific order instead of the numeric `(actor, timestamp, id)` prefix.

---

## FlightRegistry Contract (`flight_registry`)

Three-topic events: `topic[2]` is the entity id, published via
`contract_events::emit_indexed`.

| topics                     | topic[2]        | data fields                                                       | description                          |
|----------------------------|-----------------|-------------------------------------------------------------------|--------------------------------------|
| `(airline, reg)`           | `airline_id`    | `(admin, name)`                                                    | Airline registered on-chain          |
| `(flight, added)`          | `flight_id`     | `(airline_id, airline_admin)`                                     | Flight listed for an airline         |
| `(flight, updated)`        | `flight_id`     | `(airline_id, airline_admin)`                                     | Flight record changed                |
| `(flight, updated)`        | `flight_id`     | `(airline_id, airline_admin, status)`                             | Status recorded                      |
| `(flight, updated)`        | `flight_id`     | `(airline_id, departure_time, arrival_time)`                      | Schedule recorded                    |
| `(flight, updated)`        | `flight_id`     | `(airline_id, total_seats, available_seats)`                      | Seat inventory recorded              |
| `(flight, details)`        | `flight_id`     | `(status, departure_time, arrival_time, total_seats, available_seats)` | Full flight snapshot             |
| `(flight, status)`         | `flight_id`     | `(status, airline_id)`                                             | Status set                            |
| `(flight, schedule)`       | `flight_id`     | `(departure_time, arrival_time)`                                   | Schedule set                         |
| `(flight, seats)`          | `flight_id`     | `(total_seats, available_seats)`                                   | Seat inventory set                   |

---

## Airline Contract (`airline`)

| topics                 | data fields                                            | description                        |
|------------------------|--------------------------------------------------------|------------------------------------|
| `(pricing, init)`      | `(admin, oracle, max_change_bps, cooldown_secs)`       | Dynamic-pricing policy configured  |
| `(pricing, oracle)`    | `(admin, oracle)`                                      | Pricing oracle changed             |
| `(airline, reg)`       | `airline`                                              | Airline registered                 |
| `(airline, verified)`  | `airline`                                              | Airline verified by an admin       |
| `(flight, created)`    | `flight_id`                                            | Flight listing created             |
| `(flight, cancelled)`  | `flight_id`                                            | Flight listing cancelled           |
| `(flight, status)`     | `flight_id`                                            | Status batch update applied        |
| `(flight, price)`      | `(flight_id, old_price, new_price, oracle)`            | Price updated against the oracle   |

---

## Refund Contract (`refund`)

| topics                  | data fields                                                                      | description                              |
|-------------------------|----------------------------------------------------------------------------------|------------------------------------------|
| `(policy, set)`         | `(airline, timestamp, cancellation_window, full_refund_percentage)`              | Airline refund policy configured         |
| `(refund, requested)`   | `(passenger, timestamp, request_id, booking_id, amount)`                          | Refund request submitted                 |
| `(refund, approved)`    | `(passenger, timestamp, request_id, booking_id, amount)`                          | Full refund approved; backend transfers  |
| `(refund, approved)`    | `(passenger, timestamp, request_id, booking_id, approved_amount)`                 | Partial refund approved (same topics)    |
| `(refund, rejected)`    | `(passenger, timestamp, request_id, booking_id, reason)`                          | Refund request rejected                  |
| `(refund, partial)`     | `(admin, timestamp, booking_id, amount, new_total)`                               | Refund partially applied against a total |

## RefundAutomation Contract (`refund_automation`)

| topics                 | data fields                                                                                       | description                                |
|------------------------|---------------------------------------------------------------------------------------------------|--------------------------------------------|
| `(refund, cancelled)`  | `(caller, timestamp, booking_id, tier, passenger_amount, airline_amount)`                         | Cancellation settled automatically         |
| `(refund, automated)`  | `(caller, timestamp, booking_id, tier, passenger_amount, airline_amount, cancellation_reason)`     | Automated refund executed                  |
| `(refund, batch)`      | `(admin, timestamp, processed)`                                                                  | Batch automation completed                 |
| `(refund, dispute)`    | `(passenger, timestamp, booking_id, refund_id)`                                                   | Refund disputed                            |
| `(refund, resolved)`   | `(admin, timestamp, booking_id, refund_id, resolution)`                                           | Dispute resolved                           |

---

## LoyaltyProgram Contract (`loyalty`)

| topics                 | data fields                                     | description                                    |
|------------------------|-------------------------------------------------|------------------------------------------------|
| `(loyalty, init)`      | `timestamp`                                     | Tier configurations initialized                |
| `(loyalty, set)`       | `(admin, timestamp, window_secs)`               | Points expiry window configured                |
| `(points, earned)`     | `(user, timestamp, points, booking_id)`         | Points awarded for a booking                   |
| `(points, accrued)`    | `(passenger, timestamp, amount, flight_id)`     | Points accrued for a flight                    |
| `(points, redeemed)`   | `(user, timestamp, points, discount)`           | Points redeemed for a discount                 |
| `(points, expired)`    | `(user, timestamp, expired)`                    | Credits dropped because they aged out          |
| `(tier, upgrade)`      | `(user, timestamp, tier)`                       | Account moved up a tier                        |
| `(tier, downgrade)`    | `(user, timestamp, tier)`                       | Account moved down a tier                      |

Points carry a ledger with an expiry window (default 365 days, adjustable with
`(loyalty, set)`). Redemption spends the oldest credits first, and every
balance read or write first expires due credits and re-derives the tier, so the
balance, the ledger, and the tier can never disagree. Tier moves are emitted
whenever a recalculation changes the tier, in either direction.

---

## Dispute Contract (`dispute`)

| topics                    | data fields                                                       | description                          |
|---------------------------|-------------------------------------------------------------------|--------------------------------------|
| `(dispute, init)`         | `jury_size`                                                       | Contract initialized                 |
| `(dispute, filed)`        | `(dispute_id, passenger, airline, amount)`                        | New dispute filed                    |
| `(dispute, responded)`    | `(dispute_id, airline, airline_stake)`                            | Airline responded to dispute         |
| `(evidence, submitted)`   | `(dispute_id, submitter, evidence_hash)`                          | Evidence submitted                   |
| `(juror, selected)`       | `(dispute_id, juror, token_balance)`                              | Juror selected for dispute           |
| `(vote, committed)`       | `(dispute_id, juror)`                                             | Vote committed (hash)                |
| `(phase, reveal)`         | `dispute_id`                                                      | Dispute entered the reveal phase     |
| `(vote, revealed)`        | `(dispute_id, juror, vote_for_passenger)`                         | Vote revealed                        |
| `(dispute, finalized)`    | `(dispute_id, verdict)`                                           | Dispute finalized with verdict       |
| `(dispute, appealed)`     | `(dispute_id, appellant, appeal_stake)`                           | Dispute appealed                     |
| `(verdict, executed)`     | `(dispute_id, winner, loser, amount, jury_reward_pool)`           | Verdict executed and funds distributed |
| `(reward, claimed)`       | `(dispute_id, juror, reward)`                                     | Juror reward claimed                 |

`dispute_id` is the primary id, so these events keep the
`(id, …)` order rather than the `(actor, timestamp, id)` prefix.

## DisputeResolution Contract (`dispute_resolution`)

| topics                | data fields                                     | description                        |
|-----------------------|-------------------------------------------------|------------------------------------|
| `(dispute, opened)`   | `(dispute_id, claimant)`                        | Dispute opened                     |
| `(dispute, counter)`  | `(dispute_id, respondent)`                      | Counter-claim filed                |
| `(dispute, resolved)` | `(dispute_id, arbiter, winner, payout_amount)`   | Dispute resolved and paid out      |

---

## AdminMultisig Contract (`admin`)

| topics                    | data fields                        | description                        |
|---------------------------|------------------------------------|------------------------------------|
| `(admin, init)`           | `threshold`                        | Multisig initialized               |
| `(proposal, created)`     | `(proposal_id, action_type)`       | New proposal created               |
| `(proposal, approved)`    | `(proposal_id, signer)`            | Proposal approved by a signer      |
| `(proposal, cancelled)`   | `proposal_id`                      | Proposal cancelled                 |
| `(action, executed)`      | `(proposal_id, action_type)`       | Proposal executed                  |
| `(emergency, stopped)`    | `proposal_id`                      | Emergency stop activated           |
| `(emergency, resumed)`    | `proposal_id`                      | Emergency stop lifted              |
| `(signer, added)`         | `(proposal_id, signer)`            | Signer added                       |
| `(signer, removed)`       | `(proposal_id, signer)`            | Signer removed                     |
| `(threshold, updated)`    | `(proposal_id, new_threshold)`     | Approval threshold changed         |
| `(param, changed)`        | `(proposal_id, key, value)`        | Contract parameter changed         |
| `(upgrade, executed)`     | `proposal_id`                      | Upgrade action executed            |

The signer, threshold, param, and emergency events are all emitted by
`execute_proposal`, so `proposal_id` links them back to the proposal that
authorized the change.

## Governance Contract (`governance`)

| topics                  | data fields                     | description                     |
|-------------------------|---------------------------------|---------------------------------|
| `(proposal, created)`   | `id`                            | Proposal created                |
| `(vote, cast)`          | `(proposal_id, voter, support)` | Vote recorded                   |
| `(proposal, executed)`  | `(proposal_id, status)`         | Voting closed and executed      |

---

## Token Contract (`token`)

| topics                     | data fields                   | description                        |
|----------------------------|-------------------------------|------------------------------------|
| `(token, init)`            | `(admin, symbol)`             | Token initialized                  |
| `(mint, success)`          | `(to, amount)`                | Minted to an address               |
| `(transfer, success)`      | `(from, to, amount)`          | Transfer completed                 |
| `(approve, success)`       | `(owner, spender, amount)`    | Allowance set                      |
| `(tr_from, success)`       | `(from, to, amount)`          | Allowance spent in a transfer      |

## BookingReceipt Contract (`booking_receipt`)

| topics               | data fields                        | description                    |
|----------------------|------------------------------------|--------------------------------|
| `(mint, success)`    | `(to, receipt_id, booking_id)`     | Booking receipt NFT minted     |

`(mint, success)` is shared with the token contract; disambiguate by
`contractId` when querying.

---

## Oracle Contract (`oracle`)

| topics                 | data fields                                    | description                        |
|------------------------|------------------------------------------------|------------------------------------|
| `(oracle, init)`       | `(owner, min_stake, consensus_threshold)`       | Oracle configured                  |
| `(oracle, provider)`   | `(provider, stake)`                             | Provider registered with a stake   |
| `(oracle, status)`     | `(flight_number, booking_id, status, provider)` | Status report submitted            |
| `(oracle, settled)`    | `(booking_id, status)`                          | Booking reached consensus          |
| `(oracle, refunded)`   | `(booking_id, status)`                          | Cancellation refund approved       |

`flight_number` is a `Symbol`, so `(oracle, status)` is keyed by flight number
rather than a numeric id.

---

## Proxy Contract (`proxy`)

| topics                    | data fields                                                          | description                       |
|---------------------------|----------------------------------------------------------------------|-----------------------------------|
| `(proxy, init)`           | `(admin, implementation, threshold)`                                | Proxy initialized                 |
| `(upgrade, proposed)`     | `(proposal_id, new_implementation)`                                 | Upgrade proposed                  |
| `(upgrade, approved)`     | `(proposal_id, signer)`                                             | Upgrade approved by a signer      |
| `(upgrade, executed)`     | `(proposal_id, version, old_implementation, new_implementation)`     | Upgrade executed                  |
| `(proxy, paused)`         | `admin`                                                             | Proxy paused                      |
| `(proxy, unpaused)`       | `admin`                                                             | Proxy unpaused                    |
| `(storage, migrated)`     | `(from_version, to_version)`                                        | Storage layout migration applied  |
| `(multisig, updated)`     | `new_threshold`                                                     | Multisig threshold updated        |

## Upgrade Contract (`upgrade`)

| topics                   | data fields                                 | description                        |
|--------------------------|---------------------------------------------|------------------------------------|
| `(upgrade, scheduled)`   | `(new_wasm_hash, timestamp, admin)`         | Upgrade scheduled                  |
| `(upgrade, executed)`    | `(new_wasm_hash, timestamp, admin)`         | Scheduled upgrade executed         |
| `(upgrade, timelock)`    | `(duration, owner)`                         | Timelock duration changed          |
| `(upgrade, cancelled)`   | `(new_wasm_hash, owner)`                    | Scheduled upgrade cancelled        |

---

## Querying Events via Stellar SDK

Events are queryable using the Soroban RPC `getEvents` endpoint. All events are emitted as
`contract` type events and are indexed by contract ID and topic.

```js
// Generic helper — works for any contract/action pair
async function getContractEvents(contractId, topicA, topicB, fromLedger) {
  const server = new StellarSdk.SorobanRpc.Server(RPC_URL);
  return server.getEvents({
    startLedger: fromLedger,
    filters: [{
      type: "contract",
      contractIds: [contractId],
      topics: [
        [StellarSdk.xdr.ScVal.scvSymbol(topicA)],
        [StellarSdk.xdr.ScVal.scvSymbol(topicB)],
      ],
    }],
  });
}

// Example: watch for all refund approvals
const refundApprovals = await getContractEvents(
  REFUND_CONTRACT_ID, "refund", "approved", startLedger
);
```

`flight_registry` adds a third topic, so its filters carry the entity id:

```js
const flightEvents = await server.getEvents({
  startLedger: fromLedger,
  filters: [{
    type: "contract",
    contractIds: [FLIGHT_REGISTRY_CONTRACT_ID],
    topics: [
      [StellarSdk.xdr.ScVal.scvSymbol("flight")],
      [StellarSdk.xdr.ScVal.scvSymbol("added")],
      [StellarSdk.xdr.ScVal.scvU64(flightId)],
    ],
  }],
});
```

### Rust (soroban-client)

```rust
let events = server.get_events(GetEventsRequest {
    start_ledger: from_ledger,
    filters: vec![EventFilter {
        event_type: EventType::Contract,
        contract_ids: vec![booking_contract_id],
        topics: vec![
            vec![ScVal::Symbol("booking".into())],
            vec![ScVal::Symbol("created".into())],
        ],
    }],
    ..Default::default()
}).await?;
```

---

## Notes

- All `symbol_short!` topics are limited to 9 characters (Soroban constraint).
- `timestamp` in event data is `env.ledger().timestamp()` — Unix seconds, same as ledger close time.
- Events are not stored on-chain beyond the ledger's event retention window; index them promptly.
- The `actor` field enables attribution for audit trails without requiring additional lookups.
- Contracts must publish through `contract-events`; a direct
  `env.events().publish` with hand-written topic literals is what this schema
  exists to prevent. `contracts/packages/shared/events` is the only place a new
  domain or action symbol may be introduced, and it must be added here too.
