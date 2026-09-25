- closes #572
- closes #573
- closes #574
- closes #575

### Changes Made:
- **Middleware**: Added exhaustive testing for the rate-limit middleware to guarantee boundary condition enforcement.
- **Integration**: Mapped out the full refund lifecycle into a dedicated integration test suite (initiation through settlement).
- **Database**: Introduced an automated migration round-trip test (up/down) to ensure safe rollbacks without data corruption.
- **Contracts**: Hardened the route endpoints by adding strict payload schema contract-level tests.
