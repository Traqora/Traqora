import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { UserRefundTrackingView } from "../../components/refunds/UserRefundTrackingView";

// Mock global fetch
const globalFetch = global.fetch as jest.Mock;

describe("UserRefundTrackingView", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("renders loading state initially", async () => {
    global.fetch.mockImplementationOnce(
      () => new Promise(() => {})
    );

    render(<UserRefundTrackingView bookingId="123e4567-e89b-12d3-a456-426614174000" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders refund details and timeline when successfully fetched", async () => {
    const mockRefund = {
      id: "ref-1",
      status: "approved",
      reason: "customer_request",
      requestedAmountCents: 10000,
      approvedAmountCents: 10000,
      processingFeeCents: 0,
      isEligible: true,
      requiresManualReview: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [mockRefund] }),
    });

    render(<UserRefundTrackingView bookingId="123e4567-e89b-12d3-a456-426614174000" />);

    await waitFor(() => {
      expect(screen.getByText(/Refund Status & Timeline/i)).toBeInTheDocument();
      expect(screen.getByText(/Approved/i)).toBeInTheDocument();
      expect(screen.getByText(/ref-1/i)).toBeInTheDocument();
    });
  });

  it("shows a partial outcome and never renders internal operator notes", async () => {
    const mockRefund = {
      id: "ref-2",
      status: "completed",
      outcome: "partial",
      outcomeLabel: "Partial refund issued",
      netRefundCents: 4000,
      reason: "flight_cancelled",
      requestedAmountCents: 10000,
      approvedAmountCents: 4000,
      processingFeeCents: 0,
      isEligible: true,
      requiresManualReview: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewNotes: "INTERNAL: operator called the traveler",
      reviewedBy: "ops-user",
      lastError: "INTERNAL: first attempt failed",
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [mockRefund] }),
    });

    render(<UserRefundTrackingView bookingId="123e4567-e89b-12d3-a456-426614174000" />);

    await waitFor(() => {
      expect(screen.getByTestId("refund-outcome")).toHaveTextContent("Partial refund issued");
    });
    expect(screen.queryByText(/INTERNAL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review Notes/i)).not.toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
  });

  it("renders an unrecognised status without crashing", async () => {
    const mockRefund = {
      id: "ref-3",
      status: "new_rail_status",
      reason: "other",
      requestedAmountCents: 1000,
      processingFeeCents: 0,
      isEligible: false,
      requiresManualReview: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [mockRefund] }),
    });

    render(<UserRefundTrackingView bookingId="123e4567-e89b-12d3-a456-426614174000" />);

    await waitFor(() => {
      expect(screen.getByText(/Status Update/i)).toBeInTheDocument();
    });
  });

  it("renders error message on API failure", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: { message: "Server error" } }),
    });

    render(<UserRefundTrackingView bookingId="123e4567-e89b-12d3-a456-426614174000" />);

    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
  });
});
