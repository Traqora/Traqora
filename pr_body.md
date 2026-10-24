- closes #511
- closes #514
- closes #515
- closes #516

### Changes Made:
- **Token**: Implemented missing integration tests for `mint`/`burn` authorization constraints and the upgrade timelock mechanics.
- **Oracle**: Bolstered the oracle feed with price-staleness threshold guards and explicit confidence interval checks.
- **Disputes**: Extended the `dispute_resolution` state machine with evidence submission timeouts and quorum voting verification.
