import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RepriceConfirmation } from "@/components/booking/reprice-confirmation"

describe("RepriceConfirmation", () => {
  it("requires the traveler to accept a new total", async () => {
    const onAccept = jest.fn()
    const user = userEvent.setup()
    render(
      <RepriceConfirmation
        acceptedCents={19900}
        confirmedCents={22100}
        onAccept={onAccept}
        onDecline={jest.fn()}
      />,
    )

    expect(screen.getByText(/provider total is \$221.00/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Accept new total" }))
    expect(onAccept).toHaveBeenCalled()
  })
})
