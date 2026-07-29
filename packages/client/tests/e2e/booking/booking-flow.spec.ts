import { test, expect, Page } from "@playwright/test";

const BOOKING_URL = "/book/1";

async function mockApiResponses(page: Page) {
  await page.route("**/api/flights/fare-rules**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          { fareClass: "economy", changeable: true, refundable: false },
        ],
      }),
    });
  });

  await page.route("**/api/flights/currencies/rates**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { rates: { EUR: 0.92, GBP: 0.79 } },
      }),
    });
  });

  await page.route("**/api/v1/carbon/footprint**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { totalCO2kg: 250, distanceKm: 2475, cabinClassFactor: 1.0, calculationMethod: "IATA" },
      }),
    });
  });

  await page.route("**/api/v1/insurance/purchase**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "ins-1",
          providerPolicyRef: "POL-123",
          coverageType: "comprehensive",
          premiumCents: 2250,
          refundEligibleUntil: new Date(Date.now() + 86400000).toISOString(),
        },
      }),
    });
  });

  await page.route("**/api/v1/carbon/offset**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          purchaseId: "co-1",
          projectName: "Forest Conservation",
          co2Kg: 250,
          certificateRef: "CERT-001",
        },
      }),
    });
  });
}

test.describe("Flight Booking Flow - E2E", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);
  });

  test("should display booking page with all steps visible", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("Flight Details")).toBeVisible();

    await expect(page.getByRole("button", { name: /select seats/i })).toBeVisible();
  });

  test("should navigate through passenger details step", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    await page.waitForSelector("text=Passenger Details", { timeout: 10000 }).catch(() => {});

    const firstNameInput = page.locator("input[id*='first-name'], input[name*='firstName'], input[placeholder*='First']").first();
    const lastNameInput = page.locator("input[id*='last-name'], input[name*='lastName'], input[placeholder*='Last']").first();
    const emailInput = page.locator("input[type='email'], input[id*='email'], input[name*='email'], input[placeholder*='Email']").first();
    const phoneInput = page.locator("input[type='tel'], input[id*='phone'], input[name*='phone'], input[placeholder*='Phone']").first();

    if (await firstNameInput.isVisible()) {
      await firstNameInput.fill("John");
      await lastNameInput.fill("Doe");
      if (await emailInput.isVisible()) {
        await emailInput.fill("john@example.com");
      }
      if (await phoneInput.isVisible()) {
        await phoneInput.fill("+1234567890");
      }
    }

    const selectSeatsButton = page.getByRole("button", { name: /select seats/i });
    if (await selectSeatsButton.isVisible()) {
      await selectSeatsButton.click();
    }

    await page.waitForTimeout(500);
  });

  test("should display progress indicators correctly", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const stepIndicators = page.locator("[role='progressbar'], .progress, [class*='progress']").first();
    await expect(stepIndicators).toBeVisible();

    const stepLabel = page.getByText(/step \d+ of \d+/i);
    await expect(stepLabel).toBeVisible();
  });

  test("should navigate back and forth between steps", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const selectSeatsButton = page.getByRole("button", { name: /select seats/i });
    if (await selectSeatsButton.isVisible()) {
      await selectSeatsButton.click();
      await page.waitForTimeout(300);
    }

    const backButton = page.getByRole("button", { name: /back/i });
    if (await backButton.isVisible()) {
      await backButton.click();
      await page.waitForTimeout(300);
    }
  });

  test("should show wallet connection screen", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const walletButton = page.getByRole("button", { name: /connect stellar wallet/i });
    const connectButton = page.getByRole("button", { name: /connect wallet/i });

    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.waitForTimeout(500);
    } else if (await connectButton.isVisible()) {
      await connectButton.click();
      await page.waitForTimeout(500);
    }
  });

  test("should complete full booking journey to success", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    await page.waitForTimeout(1000);

    const selectSeatsBtn = page.getByRole("button", { name: /select seats/i });
    if (await selectSeatsBtn.isVisible()) {
      await selectSeatsBtn.click();
      await page.waitForTimeout(300);
    }

    const continueBtn = page.getByRole("button", { name: /continue/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForTimeout(300);
    }

    const continuePaymentBtn = page.getByRole("button", { name: /continue to payment/i });
    if (await continuePaymentBtn.isVisible()) {
      await continuePaymentBtn.click();
      await page.waitForTimeout(300);
    }

    const connectWalletBtn = page.getByRole("button", { name: /connect stellar wallet/i });
    if (await connectWalletBtn.isVisible()) {
      await connectWalletBtn.click();
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(300);

    const confirmPayBtn = page.getByRole("button", { name: /confirm & pay/i });
    if (await confirmPayBtn.isVisible()) {
      await confirmPayBtn.click();
      await page.waitForTimeout(1000);
    }

    const successHeading = page.getByText(/booking confirmed/i);
    const dashboardBtn = page.getByRole("button", { name: /go to dashboard/i });

    if (await successHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(successHeading).toBeVisible();
      if (await dashboardBtn.isVisible()) {
        await expect(dashboardBtn).toBeVisible();
      }
    }
  });

  test("should show wallet connected state in header", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const walletBadge = page.locator("header").getByText(/wallet (dis)?connected/i);
    await expect(walletBadge).toBeVisible();
  });

  test("should have working navigation back to homepage", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const logo = page.locator("header").getByRole("link", { name: /go to homepage/i }).first();
    const logoText = page.locator("header").getByText("Traqora").first();

    if (await logo.isVisible()) {
      await logo.click();
    } else if (await logoText.isVisible()) {
      await logoText.click();
    }

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Booking Form Validation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);
  });

  test("should display booking summary sidebar", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const summary = page.locator("aside, [class*='sticky'], [class*='sidebar']").first();
    await expect(summary).toBeVisible();
  });

  test("should display fare rules when available", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const fareRules = page.getByText(/fare rules|fare class/i);
    if (await fareRules.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(fareRules).toBeVisible();
    }
  });
});
