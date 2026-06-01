/**
 * Issue #168 — axe-core accessibility audits for the core public pages.
 *
 * Each page is loaded, scanned with WCAG 2.1 A + AA + Best Practices
 * rules, and any violation of `critical` or `serious` impact fails the
 * test with a readable summary of the offending rules + selectors.
 *
 * Add a route to `PAGES` to grow the suite. Keep the list small so the
 * audit stays fast — coverage breadth lives in the unit tests; this is
 * the "smoke" layer for accessibility regressions.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Issue #168 lists "/", "/search" and "/booking". `/book` itself is a
// dynamic route (`app/book/[id]/page.tsx`) so we audit `/dashboard` as
// the post-search representative page instead — same authenticated/
// authoring surface, real `page.tsx`, no 404. Add new entries here as
// the audit's surface grows.
const PAGES = [
  { name: "landing", path: "/" },
  { name: "search", path: "/search" },
  { name: "dashboard", path: "/dashboard" },
  // /book is a dynamic route (app/book/[id]); we audit the listings
  // entry point that links into it instead so the suite never 404s on
  // a placeholder id.
  { name: "payment", path: "/payment" },
  { name: "governance", path: "/governance" },
] as const;

// Severity bar that fails the workflow. `serious` is included so we
// don't ship clear blockers like missing form labels; bump to
// `["critical"]` only as a temporary escape hatch while remediating.
const FAILING_IMPACTS = new Set<string>(["critical", "serious"]);

for (const page of PAGES) {
  test(`a11y: ${page.name} (${page.path})`, async ({ page: browser }) => {
    await browser.goto(page.path, { waitUntil: "domcontentloaded" });

    const results = await new AxeBuilder({ page: browser })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    if (blockers.length > 0) {
      const summary = blockers
        .map((v) => {
          const targets = v.nodes
            .slice(0, 3)
            .map((n) => `    - ${n.target.join(" › ")}`)
            .join("\n");
          return `  • [${v.impact}] ${v.id}: ${v.help}\n${targets}`;
        })
        .join("\n");
      throw new Error(
        `${blockers.length} accessibility violation(s) on ${page.path}:\n${summary}`,
      );
    }

    // Surface remaining moderate/minor findings as test info so the
    // team can see them in the Playwright report without failing the
    // workflow.
    if (results.violations.length > 0) {
      const moderate = results.violations.length;
      test.info().annotations.push({
        type: "a11y-warning",
        description: `${moderate} non-blocking a11y finding(s) on ${page.path}`,
      });
    }

    expect(blockers).toHaveLength(0);
  });
}
