# Push Notification Copy Guidelines

Mobile and web push copy is built by interpolating data into templates in
`packages/backend/src/services/PushNotificationService.ts`. A missing field used
to ship copy like `Your flight undefined is confirmed!` straight to the device.

`packages/backend/src/services/pushCopyAudit.ts` defines the copy contract and
is applied before every delivery.

## Contract

Input:

```ts
auditPushCopy({ title: string; body?: string })
```

`body` may be omitted for title-only pushes. Output:

```ts
{ ok: boolean; findings: PushCopyFinding[] }
```

`ok` is `true` only when `findings` is empty. The audit never throws; callers
decide whether to log, block, or deliver anyway. `PushNotificationService`
currently logs a warning and delivers, so the audit is observability rather than
a hard gate.

## Limits

| Field | Max length | Rationale |
| --- | --- | --- |
| `title` | 65 | Truncated in most lock-screen and banner surfaces. |
| `body` | 240 | Truncated by APNs/FCM collapsed notification lines. |

Limits are exported as `PUSH_COPY_LIMITS` so templates and tests share one
source of truth.

## Findings

| Code | Field | Meaning |
| --- | --- | --- |
| `TITLE_EMPTY` | `title` | Title is empty or whitespace. |
| `BODY_EMPTY` | `body` | A body was provided but is empty or whitespace. |
| `TITLE_TOO_LONG` | `title` | Title exceeds 65 characters. |
| `BODY_TOO_LONG` | `body` | Body exceeds 240 characters. |
| `UNRESOLVED_PLACEHOLDER` | either | Copy still contains `undefined`, `null`, `NaN`, `[object Object]`, `{{token}}`, or `%s`/`%d`. |

## Authoring checklist

1. Every interpolated field must be present for the notification type, or the
   template must supply a fallback (for example `gate ?? "TBD"`).
2. Prefer a neutral fallback over an empty string, so the audit does not flag
   `BODY_EMPTY`.
3. Keep titles under 65 characters and bodies under 240 characters.
4. When adding a new `PushNotificationType`, add it to the typed-push table in
   the service's tests and confirm `auditTypedPush(type, data)` passes.

## Tests

`packages/backend/tests/services/pushCopyAudit.test.ts` covers the happy path,
each finding code, and the `auditTypedPush` regression for missing template
data.

```bash
npm test --workspace=packages/backend -- pushCopyAudit
```
