import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckoutPaymentStatusView } from "@/components/booking/checkout-payment-status";

describe("CheckoutPaymentStatusView Component", () => {
  it("renders awaiting_approval state with accessible status", () => {
    render(<CheckoutPaymentStatusView status="awaiting_approval" bookingId="BOK-101" />);

    expect(screen.getByRole("status")).toHaveAttribute("data-state", "awaiting_approval");
    expect(screen.getByText("Awaiting Wallet Approval")).toBeDefined();
    expect(screen.getByText("BOK-101")).toBeDefined();
  });

  it("renders submitted state with transaction hash and loader", () => {
    render(
      <CheckoutPaymentStatusView
        status="submitted"
        bookingId="BOK-102"
        txHash="0x1234567890abcdef1234567890abcdef"
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-state", "submitted");
    expect(screen.getByText("Transaction Submitted")).toBeDefined();
    expect(screen.getByText(/0x12345678/)).toBeDefined();
  });

  it("renders confirmed state and handles onViewBooking callback", () => {
    const onViewBooking = jest.fn();
    render(
      <CheckoutPaymentStatusView
        status="confirmed"
        bookingId="BOK-103"
        onViewBooking={onViewBooking}
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-state", "confirmed");
    expect(screen.getByText("Payment Confirmed")).toBeDefined();

    const button = screen.getByRole("button", { name: /view booking/i });
    fireEvent.click(button);
    expect(onViewBooking).toHaveBeenCalledTimes(1);
  });

  it("renders recoverable_pending state with retry action", () => {
    const onRetry = jest.fn();
    render(
      <CheckoutPaymentStatusView
        status="recoverable_pending"
        bookingId="BOK-104"
        attemptsCount={2}
        errorMessage="Network congestion on Stellar"
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-state", "recoverable_pending");
    expect(screen.getByText("Payment Pending Verification")).toBeDefined();
    expect(screen.getByText(/Network congestion on Stellar/)).toBeDefined();
    expect(screen.getByText(/Attempt 2 completed/)).toBeDefined();

    const retryBtn = screen.getByRole("button", { name: /retry payment/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders failed state with reset action", () => {
    const onReset = jest.fn();
    render(
      <CheckoutPaymentStatusView
        status="failed"
        bookingId="BOK-105"
        errorMessage="User rejected wallet signing"
        onReset={onReset}
      />
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-state", "failed");
    expect(screen.getByText("Payment Failed")).toBeDefined();
    expect(screen.getByText(/User rejected wallet signing/)).toBeDefined();

    const resetBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
