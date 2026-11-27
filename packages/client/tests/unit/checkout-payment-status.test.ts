import {
  resolveCheckoutPaymentStatus,
  CHECKOUT_PAYMENT_STATUS_COPY,
} from "@/components/booking/checkout-payment-status";
import { CheckoutPaymentStateInput } from "@/types/payment";

describe("resolveCheckoutPaymentStatus", () => {
  it("resolves confirmed when transactionStatus is success or confirmed", () => {
    expect(resolveCheckoutPaymentStatus({ transactionStatus: "success" })).toBe("confirmed");
    expect(resolveCheckoutPaymentStatus({ transactionStatus: "confirmed" })).toBe("confirmed");
    expect(resolveCheckoutPaymentStatus({ bookingStatus: "paid" })).toBe("confirmed");
    expect(resolveCheckoutPaymentStatus({ bookingStatus: "completed" })).toBe("confirmed");
  });

  it("resolves awaiting_approval when signingStatus is pending or processing", () => {
    expect(resolveCheckoutPaymentStatus({ signingStatus: "pending" })).toBe("awaiting_approval");
    expect(resolveCheckoutPaymentStatus({ signingStatus: "idle", isProcessing: true })).toBe("awaiting_approval");
  });

  it("resolves submitted when transaction is in flight or submitted to network", () => {
    expect(resolveCheckoutPaymentStatus({ transactionStatus: "submitted" })).toBe("submitted");
    expect(resolveCheckoutPaymentStatus({ transactionStatus: "pending" })).toBe("submitted");
    expect(resolveCheckoutPaymentStatus({ bookingStatus: "onchain_submitted" })).toBe("submitted");
    expect(resolveCheckoutPaymentStatus({ signingStatus: "success" })).toBe("submitted");
  });

  it("resolves recoverable_pending on timeout or retryable network delay", () => {
    expect(resolveCheckoutPaymentStatus({ signingStatus: "timeout" })).toBe("recoverable_pending");
    expect(resolveCheckoutPaymentStatus({ hasError: true, isRetryable: true })).toBe("recoverable_pending");
    expect(resolveCheckoutPaymentStatus({ errorMessage: "NETWORK_TIMEOUT" })).toBe("recoverable_pending");
    expect(resolveCheckoutPaymentStatus({ errorMessage: "UPSTREAM_UNAVAILABLE" })).toBe("recoverable_pending");
  });

  it("resolves failed on terminal failure or signature rejection", () => {
    expect(resolveCheckoutPaymentStatus({ signingStatus: "rejected" })).toBe("failed");
    expect(resolveCheckoutPaymentStatus({ signingStatus: "error" })).toBe("failed");
    expect(resolveCheckoutPaymentStatus({ transactionStatus: "failed" })).toBe("failed");
    expect(resolveCheckoutPaymentStatus({ hasError: true, isRetryable: false })).toBe("failed");
  });

  it("prioritizes confirmed over pending or transient errors", () => {
    expect(
      resolveCheckoutPaymentStatus({
        transactionStatus: "confirmed",
        signingStatus: "timeout",
      }),
    ).toBe("confirmed");
  });

  it("provides complete copy for all 5 status values", () => {
    const statuses = [
      "awaiting_approval",
      "submitted",
      "confirmed",
      "failed",
      "recoverable_pending",
    ] as const;

    for (const status of statuses) {
      const copy = CHECKOUT_PAYMENT_STATUS_COPY[status];
      expect(copy).toBeDefined();
      expect(copy.title).toBeTruthy();
      expect(copy.description).toBeTruthy();
      expect(copy.badgeText).toBeTruthy();
    }
  });
});
