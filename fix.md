Description
Policy automation idempotency: implement this scoped Traqora capability with a narrow, reviewable change. Start from current behavior in contracts refund, define the contract, implement the minimal fix, and cover it with regression tests plus docs.

Relevant area/files: contracts refund.

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
## Summary

<!-- What does this change do, and why? Keep it short. -->

`GET /streams/:id` already supported `ETag` revalidation, but the list route (`GET /streams`) — the most requested endpoint — did not. This adds a weak `ETag` to list responses, derived from the serialized response body, and honours `If-None-Match` by returning `304 Not Modified` with no body when nothing changed. Clients that poll the list can now revalidate cheaply instead of re-downloading an unchanged page.

The 304 response is declared in the route schema and the new revalidation behaviour is documented in the README and the request-lifecycle doc.

## Linked issue

<!-- Every PR should link the issue it closes. -->
Closes #

## What was tested

<!--
Describe what you ran and what it proves. Include commands and, where useful,
the scenario covered (e.g. "npm test -- tests/indexer/apply.test.ts").
-->

- `npm run typecheck` — passes.
- `npm run build` — passes.
- `npx vitest run --project unit tests/routes/streams.test.ts` — 80 passed. New cases assert the list response carries a weak `ETag` (`W/"<sha256>"`), that identical bodies produce the same `ETag`, that a changed body produces a different `ETag`, that a matching `If-None-Match` returns `304` with an empty body, and that a non-matching or malformed header returns the full `200` body.
- `npx vitest run --project unit tests/routes/streams.test.ts tests/routes/openapi.test.ts tests/routes/streams-list-contract.test.ts tests/routes/account-summary.test.ts` — 126 passed (the schema change does not break the OpenAPI or contract tests).
- `npm test` — 629 passed; the single remaining failure (`tests/routes/stream-events.test.ts > returns 400 for an unknown kind`) is a pre-existing logic bug on `main` in the events handler, unrelated to this change.

## Checklist

- [x] `npm run typecheck` passes
- [x] `npm test` passes
- [x] `npm run build` passes
- [x] The change is covered by tests (or the reason it can't be is explained above)
- [x] Documentation updated when behaviour changed

