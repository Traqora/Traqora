Description
Event docs drift check: implement this scoped Traqora capability with a narrow, reviewable change. Start from current behavior in contracts EVENTS.md code, define the contract, implement the minimal fix, and cover it with regression tests plus docs.

Relevant area/files: contracts EVENTS.md code.

Scope
In scope: one capability, contract definition, implementation, tests, docs
Out of scope: unrelated refactors or cross-cutting redesigns
Acceptance criteria

Behavior specified with inputs, outputs, and error cases

Minimal implementation merged behind existing conventions

Regression tests cover happy path + key failure mode

Docs or examples updated for operators/contributors
Testing
Unit/integration tests per area (npm run test, soroban test, workspace lint). Include at least one failure-mode test.








When you're done with the above and it good to go
fill this pr message:
# Pull Request

## Summary
<!-- Provide a clear, concise summary of the changes proposed in this PR. -->
`contracts/EVENTS.md` is the operator-facing reference for every event the
contracts emit, but it is hand-maintained and had silently drifted from the
code. This PR adds a CI-enforceable drift check and brings the doc back in sync.

New capability — `events-docs-check` (dep-free crate at
`contracts/packages/events_docs_check`, plus `scripts/check-events-docs.sh`):
- Inputs: a contract packages directory and an `EVENTS.md` path (the wrapper
  supplies `contracts/packages` and `contracts/EVENTS.md`).
- Outputs: a report of **undocumented** events (emitted in code, missing from
  the doc) and **stale** docs (listed in the doc, no longer emitted); exits
  non-zero when drift exists so CI can gate on it.
- Error cases: `DirNotFound` when the packages directory is missing;
  `Io` when a source or the doc cannot be read.

Drift found and fixed in `EVENTS.md`: added a `(booking, cancelled)` row; added
the `refund_automation` events; added `(phase, reveal)` and corrected dispute
data fields (`juror_selected`, `appeal_stake`, `verdict` payload); corrected the
admin data fields and removed the stale `(upgrade, rolled_back)` row; and added
sections for the previously undocumented Airline, Oracle, Token, BookingReceipt,
FlightRegistry, DisputeResolution (arbiter), Proxy, Upgrade, Governance, and
StorageVersion contracts.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds capability)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [x] Documentation update (changes to docs or inline comments)
- [ ] Code refactoring or performance improvement

## Related Issues
<!-- Reference related issues, e.g., Closes #123 or Fixes #456 -->
Closes #

## Guidelines & Verification Checklist
Before submitting this PR, please review and confirm the following guidelines:
- [x] I have read and followed the [Contributing Guide](CONTRIBUTING.md).
- [x] I have adhered to the project's [Code of Conduct](CODE_OF_CONDUCT.md).
- [x] I have reviewed the [Security Policy](SECURITY.md) if this PR impacts sensitive code.
- [x] New and existing unit and integration tests pass locally.
- [x] Code has been formatted and linted according to repository standards.

## Testing Details
<!-- Describe the tests you ran to verify your changes. Include commands used and key test outputs. -->
Regression tests in `contracts/packages/events_docs_check/tests/events_docs_check_test.rs`
cover the happy path (clean docs) and both drift failure modes (undocumented
emitted event, stale documented event), plus the extractors, duplicate-emitter
collapsing, the missing-directory error, and an end-to-end `run_check` against a
temp fixture.

```bash
cargo test -p events-docs-check        # 9 passed, 0 failed
cargo clippy --workspace -- -D warnings # clean
cargo fmt --check                      # clean
cargo build --workspace                # OK
./scripts/check-events-docs.sh         # OK: EVENTS.md is in sync (exit 0)
```


