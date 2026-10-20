# Governance Quorum & Timelock Status UI

The proposal detail page (`/governance/[id]`) has a **Quorum & Timelock** card in its sidebar. It
shows how far the proposal is from quorum and where it is in the execution timelock.

- Resolver (a pure function with no side effects): `lib/governance/quorum-timelock-status.ts` → `resolveQuorumTimelockStatus(proposal, now?, timelockSeconds?)`
- Component: `components/governance/quorum-timelock-status.tsx` → `<QuorumTimelockStatus proposal={...} />`. It re-renders every 30 seconds unless you pass `now`.

## Inputs

These fields come from the proposal returned by `GET /api/v1/governance/proposals/:id`:

| Field           | Type              | Notes |
|-----------------|-------------------|-------|
| `votingStart`   | ISO string        | Required |
| `votingEnd`     | ISO string        | Required. Must not be earlier than `votingStart` |
| `yesVotes`      | number ≥ 0        | Required |
| `noVotes`       | number ≥ 0        | Required |
| `quorum`        | number ≥ 0        | Required. `0` means quorum is always met |
| `status`        | string            | The backend status (`active`, `passed`, `rejected`, `executed`) |
| `executed`      | boolean           | Required |
| `executionEta`  | ISO string, optional | When execution unlocks. If it is missing, the UI uses `votingEnd + timelock delay` |

The timelock delay comes from `NEXT_PUBLIC_GOVERNANCE_TIMELOCK_SECONDS`. The default is `172800`
(48 hours), which matches the upgrade timelock in `contracts/packages/upgrade`.

## Output phases

Rules are checked in this order:

| Phase            | Condition | UI |
|------------------|-----------|----|
| `invalid`        | Malformed data (see below) | "Status unavailable" plus a `role="alert"` message |
| `executed`       | `executed === true` or `status === "executed"` | "Executed" |
| `pending`        | `now < votingStart` | "Voting not started" |
| `voting`         | `now ≤ votingEnd` and `status` is not final | "Voting open" plus quorum progress |
| `quorum_not_met` | Voting ended and `yes + no < quorum` | "Quorum not met", with no timelock row |
| `rejected`       | Quorum met and (`status === "rejected"` or `yes ≤ no`) | "Rejected" |
| `timelocked`     | Passed and `now < eta` | "In timelock" plus the time left before execution unlocks |
| `ready`          | Passed and `now ≥ eta` | "Ready to execute" plus the time the timelock ended |

A proposal whose backend `status` is `passed` but that did not reach quorum shows as
`quorum_not_met`. It never enters the timelock.

## Error cases (`phase: "invalid"`)

| `error` | Cause |
|---------|-------|
| `Vote counts must be non-negative numbers` | `yesVotes` or `noVotes` is negative, `NaN`, or not a number |
| `Quorum must be a non-negative number` | `quorum` is negative, `NaN`, or not a number |
| `Voting window has an invalid date` | `votingStart` or `votingEnd` cannot be parsed |
| `Voting end is before voting start` | `votingEnd < votingStart` |
| `Execution ETA has an invalid date` | `executionEta` is present but cannot be parsed |

## Example

```ts
resolveQuorumTimelockStatus(
  { votingStart: '2026-09-01T00:00:00Z', votingEnd: '2026-09-08T00:00:00Z',
    yesVotes: 8000, noVotes: 4000, quorum: 10000, status: 'passed', executed: false },
  new Date('2026-09-08T12:00:00Z'),
)
// → { phase: 'timelocked', quorumMet: true, quorumPercent: 100,
//     timelockEndsAt: '2026-09-10T00:00:00.000Z', timelockRemainingMs: 129600000, ... }
```

## Tests

```bash
npm run test -- tests/governance/quorum-timelock-status.test.tsx
```
