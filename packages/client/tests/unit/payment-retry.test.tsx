import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PaymentRetry } from "../../components/booking/payment-retry"

describe("PaymentRetry Component", () => {
  it("renders initial error state and booking ID correctly", () => {
    render(<PaymentRetry bookingId="booking-123" initialError="Network timeout occurred" />)

    expect(screen.getByText("Payment Failed - Action Required")).toBeDefined()
    expect(screen.getByText("Network timeout occurred")).toBeDefined()
    expect(screen.getByText("booking-123")).toBeDefined()
    expect(screen.getByRole("button", { name: /retry payment/i })).toBeDefined()
  })

  it("handles retry success happy path", async () => {
    const onSuccess = jest.fn()
    render(<PaymentRetry bookingId="booking-456" onRetrySuccess={onSuccess} initialError="Initial failure" />)

    const retryButton = screen.getByRole(
      "button",
      { name: /retry payment/i },
    )
    fireEvent.click(retryButton)

    // Check loading state
    expect(
      screen.getByText(/retrying payment on stellar/i),
    ).toBeDefined()

    // Wait for success confirmation
    await waitFor(
      () => {
        expect(screen.getByText("Payment Recovered")).toBeDefined()
      },
      { timeout: 4000 },
    )

    expect(onSuccess).toHaveBeenCalled()
    const resultArg = onSuccess.mock.calls[0][0]
    expect(resultArg.success).toBe(true)
    expect(resultArg.bookingId).toBe("booking-456")
    expect(resultArg.status).toBe("confirmed")
  })

  it("handles key failure mode and allows subsequent attempts", async () => {
    const onError = jest.fn()
    render(<PaymentRetry bookingId="booking-789" onRetryError={onError} initialError="Initial failure" />)

    const retryButton = screen.getByRole(
      "button",
      { name: /retry payment/i },
    )

    // Mock Math.random to force failure or rely on test behavior
    const originalRandom = Math.random
    Math.random = () => 0.9 // forces rejection branch on attempt 1 if attempts < 2

    fireEvent.click(retryButton)

    await waitFor(
      () => {
        expect(screen.getByText(/stellar network congestion/i)).toBeDefined()
      },
      { timeout: 4000 },
    )

    expect(onError).toHaveBeenCalled()
    const errorArg = onError.mock.calls[0][0]
    expect(errorArg.code).toBe("PAYMENT_RETRY_FAILED")
    expect(errorArg.retryable).toBe(true)

    Math.random = originalRandom
  })
})
