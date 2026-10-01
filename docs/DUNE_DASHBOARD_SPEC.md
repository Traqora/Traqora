# Dune Analytics Dashboard Specification

## Overview

This document specifies the Dune Analytics dashboards for Traqora, providing real-time visibility into protocol metrics, user activity, and financial performance on the Stellar network.

## Dashboard Structure

### 1. Protocol Overview Dashboard
**Purpose**: High-level health metrics for operators and stakeholders

#### Queries

| Metric | Query Name | Description | Refresh Interval |
|--------|------------|-------------|------------------|
| Total Bookings | `traqora_total_bookings` | Cumulative bookings created | 1 hour |
| Active Bookings | `traqora_active_bookings` | Bookings in confirmed/paid/onchain_submitted status | 15 min |
| Total Volume (USDC) | `traqora_total_volume_usdc` | Sum of all booking amounts in USDC | 1 hour |
| Daily Active Users | `traqora_dau` | Unique passengers with activity in 24h | 1 hour |
| Success Rate | `traqora_booking_success_rate` | Completed bookings / Total initiated | 1 hour |

#### Visualizations
- **KPI Cards**: Total Bookings, Active Bookings, Total Volume, DAU, Success Rate
- **Time Series**: Daily bookings (30d), Daily volume (30d), DAU trend (30d)
- **Funnel**: Search → Select → Payment → Confirmed → On-chain

---

### 2. Booking Analytics Dashboard
**Purpose**: Deep dive into booking patterns and conversion

#### Queries

| Metric | Query Name | Description |
|--------|------------|-------------|
| Bookings by Status | `traqora_bookings_by_status` | Distribution across statuses |
| Bookings by Route | `traqora_bookings_by_route` | Top 20 origin-destination pairs |
| Bookings by Airline | `traqora_bookings_by_airline` | Volume per airline partner |
| Average Booking Value | `traqora_avg_booking_value` | Mean/median booking amount |
| Booking Lead Time | `traqora_booking_lead_time` | Days between booking and departure |
| Cabin Class Distribution | `traqora_cabin_class_dist` | Economy/Premium/Business/First split |

#### Visualizations
- **Stacked Bar**: Bookings by status over time
- **Map**: Route volume heatmap
- **Bar Chart**: Top airlines by volume
- **Histogram**: Lead time distribution
- **Pie Chart**: Cabin class split

---

### 3. Refund & Dispute Dashboard
**Purpose**: Monitor refund automation, manual reviews, and dispute resolution

#### Queries

| Metric | Query Name | Description |
|--------|------------|-------------|
| Refund Requests | `traqora_refund_requests` | Daily refund requests by reason |
| Refund Approval Rate | `traqora_refund_approval_rate` | Approved / Total requests |
| Automated vs Manual | `traqora_refund_auto_vs_manual` | Split of auto-approved vs manual review |
| Avg Processing Time | `traqora_refund_processing_time` | Hours from request to completion |
| Refund Volume | `traqora_refund_volume_usdc` | Total refunded amount |
| Dispute Rate | `traqora_dispute_rate` | Disputes / Total refunds |
| Delayed Refunds Pending | `traqora_delayed_refunds_pending` | Count & value of timelocked refunds |

#### Visualizations
- **Stacked Area**: Refund requests by reason over time
- **KPI Cards**: Approval rate, Avg processing time, Pending delayed
- **Bar**: Automated vs Manual over time
- **Table**: Top disputed routes/airlines
- **Timeline**: Delayed refund expiry schedule

---

### 4. Smart Contract Activity Dashboard
**Purpose**: On-chain metrics from Soroban contracts

#### Queries

| Metric | Query Name | Description |
|--------|------------|-------------|
| Contract Deployments | `traqora_contract_deployments` | Contract versions deployed |
| Transaction Volume | `traqora_tx_volume` | Daily Soroban tx count |
| Gas Usage | `traqora_gas_usage` | Avg/max gas per tx type |
| Contract Errors | `traqora_contract_errors` | Failed tx by error type |
| Upgrade Events | `traqora_upgrade_events` | Timelock upgrade executions |
| Unique Contract Callers | `traqora_unique_callers` | Distinct addresses interacting |

#### Visualizations
- **Line**: Daily transaction count
- **Bar**: Gas by tx type (booking, refund, upgrade)
- **Table**: Recent failed transactions
- **Counter**: Total unique users on-chain

---

### 5. Wallet & Payment Dashboard
**Purpose**: Payment method adoption and wallet connectivity

#### Queries

| Metric | Query Name | Description |
|--------|------------|-------------|
| Wallet Connections | `traqora_wallet_connections` | Daily connections by wallet type |
| Payment Method Split | `traqora_payment_split` | USDC / XLM / Other |
| Failed Payments | `traqora_failed_payments` | Payment failures by reason |
| Wallet Retention | `traqora_wallet_retention` | % users returning with same wallet |

#### Visualizations
- **Stacked Bar**: Wallet connections by type (Freighter, Albedo, Rabet)
- **Pie**: Payment method distribution
- **Line**: Failed payment rate over time
- **Cohort**: Wallet retention heatmap

---

### 6. Loyalty & Governance Dashboard
**Purpose**: Token incentives and governance participation

#### Queries

| Metric | Query Name | Description |
|--------|------------|-------------|
| Loyalty Points Issued | `traqora_loyalty_issued` | Points awarded by tier |
| Loyalty Points Redeemed | `traqora_loyalty_redeemed` | Points used for discounts |
| Governance Proposals | `traqora_governance_proposals` | Active/completed proposals |
| Voting Participation | `traqora_voting_participation` | Turnout by proposal |
| Token Holder Distribution | `traqora_token_holders` | Holdings concentration |

#### Visualizations
- **Line**: Cumulative points issued/redeemed
- **Table**: Active proposals with voting status
- **Bar**: Voting participation % over time
- **Lorenz Curve**: Token holder distribution

---

## Data Sources

### Primary: Stellar Network (via Dune's Stellar Integration)
- Soroban contract events and function calls
- Stellar account transactions
- Asset transfers (USDC, XLM, custom assets)

### Secondary: Off-chain Indexer (PostgreSQL → Dune)
- Booking metadata (routes, airlines, pricing)
- Refund requests and audit trails
- User profiles and KYC status
- Off-chain payment intents (Stripe)

### ETL Pipeline
```
Stellar RPC → Soroban Indexer → PostgreSQL → Dune SQL Tables
                    ↓
Off-chain API → PostgreSQL → Dune SQL Tables
```

### Table Schemas

```sql
-- traqora.bookings
CREATE TABLE traqora.bookings (
    id UUID PRIMARY KEY,
    soroban_booking_id BIGINT,
    passenger_address VARCHAR(56),
    airline VARCHAR(100),
    flight_number VARCHAR(20),
    origin VARCHAR(3),
    destination VARCHAR(3),
    departure_time TIMESTAMP,
    amount_cents BIGINT,
    currency VARCHAR(3),
    status VARCHAR(30),
    cabin_class VARCHAR(20),
    stripe_payment_intent_id VARCHAR(100),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- traqora.refunds
CREATE TABLE traqora.refunds (
    id UUID PRIMARY KEY,
    booking_id UUID REFERENCES traqora.bookings(id),
    status VARCHAR(30),
    reason VARCHAR(50),
    requested_amount_cents BIGINT,
    approved_amount_cents BIGINT,
    processing_fee_cents BIGINT,
    refund_percentage INT,
    is_delayed BOOLEAN,
    delayed_until TIMESTAMP,
    stripe_refund_id VARCHAR(100),
    soroban_tx_hash VARCHAR(100),
    created_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- traqora.contract_events
CREATE TABLE traqora.contract_events (
    id BIGSERIAL PRIMARY KEY,
    contract_id VARCHAR(56),
    event_type VARCHAR(50),
    topics JSONB,
    data JSONB,
    tx_hash VARCHAR(100),
    ledger BIGINT,
    timestamp TIMESTAMP
);

-- traqora.wallet_connections
CREATE TABLE traqora.wallet_connections (
    id BIGSERIAL PRIMARY KEY,
    passenger_address VARCHAR(56),
    wallet_type VARCHAR(20), -- freighter, albedo, rabet
    connected_at TIMESTAMP,
    disconnected_at TIMESTAMP
);
```

---

## Query Templates

### Total Bookings
```sql
-- traqora_total_bookings
SELECT COUNT(*) as total_bookings
FROM traqora.bookings
WHERE created_at >= NOW() - INTERVAL '30 days';
```

### Bookings by Status
```sql
-- traqora_bookings_by_status
SELECT status, COUNT(*) as count
FROM traqora.bookings
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC;
```

### Refund Approval Rate
```sql
-- traqora_refund_approval_rate
SELECT
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) FILTER (WHERE status IN ('completed', 'approved'))::float /
    NULLIF(COUNT(*), 0) as approval_rate
FROM traqora.refunds
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

### Daily Transaction Volume
```sql
-- traqora_tx_volume
SELECT
    DATE_TRUNC('day', timestamp) as day,
    COUNT(*) as tx_count,
    COUNT(DISTINCT data->>'from') as unique_senders
FROM traqora.contract_events
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day;
```

---

## Alerting Rules

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| Booking Success Rate Drop | < 90% for 1h | Critical | PagerDuty |
| Refund Processing Delay | > 24h pending | High | Slack #alerts |
| Contract Error Spike | > 5% error rate | Critical | PagerDuty |
| Wallet Connection Failures | > 10% failure rate | High | Slack #alerts |
| Delayed Refund Expiry | > 10 pending expiry | Medium | Slack #ops |

---

## Implementation Checklist

- [ ] Deploy Soroban indexer to capture contract events
- [ ] Set up PostgreSQL → Dune sync (Airbyte/Fivetran/custom)
- [ ] Create Dune dataset `traqora`
- [ ] Implement all queries above
- [ ] Build 6 dashboards per specification
- [ ] Configure alerting rules
- [ ] Document query maintenance procedures
- [ ] Share dashboards with stakeholders

---

## Maintenance

- **Query Review**: Monthly (first Monday)
- **Schema Changes**: Coordinate with backend deployments
- **Performance**: Monitor query execution time; optimize with materialized views if >30s
- **Cost Control**: Limit scan ranges; use partition pruning

---

## Access Control

| Role | Access |
|------|--------|
| Core Team | Full edit + all dashboards |
| Operations | View all, edit alerts |
| Investors | View Protocol Overview only |
| Public | None (private dashboards) |

---

*Last Updated: 2026-09-27*
*Version: 1.0*
*Owner: Data Engineering*