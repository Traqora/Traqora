# Governance contract

The governance contract creates proposals, records one yes/no vote per address, and lets an admin finalize each proposal after its voting deadline. A configurable quorum is the minimum number of **yes votes** a proposal needs; it is combined with a strict yes-vote majority over no votes.

## Configuration

Initialize once with either:

- `init_governance(owner, voting_period_secs)`: quorum defaults to `0` for compatibility.
- `init_governance_with_quorum(owner, voting_period_secs, quorum)`: sets the initial minimum yes-vote count.

An admin can later call `set_config(caller, voting_period_secs, quorum)` to replace both settings. The voting period must be greater than zero. Quorum may be zero, which disables the minimum-vote requirement while retaining the majority requirement.

## Proposal lifecycle

1. An authenticated creator calls `create_proposal(creator, description)`. The result is a proposal ID, and the deadline is the current ledger timestamp plus the configured voting period.
2. An authenticated voter calls `cast_vote(voter, proposal_id, support)`, where `support = true` records a yes vote and `false` records a no vote. Each address can vote once per proposal, through and including the deadline.
3. After the deadline, an admin calls `execute_proposal(executor, proposal_id)`. The proposal is `passed` only when yes votes meet or exceed quorum and exceed no votes; otherwise it is `rejected`. The result can be read with `get_proposal(proposal_id)`.

## Inputs and errors

| Operation | Inputs | Result | Error cases |
| --- | --- | --- | --- |
| Initialize | owner, positive voting period, optional quorum | Stores owner and settings | Invalid voting period; already initialized |
| Update settings | Admin caller, positive voting period, quorum | Replaces settings | Caller lacks admin role; invalid voting period; not initialized |
| Create proposal | Authenticated creator, description | New `u32` proposal ID | Not initialized; proposal ID overflow |
| Cast vote | Authenticated voter, existing proposal ID, yes/no | Records vote | Already voted; proposal missing or not open; voting period ended |
| Execute proposal | Admin executor, existing proposal ID after deadline | Stores `passed` or `rejected` status | Caller lacks admin role; proposal missing or not open; voting still active; not initialized |

Execution uses the quorum configured when `execute_proposal` runs. A proposal's yes/no counts and final status are available from its stored `Proposal` record.
