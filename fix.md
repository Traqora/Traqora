#1131 Add a bounded confirmation retry worker
Repo Avatar
Traqora/Traqora
V1 area: Confirmation and reconciliation

Goal
Retry transient confirmation steps with bounded attempts, backoff, and a visible terminal failure state.

Acceptance criteria
 The stated v1 outcome is implemented without expanding the documented v1 scope.
 Automated tests cover the normal path and relevant validation or failure paths.
 Security, privacy, and accessibility requirements for the touched surface are preserved.
 User-facing or operational documentation is updated where behavior changes.