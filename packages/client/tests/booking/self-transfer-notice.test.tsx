import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { SelfTransferNotice } from "@/components/booking/self-transfer-notice";

const baseProps = {
  isSelfTransfer: true,
  separateTicketCount: 1,
  riskLevel: "medium" as const,
  explanation:
    "This itinerary contains 1 self-transfer connection(s) on separate tickets. Separate tickets are independent contracts — missed connections, baggage, and refunds are not automatically protected.",
};

describe("SelfTransferNotice", () => {
  it("renders nothing when isSelfTransfer is false", () => {
    render(<SelfTransferNotice {...baseProps} isSelfTransfer={false} />);
    expect(screen.queryByText(/self-transfer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Separate ticket/i)).not.toBeInTheDocument();
  });

  it("renders the alert with title and explanation when self-transfer detected", () => {
    render(<SelfTransferNotice {...baseProps} />);
    expect(screen.getByText(/Self-transfer itinerary — separate tickets detected/i)).toBeInTheDocument();
    expect(screen.getByText(/This itinerary contains 1 self-transfer connection/i)).toBeInTheDocument();
  });

  it("displays the overall risk level badge", () => {
    render(<SelfTransferNotice {...baseProps} riskLevel="high" />);
    expect(screen.getByText(/Overall risk:/i)).toBeInTheDocument();
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  it("renders separate-ticket risk cards", () => {
    render(<SelfTransferNotice {...baseProps} />);
    expect(screen.getByText(/No missed-connection protection/i)).toBeInTheDocument();
    expect(screen.getByText(/Baggage is not checked through/i)).toBeInTheDocument();
    expect(screen.getByText(/Separate contracts/i)).toBeInTheDocument();
    expect(screen.getByText(/Re-clear security and immigration/i)).toBeInTheDocument();
  });

  it("renders mitigations section", () => {
    render(<SelfTransferNotice {...baseProps} />);
    expect(screen.getByText(/How to protect yourself/i)).toBeInTheDocument();
    expect(screen.getByText(/Allow at least 2 hours between self-transfer flights/i)).toBeInTheDocument();
  });

  it("renders segment connection details with airport-local times", () => {
    render(
      <SelfTransferNotice
        {...baseProps}
        segments={[
          {
            bookingId: "b1",
            bookingReference: "PNR-A",
            passengerEmail: "alice@example.com",
            flightNumber: "DL1234",
            airline: "DL",
            fromAirport: "JFK",
            toAirport: "LHR",
            departure: "2026-09-01T14:00:00Z",
            arrival: "2026-09-01T22:00:00Z",
            separateTickets: true,
            layoverMinutes: 90,
            riskLevel: "medium",
            riskExplanation:
              "Self-transfer connection: arrives LHR at 23:00 BST and departs LHR at 00:30 BST on separate tickets.",
            departureTimeZone: "America/New_York",
            arrivalTimeZone: "Europe/London",
            departureLocalTime: "10:00 EDT",
            arrivalLocalTime: "23:00 BST",
          },
        ]}
      />
    );
    expect(screen.getByText(/Connection details/i)).toBeInTheDocument();
    expect(screen.getByText(/DL1234/i)).toBeInTheDocument();
    expect(screen.getByText(/JFK → LHR/i)).toBeInTheDocument();
    expect(screen.getByText(/Separate tickets · 90 min layover/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00 EDT/i)).toBeInTheDocument();
    expect(screen.getByText(/23:00 BST/i)).toBeInTheDocument();
  });

  it("uses custom title when provided", () => {
    render(<SelfTransferNotice {...baseProps} title="Custom self-transfer warning" />);
    expect(screen.getByText(/Custom self-transfer warning/i)).toBeInTheDocument();
  });
});