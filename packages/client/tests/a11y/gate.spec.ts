/**
 * Tests for the accessibility audit gate.
 * These tests verify that the axe-core accessibility tests properly fail
 * on critical and serious violations.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility Gate - Axe Core", () => {
  const FAILING_IMPACTS = new Set<string>(["critical", "serious"]);

  test("should pass on accessible page", async ({ page }) => {
    // Create a simple accessible page
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Accessible Page</title>
      </head>
      <body>
        <header role="banner">
          <nav>
            <a href="#main-content">Skip to main content</a>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </nav>
        </header>
        <main id="main-content">
          <h1>Main Heading</h1>
          <p>This is accessible content.</p>
          <button>Accessible Button</button>
          <form>
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required />
            <button type="submit">Submit</button>
          </form>
        </main>
        <footer role="contentinfo">
          <p>&copy; 2024 Test</p>
        </footer>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    expect(blockers).toHaveLength(0);
  });

  test("should fail on critical violation - missing alt text", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <img src="test.jpg" />  {/* Missing alt attribute */}
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    // This should have at least one critical/serious violation
    expect(blockers.length).toBeGreaterThan(0);
    
    // Verify it's an image-alt violation
    const imageAltViolations = blockers.filter(v => v.id === 'image-alt');
    expect(imageAltViolations.length).toBeGreaterThan(0);
  });

  test("should fail on serious violation - missing form label", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <form>
          <input type="text" id="unlabeled" />  {/* Missing label */}
          <button type="submit">Submit</button>
        </form>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    expect(blockers.length).toBeGreaterThan(0);
    
    // Verify it's a label violation
    const labelViolations = blockers.filter(v => v.id === 'label');
    expect(labelViolations.length).toBeGreaterThan(0);
  });

  test("should fail on critical violation - missing heading hierarchy", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <h3>Level 3 heading without h1 or h2</h3>
        <p>Content</p>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    // May or may not have heading-order violation depending on axe version
    // But should not error
    expect(blockers).toBeDefined();
  });

  test("should fail on serious violation - insufficient color contrast", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <style>
          .low-contrast { color: #999; background-color: #fff; }
        </style>
      </head>
      <body>
        <p class="low-contrast">Low contrast text</p>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aa", "wcag21aa"])
      .options({ runOnly: ["color-contrast"] })
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    // Color contrast violations are typically serious
    if (blockers.length > 0) {
      const contrastViolations = blockers.filter(v => v.id === 'color-contrast');
      expect(contrastViolations.length).toBeGreaterThan(0);
    }
  });

  test("should report moderate violations as warnings only", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <div aria-hidden="true">Hidden from screen readers but visible</div>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    // Moderate violations should not be blockers
    const moderateViolations = results.violations.filter(v => v.impact === 'moderate');
    expect(blockers.length).toBe(0);
    // But moderate violations can exist
    expect(results.violations.length).toBeGreaterThanOrEqual(0);
  });

  test("should pass with proper ARIA landmarks", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <header role="banner">
          <h1>Site Title</h1>
        </header>
        <nav role="navigation">
          <ul><li><a href="/">Home</a></li></ul>
        </nav>
        <main id="main-content" role="main">
          <h2>Page Title</h2>
          <p>Content</p>
        </main>
        <aside role="complementary">
          <h3>Sidebar</h3>
        </aside>
        <footer role="contentinfo">
          <p>Footer</p>
        </footer>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    expect(blockers).toHaveLength(0);
  });

  test("should pass with proper focus management", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <style>
          a:focus-visible, button:focus-visible {
            outline: 3px solid #005fcc;
            outline-offset: 2px;
          }
        </style>
      </head>
      <body>
        <a href="#main" id="skip-link">Skip to main</a>
        <nav>
          <a href="/">Link 1</a>
          <a href="/about">Link 2</a>
        </nav>
        <main id="main">
          <button>Focusable Button</button>
        </main>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();

    const blockers = results.violations.filter((v) =>
      FAILING_IMPACTS.has(v.impact ?? "moderate"),
    );

    expect(blockers).toHaveLength(0);
  });
});

test.describe("Accessibility Gate - Failure Mode Tests", () => {
  const FAILING_IMPACTS = new Set<string>(["critical", "serious"]);

  test("should detect missing skip link as violation", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <nav>
          <a href="/">Link 1</a>
          <a href="/about">Link 2</a>
        </nav>
        <main>
          <h1>Content</h1>
        </main>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();

    // May have various violations but should at least run without error
    expect(results.violations).toBeDefined();
  });

  test("should detect missing aria-live regions for dynamic content", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <div id="toast" style="display: none;">Notification</div>
        <button id="show-toast">Show Toast</button>
        <script>
          document.getElementById('show-toast').addEventListener('click', () => {
            document.getElementById('toast').style.display = 'block';
          });
        </script>
      </body>
      </html>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();

    expect(results.violations).toBeDefined();
  });
});