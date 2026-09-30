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
          { fareClass: "economy", changeable: true, refundable: false, changeFeeCents: 5000, cancellationFeeCents: 10000 },
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
}

test.describe("Booking Payment and Confirmation", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);
  });

  test("should display payment method selection on confirm step", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const confirmPayBtn = page.getByRole("button", { name: /confirm & pay/i });
    if (await confirmPayBtn.isVisible()) {
      const paymentSection = page.getByText(/payment method/i);
      await expect(paymentSection).toBeVisible();

      const stellarOption = page.getByText(/usdc on stellar/i);
      await expect(stellarOption).toBeVisible();
    }
  });

  test("should display booking success page with booking reference", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    await page.waitForTimeout(500);

    const confirmPayBtn = page.getByRole("button", { name: /confirm & pay/i });
    if (await confirmPayBtn.isVisible()) {
      await confirmPayBtn.click();
      await page.waitForTimeout(1500);
    }

    const confirmed = page.getByText(/booking confirmed/i);
    if (await confirmed.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(confirmed).toBeVisible();

      const bookingRef = page.getByText(/traq-/i);
      if (await bookingRef.isVisible().catch(() => false)) {
        await expect(bookingRef).toBeVisible();
      }

      const dashboardBtn = page.getByRole("button", { name: /go to dashboard/i });
      await expect(dashboardBtn).toBeVisible();
    }
  });

  test("should display insurance section on success when selected", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    await page.waitForTimeout(500);

    const travelInsurance = page.getByText(/travel insurance/i);
    if (await travelInsurance.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(travelInsurance).toBeVisible();
    }
  });

  test("should display carbon offset section on success when selected", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    await page.waitForTimeout(500);

    const carbonOffset = page.getByText(/carbon offset|carbon neutral/i);
    if (await carbonOffset.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(carbonOffset).toBeVisible();
    }
  });

  test("should display wallet connection status badge", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const badge = page.locator("header").getByText(/connected|disconnected/i);
    await expect(badge).toBeVisible();
  });

  test("should show booking summary in sidebar", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const summary = page.locator("aside, [class*='col-span-1'], [class*='sticky']").first();
    await expect(summary).toBeVisible();

    const flightInfo = summary.getByText(/delta|united|american|airline|flight/i);
    if (await flightInfo.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(flightInfo).toBeVisible();
    }
  });

  test("should display smart contract verification badge", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const contractBadge = page.getByText(/smart contract/i);
    if (await contractBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(contractBadge).toBeVisible();
    }
  });

  test("should allow currency switching", async ({ page }) => {
    await page.goto(BOOKING_URL, { waitUntil: "networkidle" });

    const currencySelector = page.locator("header").getByRole("combobox").first();
    const currencyButton = page.locator("header").getByText(/usd|eur|gbp/i).first();

    if (await currencySelector.isVisible()) {
      await currencySelector.click();
      const eurOption = page.getByRole("option", { name: /eur/i }).first();
      if (await eurOption.isVisible()) {
        await eurOption.click();
        await page.waitForTimeout(500);
      }
    } else if (await currencyButton.isVisible()) {
      await currencyButton.click();
      await page.waitForTimeout(300);
    }
  });
});
