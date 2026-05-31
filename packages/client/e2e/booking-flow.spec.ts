import { expect, test } from "@playwright/test"

test("searches, books, pays with the E2E stub, and persists the booking", async ({ page, request }) => {
  const reset = await request.post("http://127.0.0.1:3001/api/v1/e2e/reset")
  expect(reset.ok()).toBeTruthy()

  await page.goto("/search")

  await page.getByLabel("Origin Airport Code").fill("JFK")
  await page.getByLabel("Destination Airport Code").fill("LAX")
  await page.getByLabel("Departure Date").fill("2026-07-15")
  await page.getByRole("button", { name: /search flights/i }).click()

  await expect(page.getByText(/flight found|flights found/i)).toBeVisible()
  await page.getByRole("link", { name: /book flight/i }).first().click()

  await expect(page.getByRole("heading", { name: "Flight Details" })).toBeVisible()
  await page.getByRole("button", { name: /select seats/i }).click()

  await expect(page.getByText("Select Your Seat")).toBeVisible()
  await page.locator('button[title^="Seat"]').and(page.locator("button:enabled")).first().click()
  await page.getByRole("button", { name: /continue to payment/i }).click()

  await expect(page.getByText("Secure Your Booking")).toBeVisible()
  await page.getByRole("button", { name: /connect stellar wallet/i }).click()

  await expect(page.getByText("Payment Method")).toBeVisible()
  await page.getByRole("button", { name: /confirm & pay/i }).click()

  await expect(page.getByText("Booking Confirmed!")).toBeVisible()
  const bookingReference = await page.locator("text=/[0-9a-f]{8}-[0-9a-f-]{27,}/i").first().textContent()
  expect(bookingReference).toBeTruthy()

  const persisted = await request.get(`http://127.0.0.1:3001/api/v1/e2e/bookings/${bookingReference}`)
  expect(persisted.ok()).toBeTruthy()
  const body = await persisted.json()
  expect(body.data.status).toBe("confirmed")
  expect(body.data.amountCents).toBe(45000)
})
