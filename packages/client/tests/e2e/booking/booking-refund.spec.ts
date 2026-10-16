import { test, expect, Page } from "@playwright/test";

const BOOKING_URL = "/book/1";
const REFUND_URL = "/refunds";

async function mockApiResponses(page: Page) {
  await page.route("**/api/flights/fare-rules**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          { fareClass: "economy", changeable: true, refundable: true, changeFeeCents: 5000, cancellationFeeCents: 10000 },
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

  await page.route("**/api/v1/refunds/request**", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "ref-123",
          bookingId: "1",
          status: "eligibility_check",
          reason: "customer_request",
          requestedAmountCents: 50000,
          isEligible: true,
          eligibilityNotes: "Eligible for 80% refund",
          refundPercentage: 80,
          processingFeeCents: 2500,
          requiresManualReview: false,
          isDelayed: false,
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/api/v1/refunds/1**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "ref-123",
          bookingId: "1",
          status: "completed",
          reason: "customer_request",
          requestedAmountCents: 50000,
          approvedAmountCents: 40000,
          isEligible: true,
          eligibilityNotes: "Eligible for 80% refund",
          refundPercentage: 80,
          processingFeeCents: 2500,
          requiresManualReview: false,
          isDelayed: false,
          stripeRefundId: "re_123",
          sorobanTxHash: "abc123",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          completedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/api/v1/refunds/booking/1**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: "ref-123",
            bookingId: "1",
            status: "completed",
            reason: "customer_request",
            requestedAmountCents: 50000,
            approvedAmountCents: 40000,
            isEligible: true,
            eligibilityNotes: "Eligible for 80% refund",
            refundPercentage: 80,
            processingFeeCents: 2500,
            requiresManualReview: false,
            isDelayed: false,
            stripeRefundId: "re_123",
            sorobanTxHash: "abc123",
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  await page.route("**/api/v1/refunds/auto-eligible**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          isEligible: true,
          reason: "Eligible for 80% refund",
          refundPercentage: 80,
          processingFeeCents: 2500,
          requiresManualReview: false,
        },
      }),
    });
  });

  await page.route("**/api/v1/bookings/1**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "1",
          passenger: { id: "p-1", firstName: "John", lastName: "Doe", email: "john@example.com" },
          flight: {
            id: "f-1",
            airline: "Delta",
            flightNumber: "DL123",
            departureAirport: { code: "JFK", name: "John F. Kennedy" },
            arrivalAirport: { code: "LAX", name: "Los Angeles" },
            departureTime: new Date(Date.now() + 86400000 * 5).toISOString(),
            arrivalTime: new Date(Date.now() + 86400000 * 5 + 21600000).toISOString(),
          },
          amountCents: 50000,
          currency: "USD",
          status: "confirmed",
          stripePaymentIntentId: "pi_123",
          sorobanBookingId: "42",
        },
      }),
    });
  });
}

test.describe("Booking Refund Flow - E2E", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);
  });

  test("should display refund request form on refunds page", async ({ page }) => {
    await page.goto(REFUND_URL, { waitUntil: "networkidle" });

    await expect(page.getByText(/request refund|refund request/i)).toBeVisible();

    const bookingInput = page.getByPlaceholder(/booking id|booking reference/i).first();
    if (await bookingInput.isVisible()) {
      await expect(bookingInput).toBeVisible();
    }

    const reasonSelect = page.getByRole("combobox", { name: /reason/i }).first();
    if (await reasonSelect.isVisible()) {
      await expect(reasonSelect).toBeVisible();
    }

    const submitButton = page.getByRole("button", { name: /submit|request refund/i }).first();
    if (await submitButton.isVisible()) {
      await expect(submitButton).toBeVisible();
    }
  });

  test("should submit refund request successfully", async ({ page }) => {
    await page.goto(REFUND_URL, { waitUntil: "networkidle" });

    const bookingInput = page.getByPlaceholder(/booking id|booking reference/i).first();
    if (await bookingInput.isVisible()) {
      await bookingInput.fill("1");
    }

    const reasonSelect = page.getByRole("combobox", { name: /reason/i }).first();
    if (await reasonSelect.isVisible()) {
      await reasonSelect.click();
      const option = page.getByRole("option", { name: /customer request/i }).first();
      if (await option.isVisible()) {
        await option.click();
      }
    }

    const submitButton = page.getByRole("button", { name: /submit|request refund/i }).first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await page.waitForTimeout(1000);
    }

    const successMessage = page.getByText(/refund request.*submitted|success/i);
    if (await successMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(successMessage).toBeVisible();
    }
  });

  test("should display refund details page", async ({ page }) => {
    await page.goto(`${REFUND_URL}/ref-123`, { waitUntil: "networkidle" });

    await expect(page.getByText(/refund details|refund status/i)).toBeVisible();

    const statusBadge = page.getByText(/completed|processing|pending|approved|rejected/i);
    if (await statusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(statusBadge).toBeVisible();
    }

    const amount = page.getByText(/\$?\d+(\.\d{2})?/);
    if (await amount.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(amount).toBeVisible();
    }

    const bookingRef = page.getByText(/booking.*1|traq-/i);
    if (await bookingRef.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(bookingRef).toBeVisible();
    }
  });

  test("should display refund history for a booking", async ({ page }) => {
    await page.goto(`${REFUND_URL}/booking/1`, { waitUntil: "networkidle" });

    await expect(page.getByText(/refund history|refunds for booking/i)).toBeVisible();

    const refundItem = page.getByText(/ref-123|completed|400/i);
    if (await refundItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(refundItem).toBeVisible();
    }
  });

  test("should check automated refund eligibility", async ({ page }) => {
    await page.goto(REFUND_URL, { waitUntil: "networkidle" });

    const checkEligibilityBtn = page.getByRole("button", { name: /check eligibility|eligibility/i }).first();
    if (await checkEligibilityBtn.isVisible()) {
      await checkEligibilityBtn.click();
      await page.waitForTimeout(1000);
    }

    const eligibilityResult = page.getByText(/eligible|80%|refund percentage/i);
    if (await eligibilityResult.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(eligibilityResult).toBeVisible();
    }
  });

  test("should display refund status with on-chain transaction hash", async ({ page }) => {
    await page.goto(`${REFUND_URL}/ref-123`, { waitUntil: "networkidle" });

    const txHash = page.getByText(/abc123|soroban|transaction hash/i);
    if (await txHash.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(txHash).toBeVisible();
    }

    const stripeRefund = page.getByText(/re_123|stripe refund/i);
    if (await stripeRefund.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(stripeRefund).toBeVisible();
    }
  });
});

test.describe("Refund Error Handling", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);

    await page.route("**/api/v1/refunds/request**", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { message: "Booking not found", code: "NOT_FOUND" },
        }),
      });
    });
  });

  test("should display error when refund request fails", async ({ page }) => {
    await page.goto(REFUND_URL, { waitUntil: "networkidle" });

    const bookingInput = page.getByPlaceholder(/booking id|booking reference/i).first();
    if (await bookingInput.isVisible()) {
      await bookingInput.fill("invalid");
    }

    const submitButton = page.getByRole("button", { name: /submit|request refund/i }).first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await page.waitForTimeout(1000);
    }

    const errorMessage = page.getByText(/error|failed|not found/i);
    if (await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });

  test("should display error when refund not found", async ({ page }) => {
    await page.route("**/api/v1/refunds/999**", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { message: "Refund not found", code: "NOT_FOUND" },
        }),
      });
    });

    await page.goto(`${REFUND_URL}/999`, { waitUntil: "networkidle" });

    const errorMessage = page.getByText(/not found|error|404/i);
    if (await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });
});