import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { DateFlexSearch } from "../../components/flight-search/date-flex-search"

describe("DateFlexSearch", () => {
  it("renders with default values and submits successfully on valid input", () => {
    const handleSearch = jest.fn()
    render(<DateFlexSearch defaultFrom="JFK" defaultTo="LAX" defaultDate="2025-06-01" onSearch={handleSearch} />)

    const submitButton = screen.getByRole("button", { name: /search flexible dates/i })
    fireEvent.click(submitButton)

    expect(handleSearch).toHaveBeenCalledTimes(1)
    expect(handleSearch).toHaveBeenCalledWith({
      from: "JFK",
      to: "LAX",
      date: "2025-06-01",
      flexDays: 3,
      passengers: 1,
      cabinClass: "economy",
    })
  })

  it("shows error when origin and destination are the same", () => {
    const handleSearch = jest.fn()
    render(<DateFlexSearch defaultFrom="JFK" defaultTo="JFK" defaultDate="2025-06-01" onSearch={handleSearch} />)

    const submitButton = screen.getByRole("button", { name: /search flexible dates/i })
    fireEvent.click(submitButton)

    expect(screen.getByRole("alert")).toHaveTextContent("Origin and destination cannot be the same airport.")
    expect(handleSearch).not.toHaveBeenCalled()
  })

  it("shows error when airport codes are empty", () => {
    const handleSearch = jest.fn()
    render(<DateFlexSearch defaultFrom="" defaultTo="LAX" defaultDate="2025-06-01" onSearch={handleSearch} />)

    const submitButton = screen.getByRole("button", { name: /search flexible dates/i })
    fireEvent.click(submitButton)

    expect(screen.getByRole("alert")).toHaveTextContent("Origin and destination airports are required.")
    expect(handleSearch).not.toHaveBeenCalled()
  })
})
