# Environment Variable Docs

[`docs/ENV_REFERENCE.md`](../../../docs/ENV_REFERENCE.md) is the single table of every
environment variable. It is **generated** from the annotated `env.example` files. Do not edit
it by hand.

- Parser and renderer (pure functions, no file access): `src/config/envReference.ts`
- Command-line script: `scripts/env-reference.ts`

| Command (run in `packages/backend`) | What it does |
|---|---|
| `npm run docs:env` | Regenerates `docs/ENV_REFERENCE.md` |
| `npm run verify:env-docs` | Fails if `env.example` has format errors or the reference page is out of date |
| `npm run verify:env-docs -- --strict` | Also fails when `src/config/index.ts` reads a variable that `packages/backend/env.example` does not document |

`npm run test` also runs `tests/config/envReference.test.ts`, which fails when the reference
page is out of date.

## Inputs

These files are read, in this order:

1. `env.example` (repo root: shared and client config)
2. `packages/backend/env.example`

Each variable needs a comment block directly above it. A blank line ends the block.

```bash
# ==============================================================================
# 1. SERVER CONFIGURATION            <- section title, between two # ==== or # ---- lines
# ==============================================================================

# The port the backend server will listen on.     <- description (one or more lines, required)
# Type: [Number] | Default: 3001                  <- type line (required); "| Default:" is optional
# Example: PORT=8080                              <- optional, added to the description
PORT=3001                                         <- active variable

# Sentry org/project — only needed for source-map upload.
# Type: [String] | Default: (None)
# SENTRY_ORG=                                     <- commented out: listed as optional
# SENTRY_PROJECT=                                 <- several variables can share one block
```

## Output

`docs/ENV_REFERENCE.md` has one `##` heading per source file and one `###` table per section:

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `PORT` | Number | 3001 | The port the backend server will listen on. |
| `SENTRY_ORG` *(commented out)* | String | (None) | Sentry org/project — only needed for source-map upload. |

`|` characters inside cells are escaped, and an empty cell is shown as `—`.

## Error cases

The check fails with `file:line [CODE] message` for any of these:

| Code | Cause |
|------|-------|
| `MISSING_DESCRIPTION` | There is no comment text above the variable |
| `MISSING_TYPE` | There is no `# Type: [...]` line in the block |
| `DUPLICATE_VARIABLE` | The same variable appears twice in one file. The first one is kept |
| *(stale)* | `docs/ENV_REFERENCE.md` does not match the output generated from the current `env.example` files |
| *(undocumented, `--strict` only)* | `src/config/index.ts` reads a `process.env.X` that `packages/backend/env.example` does not document |

Undocumented variables are only a **warning** unless `--strict` is passed. When this change was
made, 29 variables read by `config/index.ts` were not documented, including `ENCRYPTION_KEY`,
`FRONTEND_URL`, the `SMTP_*` and `STRIPE_*` variables, and the `RATE_LIMIT_{FREE,PRO,ENT}_*`
tiers. Once they are documented, `--strict` can be turned on in CI.

## Adding a variable

1. Add a comment block and the variable to the correct section of the right `env.example`.
2. Run `npm run docs:env` in `packages/backend`.
3. Commit the `env.example` change and the regenerated `docs/ENV_REFERENCE.md` together.
