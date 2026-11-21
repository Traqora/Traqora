#!/usr/bin/env bash
set -euo pipefail

# Seeds a staging environment with deterministic Traqora fixtures (issue #749).
#
# The heavy lifting (fixture generation, guards, database writes) lives in
# `packages/backend/src/db/seeds/seedStaging.ts`. This wrapper owns the parts an
# operator should not have to remember: toolchain checks, environment
# validation, pending migrations, and a stable exit-code contract.
#
# Usage:
#   ./scripts/seed-staging.sh [options]
#
# Options:
#   -e, --environment <env>   local | staging | production (default: staging)
#       --volume <n>          synthetic flights to generate (1-20000, default 250)
#       --only <list>         comma-separated subset of admin,users,flights,bookings
#       --password <pw>       password for the seeded super admin
#       --dry-run             validate and print the plan without writing
#       --reset               delete the rows owned by this seeder first
#       --allow-production    permit --environment production
#       --seed <n>            deterministic PRNG seed
#       --skip-migrations     do not run pending TypeORM migrations first
#   -h, --help                show this help
#
# Environment:
#   DATABASE_URL             required; PostgreSQL connection string
#   SEED_ADMIN_PASSWORD      default for --password
#   SEED_RANDOM_SEED         default for --seed
#   SEED_NOW                 fixed clock (ISO-8601) so timestamps are reproducible
#
# Exit codes:
#   0  seeded successfully (or --help)
#   1  refused or failed
#   2  usage error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/packages/backend"

ENVIRONMENT="${SEED_ENVIRONMENT:-staging}"
VOLUME="${SEED_VOLUME:-250}"
ONLY="${SEED_ONLY:-}"
PASSWORD="${SEED_ADMIN_PASSWORD:-}"
DRY_RUN=0
RESET=0
ALLOW_PRODUCTION=0
SEED_VALUE="${SEED_RANDOM_SEED:-}"
NOW="${SEED_NOW:-}"
SKIP_MIGRATIONS=0

usage() {
    # Same idiom as rollback-backend.sh, minus the shebang line.
    grep '^#' "$0" | grep -v '^#!/' | sed 's/^#//; s/^ //'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -e|--environment)
            ENVIRONMENT="${2:-}"
            shift 2
            ;;
        --volume)
            VOLUME="${2:-}"
            shift 2
            ;;
        --only)
            ONLY="${2:-}"
            shift 2
            ;;
        --password)
            PASSWORD="${2:-}"
            shift 2
            ;;
        --seed)
            SEED_VALUE="${2:-}"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --reset)
            RESET=1
            shift
            ;;
        --allow-production)
            ALLOW_PRODUCTION=1
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=1
            shift
            ;;
        *)
            echo "Error: unknown option '$1'" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "${ENVIRONMENT}" ]]; then
    echo "Error: --environment requires a value" >&2
    exit 2
fi
case "$ENVIRONMENT" in
    local|staging|production) ;;
    *)
        echo "Error: --environment must be one of local, staging, production (got '$ENVIRONMENT')" >&2
        exit 2
        ;;
esac

# A missing DATABASE_URL must not fall through to the application's
# `sqlite::memory:` default: seeding a throwaway database is never the intent.
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Error: DATABASE_URL is required (PostgreSQL connection string)." >&2
    exit 1
fi
if [[ "$DATABASE_URL" == sqlite:* ]]; then
    echo "Error: DATABASE_URL must be a PostgreSQL connection string, got '$DATABASE_URL'" >&2
    exit 1
fi

# The TypeScript entrypoint repeats this guard, but failing here keeps the
# operator from waiting on a ts-node boot to be told no.
if [[ "$ENVIRONMENT" == "production" && "$ALLOW_PRODUCTION" -eq 0 ]]; then
    echo "Error: refusing to seed the \"production\" environment — pass --allow-production if this is intentional." >&2
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "Error: node is required and was not found on PATH." >&2
    exit 1
fi

# The seeder writes through the application's own TypeORM data source, which
# validates the full config on load. A dry run never opens the data source, so
# it does not need them.
if [[ "$DRY_RUN" -eq 0 ]]; then
    REQUIRED_CONTRACT_VARS=(
        BOOKING_CONTRACT_ID
        AIRLINE_CONTRACT_ID
        REFUND_CONTRACT_ID
        LOYALTY_CONTRACT_ID
        GOVERNANCE_CONTRACT_ID
        TOKEN_CONTRACT_ID
        FLIGHT_REGISTRY_CONTRACT_ID
    )
    UNRESOLVED_CONTRACTS=()
    for var_name in "${REQUIRED_CONTRACT_VARS[@]}"; do
        var_value="${!var_name:-}"
        if [[ -z "$var_value" || "$var_value" == "DEFAULT_ID" ]]; then
            UNRESOLVED_CONTRACTS+=("$var_name")
        fi
    done
    if [[ ${#UNRESOLVED_CONTRACTS[@]} -gt 0 ]]; then
        echo "Error: these contract IDs must be set to the deployed addresses before seeding:" >&2
        printf '  - %s\n' "${UNRESOLVED_CONTRACTS[@]}" >&2
        exit 1
    fi
fi

if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "Error: backend workspace not found at $BACKEND_DIR" >&2
    exit 1
fi

cd "$BACKEND_DIR"

if [[ ! -d node_modules ]]; then
    echo "Error: dependencies are not installed. Run 'npm ci --legacy-peer-deps' from $PROJECT_DIR first." >&2
    exit 1
fi

echo "=== Staging Seed: $ENVIRONMENT ==="
echo "Database: $(echo "$DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:***@#')"
echo ""

SEED_ARGS=(--environment "$ENVIRONMENT" --volume "$VOLUME")
[[ -n "$ONLY" ]] && SEED_ARGS+=(--only "$ONLY")
[[ -n "$PASSWORD" ]] && SEED_ARGS+=(--password "$PASSWORD")
[[ -n "$SEED_VALUE" ]] && SEED_ARGS+=(--seed "$SEED_VALUE")
[[ -n "$NOW" ]] && SEED_ARGS+=(--now "$NOW")
[[ "$DRY_RUN" -eq 1 ]] && SEED_ARGS+=(--dry-run)
[[ "$RESET" -eq 1 ]] && SEED_ARGS+=(--reset)
[[ "$ALLOW_PRODUCTION" -eq 1 ]] && SEED_ARGS+=(--allow-production)
[[ "$SKIP_MIGRATIONS" -eq 1 ]] && SEED_ARGS+=(--skip-migrations)

# Pending migrations are applied in-process by the seeder, through the same
# TypeORM data source the application uses on boot, so a fresh database needs no
# separate `npm run migration:run` step first.
set +e
npm run --silent db:seed:staging -- "${SEED_ARGS[@]}"
STATUS=$?
set -e

echo ""
if [ "$STATUS" -eq 0 ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "=== Staging Seed DRY RUN PASSED (no rows written) ==="
    else
        echo "=== Staging Seed PASSED ==="
    fi
    exit 0
fi

echo "=== Staging Seed FAILED (exit $STATUS) ===" >&2
exit "$STATUS"
