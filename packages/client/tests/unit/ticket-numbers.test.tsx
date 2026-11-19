import { render, screen } from "@testing-library/react"
import { isTicketed, TicketNumbers } from "@/components/booking/ticket-numbers"

describe("TicketNumbers", () => {
  it("shows ticket numbers separately from the booking reference", () => {
    render(
      <TicketNumbers
        bookingReference="ABC123"
        ticketNumbers={["0161234567890"]}
        reservationConfirmed
      />,
    )
    expect(screen.getByText(/ABC123/)).toBeInTheDocument()
    expect(screen.getByText(/0161234567890/)).toBeInTheDocument()
    expect(isTicketed([])).toBe(false)
  })

  it("does not treat a confirmed reservation as ticketed without numbers", () => {
    render(
      <TicketNumbers bookingReference="ABC123" ticketNumbers={[]} reservationConfirmed />,
    )
    expect(
      screen.getByText(/confirmed but not ticketed/i),
    ).toBeInTheDocument()
  })
})
