# Traveler profile KYC checklist

`GET /api/v1/users/profile` returns a privacy-safe KYC checklist for the authenticated traveler's mobile profile. It is derived from that wallet's non-deleted travel documents; the response never includes document numbers, names, or other document data.

## Contract

### Input

Send a valid bearer token. The endpoint takes no path, query, or body parameters and always uses the token's wallet address. Unauthenticated requests return `401`.

### Output

The existing profile response has an additional `kycChecklist` object:

```json
{
  "status": "pending",
  "items": {
    "identityDocument": true,
    "identityVerified": false
  }
}
```

`items.identityDocument` is true when the traveler has at least one non-deleted travel document. `items.identityVerified` is true when any such document has `verificationStatus: "verified"`.

| Status | Meaning | Mobile action |
| --- | --- | --- |
| `not_started` | No document is on file. | Prompt the traveler to add an identity document. |
| `pending` | A document exists but none is verified. | Show verification is in progress. |
| `verified` | At least one document is verified. | Mark the KYC checklist complete. |
| `rejected` | No document is verified and at least one is rejected. | Ask the traveler to replace the rejected document. |

`verified` takes precedence when documents have mixed statuses. A rejected document takes precedence over pending/unverified documents when none is verified.

### Error cases

* `401` — missing, invalid, or expired bearer token.
* `500` — the profile or document store cannot be read. Follow the standard API error envelope and retry only when its `retryable` flag permits it.

## Operator notes

The checklist is read-only. Document creation and verification remain owned by the existing travel-document workflow. Do not use this response as a source of document details or as evidence of a particular identity document; use the authorized document-management and review flows instead.
