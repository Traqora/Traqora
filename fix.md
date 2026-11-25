640 Idempotent booking create/confirm API
Repo Avatar
Traqora/Traqora
Problem / opportunity
Scoped task: Idempotent booking create/confirm API.
Relevant area: packages/backend booking orchestration.

Why it matters
Correctness, security, UX, or velocity for Traqora travel booking on Stellar.

Acceptance criteria
 Reproduce/measure current behavior
 Minimal scoped fix
 Regression test added/updated
 Docs updated where applicable
Testing
Relevant suite green (npm run test, soroban test, or workspace lint/test).
V1 area: Itinerary and self-service

Goal
Ensure itinerary actions, dates, and status information remain usable on narrow viewports.

Acceptance criteria

The stated v1 outcome is implemented without expanding the documented v1 scope.

Automated tests cover the normal path and relevant validation or failure paths.

Security, privacy, and accessibility requirements for the touched surface are preserved.

User-facing or operational documentation is updated where behavior changes.

when you are done with the task, answer the following pr message. Don't just list them back:

## Description

**Fixes:** 

## Type of change

Please delete options that are not relevant.

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [x] Setup/Infrastructure configuration

## How Has This Been Tested?

Please describe the tests that you ran to verify your changes. Provide instructions so we can reproduce.

- [ ] Local manual testing (Please describe)
- [ ] Unit/Integration Tests
- [ ] Verified on local Soroban/Stellar testnet

## Checklist:

- [ ] I have reviewed the [Contributor Issue Validation Checklist](/docs/contributing/ISSUE_VALIDATION_CHECKLIST.md)
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new linting warnings or TypeScript errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
