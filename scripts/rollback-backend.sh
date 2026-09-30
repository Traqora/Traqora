#!/usr/bin/env bash
# rollback-backend.sh — health-triggered rollback of a *backend application*
# deployment (docker-compose stack), with alerting. This is the
# "unhealthy deploy -> roll back and alert" half of issue #589; the
# sibling `scripts/rollback.sh` handles on-chain Soroban *contract*
# rollbacks and is unrelated.
#
# Usage:
#   rollback-backend.sh <environment> <previous_tag> [options]
#
# Arguments:
#   environment      docker-compose.prod.yml profile to target
#                     (e.g. staging, production)
#   previous_tag     image tag to roll back to
#
# Options:
#   --api-url <url>       URL to health-check (default: http://localhost:3001)
#   --dry-run             Print the plan and exit 0 without touching
#                          docker compose or sending a real alert.
#   --force               Roll back even if the current deployment reports
#                          healthy (useful for manual/drill invocations).
#
# Env vars:
#   SLACK_WEBHOOK_URL   optional; if set, a Slack alert is posted on both
#                       rollback start and outcome.
#
# Exit codes:
#   0  nothing to do (already healthy) or rollback verified healthy
#   1  rollback attempted but the service is still unhealthy afterwards
#   2  usage error
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

API_URL="http://localhost:3001"
DRY_RUN=0
FORCE=0
POSITIONAL=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-url)
            API_URL="${2:-}"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --force)
            FORCE=1
            shift
            ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^#//; s/^ //'
            exit 0
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

ENVIRONMENT="${POSITIONAL[0]:-}"
PREVIOUS_TAG="${POSITIONAL[1]:-}"

if [ -z "$ENVIRONMENT" ] || [ -z "$PREVIOUS_TAG" ]; then
    echo "Usage: $0 <environment> <previous_tag> [--api-url <url>] [--dry-run] [--force]" >&2
    exit 2
fi

alert() {
    local message="$1"
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "[dry-run] Would send alert: $message"
        return 0
    fi
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -sf -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"$message\"}" >/dev/null || \
            echo "Warning: failed to post alert to SLACK_WEBHOOK_URL" >&2
    else
        echo "Alert (no SLACK_WEBHOOK_URL configured): $message"
    fi
}

check_health() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL/health" 2>/dev/null || echo "000")
    [ "$http_code" = "200" ] || [ "$http_code" = "204" ]
}

echo "=== Backend Rollback Check: $ENVIRONMENT ==="
echo "Health endpoint: $API_URL/health"
echo "Rollback target tag: $PREVIOUS_TAG"
[ "$DRY_RUN" -eq 1 ] && echo "Mode: DRY RUN (no changes will be made)"
echo ""

if check_health; then
    echo "✓ Current deployment is healthy."
    if [ "$FORCE" -ne 1 ]; then
        echo "Nothing to do. (Pass --force to roll back anyway, e.g. for a drill.)"
        exit 0
    fi
    echo "--force set: proceeding with rollback despite healthy status."
else
    echo "✗ Current deployment is UNHEALTHY."
fi

echo ""
echo "=== Rolling back $ENVIRONMENT to tag $PREVIOUS_TAG ==="
alert ":rotating_light: Traqora $ENVIRONMENT deployment unhealthy — rolling back to \`$PREVIOUS_TAG\`."

if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] Would run:"
    echo "[dry-run]   IMAGE_TAG=$PREVIOUS_TAG docker compose -f docker-compose.prod.yml --profile $ENVIRONMENT up -d --wait --wait-timeout 120"
    echo "[dry-run]   curl -sf $API_URL/health"
    echo ""
    echo "=== Dry run complete: rollback plan is valid ==="
    exit 0
fi

cd "$PROJECT_DIR"
IMAGE_TAG="$PREVIOUS_TAG" docker compose -f docker-compose.prod.yml \
    --profile "$ENVIRONMENT" up -d --wait --wait-timeout 120

echo ""
echo "=== Verifying rollback ==="
RETRIES=6
until check_health || [ "$RETRIES" -eq 0 ]; do
    RETRIES=$((RETRIES - 1))
    echo "Not healthy yet, retrying in 5s ($RETRIES left)..."
    sleep 5
done

if check_health; then
    echo "✓ Rollback verified: $API_URL/health is healthy on tag $PREVIOUS_TAG."
    alert ":white_check_mark: Traqora $ENVIRONMENT rollback to \`$PREVIOUS_TAG\` succeeded."
    exit 0
else
    echo "✗ Rollback FAILED: service is still unhealthy after rolling back to $PREVIOUS_TAG."
    alert ":x: Traqora $ENVIRONMENT rollback to \`$PREVIOUS_TAG\` FAILED — service still unhealthy. Manual intervention required."
    exit 1
fi
