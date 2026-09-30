# Dispute Evidence Upload Validation

Evidence gets attached to a dispute in two places:

- `POST /api/disputes` → `evidence[]` (up to 10 items when the dispute is opened)
- `POST /api/disputes/:id/evidence` → one item per request

The evidence file itself is not uploaded to the backend. Clients pin the file to IPFS and send a
reference to it in `fileUrl`. The backend checks every item in
`src/services/dispute/evidenceValidation.ts` **before anything is written**. If one item on
dispute creation is invalid, no dispute is created.

## Inputs

| Field         | Rules |
|---------------|-------|
| `description` | Required. Request schema: 3–500 chars on create, 5–1000 chars on submit. Leading and trailing whitespace is trimmed, and it must not be blank after trimming. |
| `fileUrl`     | Optional. At most 2048 chars. Surrounding whitespace is trimmed. An empty or blank value means there is no attachment and is stored as `null`. |

### Accepted `fileUrl` forms

| Input                                           | Stored value          |
|-------------------------------------------------|-----------------------|
| Bare CIDv0: `QmYwAPJzv5CZsnAzt8auV2zEJjQ98q2TfGsDz3jAC5vVsx` | `ipfs://QmYw…` |
| Bare CIDv1 (base32): `bafybeigdyrzt5x7g2kqdnmxz2d72nk44w63v3x4jtclq6ln6ai3n6gy2he` | `ipfs://bafy…` |
| `ipfs://<cid>[/path]`                           | unchanged             |
| `https://<gateway>/ipfs/<cid>[/path][?query]`   | unchanged             |

## Error cases

A rejected item returns HTTP `400` with a stable machine-readable `code`:

```json
{ "error": "Evidence gateway URLs must use https", "code": "EVIDENCE_URL_INSECURE_GATEWAY" }
```

| `code`                            | Trigger |
|-----------------------------------|---------|
| `EVIDENCE_DESCRIPTION_EMPTY`      | The description is only whitespace |
| `EVIDENCE_URL_TOO_LONG`           | `fileUrl` is longer than 2048 chars |
| `EVIDENCE_URL_INVALID_CHARACTERS` | Whitespace or control characters inside `fileUrl` |
| `EVIDENCE_URL_INVALID_CID`        | An `ipfs://` URI whose CID is malformed |
| `EVIDENCE_URL_INSECURE_GATEWAY`   | A gateway URL that uses `http://` |
| `EVIDENCE_URL_NOT_IPFS`           | An https URL whose path does not start with `/ipfs/<valid cid>` (for example `https://host/files/ipfs/<cid>` or `https://host/r?to=/ipfs/<cid>`) |
| `EVIDENCE_URL_INVALID_FORMAT`     | Any other scheme (`file:`, `javascript:`, …), free text, or a gateway URL containing credentials |

Errors from the request schema (zod) still return `400` with `{ error: <flattened zod error> }`.
Workflow errors, such as a non-participant submitting evidence or a closed dispute, still return
`400` with `{ error: <message> }` and no `code`.

## Behavior changes from the previous validation

- Before, any `http(s)` URL containing `/ipfs/` anywhere was accepted. Now the URL must use
  https and its path must start with `/ipfs/<valid cid>`.
- Before, `ipfs://` URIs accepted any alphanumeric string. Now they must contain a valid CIDv0
  or base32 CIDv1.
- Before, an invalid evidence URL on `POST /api/disputes` was rejected only after the dispute
  had been saved, which left a dispute with no evidence attached. Validation now runs before the
  dispute is saved.

## Tests

```bash
npm run test -- tests/services/evidenceValidation.test.ts tests/services/disputeService.test.ts
```
