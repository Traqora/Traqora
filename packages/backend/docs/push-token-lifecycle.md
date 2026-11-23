# Push-token lifecycle (#940)

Push provider responses that identify an invalid, unregistered, gone, or
otherwise permanently rejected token are terminal for that token. The worker
removes it from `UserPreference.pushDeviceTokens` and advances the legacy
`fcmToken` pointer to the next registered device when one exists.

Network errors, timeouts, and provider availability responses remain transient.
The worker records the failed attempt and throws so Bull can retry the job. A
permanent rejection is recorded without retrying the dead token. Other devices
continue to be eligible for delivery.

The classifier and token-preservation behavior are covered by
`packages/backend/tests/services/pushTokenLifecycle.test.ts`.
