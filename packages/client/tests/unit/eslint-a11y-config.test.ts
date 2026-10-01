/**
 * Unit tests for the client ESLint a11y configuration contract.
 *
 * Contract: packages/client/.eslintrc.json MUST explicitly configure the
 * jsx-a11y rules listed below so that static accessibility violations are
 * caught at lint time — before code reaches review or CI tests.
 *
 * Why a test for config?
 * ─────────────────────
 * `eslint-config-next` bundles `eslint-plugin-jsx-a11y` but exposes only a
 * subset of its rules in "warn" mode. Issue #719 requires the project to
 * graduate the most critical rules to "error" so lint failures block merges.
 * This test makes that expectation explicit and prevents accidental removal.
 *
 * Scope: reads the JSON file from disk; does NOT spawn ESLint (fast, no
 * extra dependencies, deterministic in jsdom).
 */
import fs from "fs"
import path from "path"

// Resolve the config relative to this file so the test works from any cwd.
const CONFIG_PATH = path.resolve(__dirname, "../../.eslintrc.json")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface EslintConfig {
  extends?: string | string[]
  rules?: Record<string, string | number | unknown[]>
}

function loadConfig(): EslintConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8")
  return JSON.parse(raw) as EslintConfig
}

/** Normalise a rule value to a severity string for easy assertion. */
function severity(value: unknown): "off" | "warn" | "error" | "unknown" {
  if (value === 0 || value === "off") return "off"
  if (value === 1 || value === "warn") return "warn"
  if (value === 2 || value === "error") return "error"
  // Array form: ["error", ...options]
  if (Array.isArray(value)) return severity(value[0])
  return "unknown"
}

// ---------------------------------------------------------------------------
// Contract: required rules and their minimum severity
// ---------------------------------------------------------------------------
const REQUIRED_ERRORS: string[] = [
  "jsx-a11y/alt-text",
  "jsx-a11y/anchor-has-content",
  "jsx-a11y/aria-props",
  "jsx-a11y/aria-proptypes",
  "jsx-a11y/aria-unsupported-elements",
  "jsx-a11y/role-has-required-aria-props",
  "jsx-a11y/role-supports-aria-props",
]

const REQUIRED_AT_LEAST_WARN: string[] = [
  "jsx-a11y/tabindex-no-positive",
  "jsx-a11y/no-autofocus",
  "jsx-a11y/interactive-supports-focus",
]

// ---------------------------------------------------------------------------
// Happy path: config file is well-formed and extends Next.js
// ---------------------------------------------------------------------------
describe("packages/client/.eslintrc.json", () => {
  let config: EslintConfig

  beforeAll(() => {
    config = loadConfig()
  })

  it("exists and is valid JSON", () => {
    expect(config).toBeDefined()
    expect(typeof config).toBe("object")
  })

  it('extends "next/core-web-vitals"', () => {
    const extendsField = Array.isArray(config.extends)
      ? config.extends
      : [config.extends]
    expect(extendsField).toContain("next/core-web-vitals")
  })

  it("has a rules section", () => {
    expect(config.rules).toBeDefined()
    expect(typeof config.rules).toBe("object")
  })

  // ── Error-level rules ────────────────────────────────────────────────────
  describe("error-level jsx-a11y rules", () => {
    for (const rule of REQUIRED_ERRORS) {
      it(`sets "${rule}" to "error"`, () => {
        const value = config.rules?.[rule]
        expect(
          severity(value),
          `Expected "${rule}" to be "error" but got "${severity(value)}". ` +
            `Add '  "${rule}": "error"' to packages/client/.eslintrc.json.`,
        ).toBe("error")
      })
    }
  })

  // ── Warn-level rules (minimum bar) ───────────────────────────────────────
  describe("warn-or-error level jsx-a11y rules", () => {
    for (const rule of REQUIRED_AT_LEAST_WARN) {
      it(`sets "${rule}" to at least "warn"`, () => {
        const value = config.rules?.[rule]
        const sev = severity(value)
        expect(
          ["warn", "error"].includes(sev),
          `Expected "${rule}" to be "warn" or "error" but got "${sev}". ` +
            `Add '  "${rule}": "warn"' to packages/client/.eslintrc.json.`,
        ).toBe(true)
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Failure-mode test: simulates a config where the rules have been removed,
// verifying that the assertions above would catch the regression.
// ---------------------------------------------------------------------------
describe("eslint-a11y-config – regression guard", () => {
  it("detects a misconfigured rule (severity = off)", () => {
    // If someone sets a rule to "off" the severity helper must return "off"
    // and the standard assertion above (toBe("error")) would fail.
    expect(severity("off")).toBe("off")
    expect(severity(0)).toBe("off")
  })

  it("detects a missing rule (undefined)", () => {
    // An undefined rule means it was removed from the config.
    expect(severity(undefined)).toBe("unknown")
  })

  it("handles array-form rule values correctly", () => {
    // Rules can be written as ["error", { option: true }].
    expect(severity(["error", { someOption: true }])).toBe("error")
    expect(severity(["warn"])).toBe("warn")
    expect(severity(["off"])).toBe("off")
  })
})
