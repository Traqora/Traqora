# Accessibility Contract — `packages/client`

> Related issue: #719 — Client unit a11y tests

This document defines the accessibility (a11y) contract for the Traqora client
application and serves as a reference for operators, contributors, and reviewers.

---

## Guiding Principle

Every interactive surface shipped to users MUST be operable by keyboard-only
users and understandable by screen-reader users. Violations are defects, not
style issues.

---

## Contract Layers

The a11y guarantees are enforced at three layers, each described below.

### 1. Static Lint (ESLint / jsx-a11y)

**Relevant file:** `packages/client/.eslintrc.json`

`eslint-config-next` bundles `eslint-plugin-jsx-a11y`. The `.eslintrc.json`
explicitly promotes the most critical rules from their default warn-level to
`"error"` so that violations fail the lint step in CI and are blocked before
review.

**Error-level rules (block merge):**

| Rule | What it catches |
|---|---|
| `jsx-a11y/alt-text` | `<img>` / `<area>` / `<input type=image>` without an `alt` attribute |
| `jsx-a11y/anchor-has-content` | `<a>` tags with no visible or ARIA text content |
| `jsx-a11y/aria-props` | Typos in `aria-*` attribute names |
| `jsx-a11y/aria-proptypes` | Invalid values for `aria-*` attributes |
| `jsx-a11y/aria-unsupported-elements` | ARIA attributes placed on elements that do not support them |
| `jsx-a11y/role-has-required-aria-props` | ARIA roles used without required companion attributes |
| `jsx-a11y/role-supports-aria-props` | Invalid `aria-*` attributes on a given role |

**Warn-level rules (surfaced, not blocking):**

| Rule | What it catches |
|---|---|
| `jsx-a11y/tabindex-no-positive` | Positive `tabindex` values that break natural tab order |
| `jsx-a11y/no-autofocus` | `autoFocus` props that can confuse AT users |
| `jsx-a11y/interactive-supports-focus` | Interactive elements that are not focusable |

**Run locally:**
```bash
npm run lint --workspace=packages/client
```

**Lint contract test:** `tests/unit/eslint-a11y-config.test.ts`  
Verifies that the rules above are present and at the correct severity in the
config file. Run as part of `npm test`.

---

### 2. Unit Tests (Jest / @testing-library)

**Relevant files:**
- `tests/accessibility.test.ts` — tests every function exported from `lib/accessibility.ts`
- `tests/unit/skip-nav.test.tsx` — tests the `SkipNav` component contract

**Run locally:**
```bash
npm test --workspace=packages/client
```

#### `lib/accessibility.ts` — utility contract

| Export | Contract |
|---|---|
| `A11Y_KEYBOARD_KEYS` | Constant map of WCAG keyboard key names |
| `handleKeyboardNavigation` | Dispatches `KeyboardEvent` to the handler registered for `event.key`; no-ops on unregistered keys |
| `isVisible` | Returns `false` for `hidden`, `aria-hidden="true"`, `display:none`, `visibility:hidden`, `disabled`, or zero-size elements |
| `getFocusableElements` | Returns all visible, focusable descendants in DOM order; excludes `aria-hidden` and `disabled` elements |
| `setInitialFocus` | Focuses `preferredSelector` if visible; falls back to first focusable child; sets `tabindex="-1"` and focuses container as last resort |
| `restoreFocus` | Calls `.focus()` on the provided element; no-ops on `null` |
| `announce` | Creates or reuses an `aria-live` region with `aria-atomic="true"`; clears then sets text via `requestAnimationFrame` |
| `announceToast` | Like `announce` but auto-clears after `duration` ms; cancels any pending clear on re-invocation |
| `focusTrap` | Constrains Tab/Shift+Tab within `element`; restores focus on cleanup unless `returnFocusOnDeactivate: false` |
| `useAnnounce` | React hook — stable `announce` + `announceToast` callbacks |
| `useFocusTrap` | React hook — activates trap on mount; exposes `activate`/`deactivate`; cleans up on unmount |
| `LiveRegionManager` | OO wrapper for polite/assertive live regions; `clear()` empties both; safe when regions don't exist |

#### `SkipNav` component contract

- Renders exactly **one** `<a>` element
- The `href` attribute is **exactly** `"#main-content"`
- The visible text is **exactly** `"Skip to main content"`
- Carries the CSS class `skip-to-content` for position-based show-on-focus styling

---

### 3. Playwright + axe-core (end-to-end a11y audit)

**Relevant file:** `tests/a11y/core-pages.spec.ts`

**Run locally** (requires the dev server to be running on `:3000`):
```bash
# Terminal 1
npm run dev --workspace=packages/client

# Terminal 2
npm run test:a11y --workspace=packages/client
```

**Pages covered:** `/`, `/search`, `/dashboard`, `/payment/1`,
`/governance`, `/loyalty`, `/book/group`

**axe-core tags:** `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`

**Blocking threshold:** `critical` and `serious` violations fail the suite.
`moderate` findings are recorded as annotations but do not block.

**Additional structural tests run per suite:**

| Test | What it verifies |
|---|---|
| Keyboard tab order | Focusable elements exist; Tab cycles forward |
| Skip nav link | `<a href="#main-content">` is present, visible, and is the **first** tab stop |
| ARIA landmarks | `header[role="banner"]`, `main#main-content`, `footer[role="contentinfo"]` all present |
| Heading hierarchy | No heading level is skipped (e.g., `h1 → h3` without `h2`) |
| Focus visible styles | Focused elements have a non-zero `outline` |
| ARIA live regions | At least two `aria-live` regions exist on the landing page |
| Color contrast | Zero `color-contrast` axe violations |
| Image alt text | Every `<img>` without `role="presentation"` has a non-null `alt` attribute |

---

## CI Integration

| Job | Workflow | Status |
|---|---|---|
| `quality-client` (lint) | `ci.yml`, `ci-pipeline.yml` | **Blocking** |
| `test-client` (unit + a11y unit) | `ci.yml`, `ci-pipeline.yml` | **Blocking** |
| `accessibility` (Playwright axe) | `ci-pipeline.yml` | Non-blocking (`continue-on-error: true`) |

The Playwright axe job is intentionally non-blocking while the team works down
the backlog of existing `moderate` findings. Ratchet the threshold tighter by
changing `FAILING_IMPACTS` in `tests/a11y/core-pages.spec.ts` once a page is
clean.

---

## Adding a New Component

1. **Check if it needs ARIA attributes** — interactive widgets (combobox, dialog,
   tabs, etc.) require the matching role and aria properties.
2. **Run lint before opening a PR**: `npm run lint --workspace=packages/client`
3. **Add a Jest unit test** in `tests/unit/` or alongside the component if the
   component has custom a11y logic (focus management, live regions, key handlers).
4. If the component appears on one of the audited pages, re-run the axe suite
   locally to confirm no new violations: `npm run test:a11y --workspace=packages/client`

---

## Ratcheting the axe Threshold

Edit the `FAILING_IMPACTS` set in `tests/a11y/core-pages.spec.ts`:

```ts
// Current (blocks on critical + serious):
const FAILING_IMPACTS = new Set<string>(["critical", "serious"])

// Once moderate findings on a page are resolved, add:
const FAILING_IMPACTS = new Set<string>(["critical", "serious", "moderate"])
```

Change this per-page once the surface is clean — do not tighten globally until
all pages meet the new threshold.
