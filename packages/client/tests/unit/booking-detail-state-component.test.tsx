/**
 * Component coverage for the v1 booking detail states (issue #1146).
 * Runs with the full client toolchain (React, Next and jsdom).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { BookingDetailStateView } from "@/components/booking/booking-detail-state";

describe("BookingDetailStateView (issue #1146)", () => {
  it("renders the fixed missing copy and a back action", () => {
    const onBack = jest.fn();
    render(<BookingDetailStateView state="missing" onBack={onBack} />);

    expect(screen.getByText("Booking not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to bookings/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to bookings/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders a retry action only for the unavailable state", () => {
    const onRetry = jest.fn();
    render(<BookingDetailStateView state="unavailable" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the pending explanation without an action button", () => {
    render(<BookingDetailStateView state="pending" onRetry={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByText(/still being confirmed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an accessible loading skeleton", () => {
    render(<BookingDetailStateView state="missing" isLoading />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/loading booking details/i)).toBeInTheDocument();
  });

  it("renders nothing when the booking is ready", () => {
    const { container } = render(<BookingDetailStateView state="ready" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("exposes the state for assertions and uses a polite live region", () => {
    render(<BookingDetailStateView state="unauthorized" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-state", "unauthorized");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("never renders a raw error message, because none is accepted as a prop", () => {
    const leaked = "token=ak_supersecret123";
    render(<BookingDetailStateView state="unavailable" onRetry={jest.fn()} />);
    expect(screen.queryByText(leaked)).not.toBeInTheDocument();
  });
});
