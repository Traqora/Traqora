#!/usr/bin/env bash
#
# Dependency audit runner (#777) — npm + cargo audits behind one resumable
# entry point with a stable, testable exit-code contract.
#
# Contract
# --------
# Inputs (environment, all optional):
#   AUDIT_TARGETS        comma list to run: "npm", "cargo" (default "npm,cargo")
#   AUDIT_LEVEL          npm audit level that fails the run
#                        (default "high"; low|moderate|high|critical)
#   AUDIT_RESUME         "true" (default): skip a target that already passed for
#                        the SAME lockfile hash (state under AUDIT_STATE_DIR).
#                        "false" forces a fresh run. Failed targets never leave
#                        resume state, so they always re-run.
#   AUDIT_STATE_DIR      resume/summary directory (default ".audit-state")
#   AUDIT_NPM_DIR        directory holding package-lock.json (default ".")
#   AUDIT_CARGO_DIR      directory holding Cargo.lock (default "contracts")
#   AUDIT_NPM_CMD        npm binary to invoke (default "npm")
#   AUDIT_CARGO_CMD      cargo-audit binary to invoke (default "cargo-audit")
#   AUDIT_REQUIRE_CARGO  "true": missing cargo-audit is a hard error (2)
#                        instead of a documented skip (0)
#   AUDIT_NPM_ARGS       extra npm audit args (default "--package-lock-only")
#
# Outputs:
#   human-readable per-target lines + final "SUMMARY: overall=<code> ..." line
#   ${AUDIT_STATE_DIR}/<target>.json — {target,key,status,finishedAt}
#
# Exit codes (consumed by .github/workflows/security-audit.yml and operators):
#   0  all requested audits passed (or were validly resumed)
#   1  at least one audit found vulnerabilities at/above AUDIT_LEVEL
#   2  tooling/config error: audit binary missing (when required) or lockfile
#      missing, or an unknown AUDIT_TARGETS entry
#   3  resume state exists but is unreadable/corrupted (delete the state dir
#      or set AUDIT_RESUME=false)
#
# Self-test (regression coverage — happy path + key failure modes):
#   bash scripts/audit/audit-deps.sh --self-test
#   Runs the contract assertions below against stubbed audit commands in a
#   temp dir and exits non-zero on any failure.

set -uo pipefail

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

AUDIT_TARGETS="${AUDIT_TARGETS:-npm,cargo}"
AUDIT_LEVEL="${AUDIT_LEVEL:-high}"
AUDIT_RESUME="${AUDIT_RESUME:-true}"
AUDIT_STATE_DIR="${AUDIT_STATE_DIR:-.audit-state}"
AUDIT_NPM_DIR="${AUDIT_NPM_DIR:-.}"
AUDIT_CARGO_DIR="${AUDIT_CARGO_DIR:-contracts}"
AUDIT_NPM_CMD="${AUDIT_NPM_CMD:-npm}"
AUDIT_CARGO_CMD="${AUDIT_CARGO_CMD:-cargo-audit}"
AUDIT_REQUIRE_CARGO="${AUDIT_REQUIRE_CARGO:-false}"
AUDIT_NPM_ARGS="${AUDIT_NPM_ARGS:---package-lock-only}"

STATE_CORRUPTED=0

# ── state helpers ────────────────────────────────────────────────────────────

state_file_for() { printf '%s/%s.json' "$AUDIT_STATE_DIR" "$1"; }

lockfile_key() { # lockfile_key <file> → sha256, or "-" when absent/empty
  if [ -s "$1" ]; then
    sha256sum "$1" | cut -d' ' -f1
  else
    printf '-'
  fi
}

# state_get_pass <target> <key>: returns 0 when stored state records a pass for
# exactly this lockfile hash. Flags STATE_CORRUPTED=1 for unreadable state.
state_get_pass() {
  local file key status
  file="$(state_file_for "$1")"
  [ -f "$file" ] || return 1
  if [ ! -r "$file" ]; then
    STATE_CORRUPTED=1
    return 1
  fi
  key="$(sed -n 's/.*"key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1)"
  status="$(sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1)"
  if [ -z "$key" ] || [ -z "$status" ]; then
    STATE_CORRUPTED=1
    return 1
  fi
  [ "$key" = "$2" ] && [ "$status" = "pass" ]
}

state_write_pass() { # state_write_pass <target> <key>
  mkdir -p "$AUDIT_STATE_DIR"
  printf '{\n  "target": "%s",\n  "key": "%s",\n  "status": "pass",\n  "finishedAt": "%s"\n}\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$(state_file_for "$1")"
}

# ── audit runners (each: 0 pass / 1 vulnerabilities / 2 tooling error) ──────

run_npm_audit() {
  if ! command -v "$AUDIT_NPM_CMD" >/dev/null 2>&1; then
    echo "[npm] tooling error: '$AUDIT_NPM_CMD' not found" >&2
    return 2
  fi
  if [ ! -f "$AUDIT_NPM_DIR/package-lock.json" ]; then
    echo "[npm] tooling error: $AUDIT_NPM_DIR/package-lock.json not found" >&2
    return 2
  fi
  (
    cd "$AUDIT_NPM_DIR" &&
      "$AUDIT_NPM_CMD" audit $AUDIT_NPM_ARGS --audit-level="$AUDIT_LEVEL"
  ) >/dev/null 2>&1
}

run_cargo_audit() {
  if ! command -v "$AUDIT_CARGO_CMD" >/dev/null 2>&1; then
    if [ "$AUDIT_REQUIRE_CARGO" = "true" ]; then
      echo "[cargo] tooling error: '$AUDIT_CARGO_CMD' not found (AUDIT_REQUIRE_CARGO=true)" >&2
      return 2
    fi
    echo "[cargo] '$AUDIT_CARGO_CMD' not found — skipping (set AUDIT_REQUIRE_CARGO=true to hard-fail)"
    return 0
  fi
  if [ ! -f "$AUDIT_CARGO_DIR/Cargo.lock" ]; then
    echo "[cargo] tooling error: $AUDIT_CARGO_DIR/Cargo.lock not found" >&2
    return 2
  fi
  (
    cd "$AUDIT_CARGO_DIR" &&
      "$AUDIT_CARGO_CMD"
  ) >/dev/null 2>&1
}

# run_target <name> <runner-fn> <lockfile>
run_target() {
  local name="$1" runner="$2" lockfile="$3" key rc
  key="$(lockfile_key "$lockfile")"

  if [ "$AUDIT_RESUME" = "true" ]; then
    if state_get_pass "$name" "$key"; then
      echo "[$name] SKIPPED (resume: already passed for lockfile ${key:0:12}…)"
      return 0
    fi
  fi

  echo "[$name] running…"
  "$runner"
  rc=$?

  if [ "$rc" -eq 0 ]; then
    state_write_pass "$name" "$key"
    echo "[$name] PASS"
  else
    echo "[$name] FAIL (exit $rc)"
  fi
  return "$rc"
}

# ── main ─────────────────────────────────────────────────────────────────────

main() {
  if [ "${1:-}" = "--self-test" ]; then
    self_test
    return $?
  fi

  local overall=0 rc name runner lockfile
  local name_list=()
  IFS=',' read -r -a name_list <<<"$AUDIT_TARGETS"

  # Upfront corruption probe: a resumable run with unreadable state is fatal.
  if [ "$AUDIT_RESUME" = "true" ]; then
    for name in "${name_list[@]}"; do
      name="$(printf '%s' "$name" | tr -d '[:space:]')"
      case "$name" in
        npm) lockfile="$AUDIT_NPM_DIR/package-lock.json" ;;
        cargo) lockfile="$AUDIT_CARGO_DIR/Cargo.lock" ;;
        *) continue ;;
      esac
      STATE_CORRUPTED=0
      state_get_pass "$name" "$(lockfile_key "$lockfile")" >/dev/null 2>&1
      if [ "$STATE_CORRUPTED" -eq 1 ]; then
        echo "SUMMARY: corrupted audit state under $AUDIT_STATE_DIR — delete it or set AUDIT_RESUME=false" >&2
        return 3
      fi
    done
  fi

  for name in "${name_list[@]}"; do
    name="$(printf '%s' "$name" | tr -d '[:space:]')"
    case "$name" in
      npm)
        runner=run_npm_audit
        lockfile="$AUDIT_NPM_DIR/package-lock.json"
        ;;
      cargo)
        runner=run_cargo_audit
        lockfile="$AUDIT_CARGO_DIR/Cargo.lock"
        ;;
      *)
        echo "Unknown AUDIT_TARGETS entry: '$name' (expected npm and/or cargo)" >&2
        return 2
        ;;
    esac

    run_target "$name" "$runner" "$lockfile"
    rc=$?
    # Last failure wins; the SUMMARY line always reports the final code.
    [ "$rc" -ne 0 ] && overall=$rc
  done

  echo "SUMMARY: overall=$overall targets=$AUDIT_TARGETS level=$AUDIT_LEVEL resume=$AUDIT_RESUME state=$AUDIT_STATE_DIR"
  return "$overall"
}

# ── self-test (#777 regression coverage) ─────────────────────────────────────
# Asserts the exit-code contract against stubbed audit commands in a temp dir.

SELF_TEST_TMP=""

cleanup_self_test() {
  [ -n "$SELF_TEST_TMP" ] && rm -rf "$SELF_TEST_TMP"
}

self_test() {
  local failures=0
  SELF_TEST_TMP="$(mktemp -d)"
  local tmp="$SELF_TEST_TMP"
  trap cleanup_self_test EXIT

  check() { # check <name> <expected> <actual>
    if [ "$2" = "$3" ]; then
      echo "self-test PASS: $1"
    else
      echo "self-test FAIL: $1 (expected '$2', got '$3')" >&2
      failures=$((failures + 1))
    fi
  }

  local stub_bin="$tmp/bin"
  mkdir -p "$stub_bin"
  printf '#!/usr/bin/env bash\nexit 0\n' >"$stub_bin/npm"
  printf '#!/usr/bin/env bash\nexit 0\n' >"$stub_bin/cargo-audit"
  chmod +x "$stub_bin/npm" "$stub_bin/cargo-audit"
  printf '{"name":"t","lockfileVersion":3}\n' >"$tmp/package-lock.json"
  printf '{"v":1}\n' >"$tmp/Cargo.lock"

  # 1. Happy path: both audits pass → exit 0, state records passes.
  (
    cd "$tmp" &&
      PATH="$stub_bin:$PATH" AUDIT_STATE_DIR="$tmp/state" AUDIT_RESUME=false \
        AUDIT_NPM_DIR=. AUDIT_CARGO_DIR=. \
        bash "$SCRIPT_PATH" >/dev/null 2>&1
  )
  check "happy path exits 0" "0" "$?"
  [ -f "$tmp/state/npm.json" ] && check "npm state written" "yes" "yes" ||
    check "npm state written" "yes" "no"
  [ -f "$tmp/state/cargo.json" ] && check "cargo state written" "yes" "yes" ||
    check "cargo state written" "yes" "no"

  # 2. Resume: rerun skips both targets (stubs removed from PATH on purpose —
  #    a resumed run must not need the audit tools at all).
  (
    cd "$tmp" &&
      AUDIT_STATE_DIR="$tmp/state" AUDIT_RESUME=true AUDIT_NPM_DIR=. AUDIT_CARGO_DIR=. \
        AUDIT_NPM_CMD=definitely-missing-npm AUDIT_CARGO_CMD=definitely-missing-cargo-audit \
        bash "$SCRIPT_PATH" >/dev/null 2>&1
  )
  check "resume skips passing targets (exit 0 without audit tools)" "0" "$?"

  # 3. FAILURE MODE: npm audit reports vulnerabilities → exit 1.
  printf '#!/usr/bin/env bash\nexit 1\n' >"$stub_bin/npm"
  (
    cd "$tmp" &&
      PATH="$stub_bin:$PATH" AUDIT_STATE_DIR="$tmp/state" AUDIT_RESUME=false AUDIT_TARGETS=npm \
        AUDIT_NPM_DIR=. AUDIT_CARGO_DIR=. \
        bash "$SCRIPT_PATH" >/dev/null 2>&1
  )
  check "npm audit failure exits 1" "1" "$?"

  # 4. FAILURE MODE: missing lockfile → tooling error, exit 2.
  (
    cd "$tmp" &&
      mv package-lock.json package-lock.json.bak &&
      {
        PATH="$stub_bin:$PATH" AUDIT_STATE_DIR="$tmp/state" AUDIT_RESUME=false \
          AUDIT_TARGETS=npm AUDIT_NPM_DIR=. AUDIT_CARGO_DIR=. \
          bash "$SCRIPT_PATH" >/dev/null 2>&1
      }
    rc=$?
    mv package-lock.json.bak package-lock.json
    exit "$rc"
  )
  check "missing lockfile exits 2" "2" "$?"

  # 5. FAILURE MODE: corrupted resume state → exit 3.
  printf 'not json {{{' >"$tmp/state/npm.json"
  (
    cd "$tmp" &&
      AUDIT_STATE_DIR="$tmp/state" AUDIT_RESUME=true AUDIT_NPM_DIR=. AUDIT_CARGO_DIR=. \
        bash "$SCRIPT_PATH" >/dev/null 2>&1
  )
  check "corrupted state exits 3" "3" "$?"

  # 6. FAILURE MODE: unknown target → exit 2.
  (
    cd "$tmp" &&
      AUDIT_STATE_DIR="$tmp/state2" AUDIT_RESUME=false AUDIT_TARGETS=bogus \
        AUDIT_NPM_DIR=. AUDIT_CARGO_DIR=. \
        bash "$SCRIPT_PATH" >/dev/null 2>&1
  )
  check "unknown target exits 2" "2" "$?"

  if [ "$failures" -eq 0 ]; then
    echo "self-test: ALL PASS"
    return 0
  fi
  echo "self-test: $failures failure(s)" >&2
  return 1
}

main "$@"
