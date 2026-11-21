# Browser origin and security header policy, v1

The backend accepts browser traffic only from an explicit origin allowlist. The same allowlist is used for HTTP CORS and WebSocket handshakes.

## Configuration

| Variable | Default | Behavior |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated HTTPS origins. Takes precedence when set. |
| `CORS_ORIGIN` | `http://localhost:3000` | Legacy single origin fallback. Used when the allowlist is empty. |
| `CSP_REPORT_ONLY` | `true` | `false` sends an enforced `Content-Security-Policy`; `true` sends only `Content-Security-Policy-Report-Only`. |

Production and staging startup fails when:

- the resolved origin list is empty;
- any origin is not HTTPS;
- a wildcard or loopback origin is configured;
- `CSP_REPORT_ONLY` is not `false`.

Development and test keep the localhost fallback and report-only CSP for local iteration.

## Header behavior

`cspMiddleware` is the single owner of the CSP header. Helmet's CSP generation is disabled to prevent two conflicting policies. The CSP uses a per-request nonce, allows the Stellar and Stripe endpoints needed by v1, and includes `upgrade-insecure-requests`.

Helmet still supplies the remaining baseline headers. HSTS is configured explicitly with a one year max age, subdomains, and preload. `Permissions-Policy` denies geolocation, microphone, and camera access and limits payment to Stripe.

## Verification

`packages/backend/tests/security/browserSecurity.test.ts` checks origin parsing, production validation, allowed and denied CORS responses, single-header CSP behavior, nonce generation, HSTS, and Permissions-Policy.
