import { isTicketed, presentTicketing } from "./airlineTicketing";

describe("airline ticketing (#905)", () => {
  it("does not treat a confirmed reservation as ticketed without a ticket number", () => {
    expect(
      isTicketed({
        bookingReference: "TRQ-ABCDEFGHJKLMNPQR",
        status: "confirmed",
        ticketNumbers: [],
      }),
    ).toBe(false);
  });

  it("presents ticket numbers separately from the booking reference", () => {
    const view = presentTicketing({
      bookingReference: "ABC123",
      ticketNumbers: ["0161234567890"],
      status: "confirmed",
    });
    expect(view.bookingReference).toBe("ABC123");
    expect(view.ticketNumbers).toEqual(["0161234567890"]);
    expect(view.ticketed).toBe(true);
  });
});
