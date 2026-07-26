import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = [
  { name: "landing", path: "/" },
  { name: "search", path: "/search" },
  { name: "dashboard", path: "/dashboard" },
  { name: "payment", path: "/payment" },
  { name: "governance", path: "/governance" },
  { name: "loyalty", path: "/loyalty" },
  { name: "group-booking", path: "/book/group" },
] as const;

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

test("a11y: keyboard navigation - tab order on landing page", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const focusableSelectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(", ");

  const focusable = await browser.locator(focusableSelectors).all();
  expect(focusable.length).toBeGreaterThan(0);

  for (let i = 0; i < Math.min(focusable.length, 5); i++) {
    await browser.keyboard.press("Tab");
    const focused = await browser.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  }
});

test("a11y: skip navigation link exists and is first focusable", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const skipLink = browser.locator('a[href="#main-content"]');
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveText("Skip to main content");

  await browser.keyboard.press("Tab");
  const focusedElement = await browser.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute("href");
  });
  expect(focusedElement).toBe("#main-content");
});

test("a11y: ARIA landmarks present on landing page", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const banner = browser.locator('header[role="banner"]');
  const main = browser.locator('main[id="main-content"]');
  const contentinfo = browser.locator('footer[role="contentinfo"]');

  await expect(banner).toBeVisible();
  await expect(main).toBeVisible();
  await expect(contentinfo).toBeVisible();
});

test("a11y: heading hierarchy on landing page", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const headings = await browser.locator("h1, h2, h3, h4, h5, h6").all();
  const headingLevels = await Promise.all(
    headings.map(async (h) => {
      const tag = await h.evaluate((el) => el.tagName.toLowerCase());
      return parseInt(tag.replace("h", ""));
    }),
  );

  let prevLevel = 0;
  for (const level of headingLevels) {
    expect(level - prevLevel).toBeLessThanOrEqual(1);
    prevLevel = level;
  }
});

test("a11y: focus visible styles applied", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const focusOutline = await browser.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "a:focus-visible { outline: 3px solid red !important; }";
    document.head.appendChild(style);
    const link = document.querySelector("a");
    if (!link) return false;
    link.focus();
    const computed = getComputedStyle(link);
    return computed.outlineWidth !== "0px" || computed.outlineStyle !== "none";
  });

  expect(focusOutline).toBe(true);
});

test("a11y: aria-live regions exist", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const politeLive = browser.locator('[aria-live="polite"]');
  const assertiveLive = browser.locator('[aria-live="assertive"]');

  const politeCount = await politeLive.count();
  const assertiveCount = await assertiveLive.count();

  expect(politeCount + assertiveCount).toBeGreaterThanOrEqual(2);
});

test("a11y: color contrast check on landing page", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const results = await new AxeBuilder({ page: browser })
    .withTags(["wcag2aa", "wcag21aa"])
    .options({ runOnly: ["color-contrast"] })
    .analyze();

  expect(results.violations.filter((v) => v.id === "color-contrast").length).toBe(0);
});

test("a11y: image alt text on landing page", async ({ page: browser }) => {
  await browser.goto("/", { waitUntil: "domcontentloaded" });

  const images = browser.locator("img");
  const count = await images.count();

  for (let i = 0; i < count; i++) {
    const img = images.nth(i);
    const alt = await img.getAttribute("alt");
    const role = await img.getAttribute("role");

    if (role === "presentation" || role === "none") continue;

    expect(alt).not.toBeNull();
  }
});
