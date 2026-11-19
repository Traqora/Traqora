# Compose production parity

`docker-compose.prod.yml` is the operator contract for staging and production.

## Inputs

- Required services: `api`, `frontend`, `postgres`, `redis`
- `JWT_SECRET` must be supplied by the environment (no default)
- `NODE_ENV=production` on app services

## Outputs

`node scripts/check-compose-prod-parity.js` exits 0 when the file matches the contract.

## Error cases

- Missing healthchecks
- Publishing Postgres/Redis host ports
- Defaulting `JWT_SECRET`

Run:

```bash
node scripts/check-compose-prod-parity.js
node --test scripts/__tests__/check-compose-prod-parity.test.js
```
