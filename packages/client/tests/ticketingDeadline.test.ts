import { presentTicketingDeadline } from "../lib/ticketingDeadline";

describe("itinerary ticketing deadline (#906)", () => {
  it("labels the provider deadline Ticket by and does not reuse the departure instant", () => {
    const presented = presentTicketingDeadline(
      "2026-11-01T23:59:59.000Z",
      "2026-11-02T08:00:00.000Z",
    );
    expect(presented?.heading).toBe("Ticket by");
    expect(presented?.when).toContain("Nov");
    expect(presented?.when).not.toContain("08:00");
    expect(presented?.sameInstantAsDeparture).toBe(false);
  });

  it("returns null for a missing or unreadable deadline instead of the departure", () => {
    expect(presentTicketingDeadline(null, "2026-11-02T08:00:00.000Z")).toBeNull();
    expect(presentTicketingDeadline("not-a-date", "2026-11-02T08:00:00.000Z")).toBeNull();
  });

  it("keeps the Ticket by label when the clock time matches departure", () => {
    const presented = presentTicketingDeadline(
      "2026-11-02T08:00:00.000Z",
      "2026-11-02T08:00:00.000Z",
    );
    expect(presented?.heading).toBe("Ticket by");
    expect(presented?.sameInstantAsDeparture).toBe(true);
  });

  it("shows a corrected deadline after a missing one", () => {
    expect(presentTicketingDeadline(undefined, "2026-11-02T08:00:00.000Z")).toBeNull();
    const retried = presentTicketingDeadline(
      "2026-11-01T18:00:00.000Z",
      "2026-11-02T08:00:00.000Z",
    );
    expect(retried?.heading).toBe("Ticket by");
    expect(retried?.sameInstantAsDeparture).toBe(false);
  });
});
