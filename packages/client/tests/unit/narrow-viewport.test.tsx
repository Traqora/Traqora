/**
 * Narrow-viewport regression coverage for the v1 itinerary/self-service detail
 * surface (issue #1147). jsdom cannot measure layout, so these tests assert the
 * structural contracts that keep status, dates and actions usable when the
 * available width is small: stacking grids, wrapping rows, bounded text and
 * full-width touch targets.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { BookingDetailStateView } from "@/components/booking/booking-detail-state"
import { ScheduleChangeList } from "@/components/booking/schedule-change"
import type { ScheduleChange } from "@/components/booking/schedule-change"

const change: ScheduleChange = {
  id: "change-1",
  flightNumber: "DL 1234",
  originalDeparture: "2026-12-15T08:30:00Z",
  revisedDeparture: "2026-12-15T09:45:00Z",
  verifiedBy: "provider",
  verifiedAt: "2026-11-20T10:00:00Z",
}

describe("V1 booking detail narrow viewports (issue #1147)", () => {
  describe("BookingDetailStateView", () => {
    it("stacks the status header and keeps long copy inside the viewport", () => {
      render(<BookingDetailStateView state="unavailable" />)

      const status = screen.getByRole("status")
      expect(status).toHaveAttribute("data-state", "unavailable")
      expect(status).toHaveAttribute("aria-live", "polite")
      expect(status.className).toContain("w-full")
      expect(status.className).toContain("min-w-0")

      const header = status.querySelector('[data-slot="card-header"]')
      expect(header?.className).toContain("flex-col")
      expect(header?.className).toContain("sm:flex-row")

      const text = header?.querySelector(".min-w-0.space-y-1")
      expect(text).not.toBeNull()
      expect(text?.querySelector(".break-words")).not.toBeNull()
    })

    it("wraps actions and gives them full-width touch targets on narrow screens", () => {
      const onBack = jest.fn()
      render(<BookingDetailStateView state="missing" onBack={onBack} />)

      const content = screen.getByRole("status").querySelector('[data-slot="card-content"]')
      expect(content?.className).toContain("flex")
      expect(content?.className).toContain("flex-wrap")

      const back = screen.getByRole("button", { name: /back to bookings/i })
      expect(back.className).toContain("w-full")
      expect(back.className).toContain("sm:w-auto")
      fireEvent.click(back)
      expect(onBack).toHaveBeenCalledTimes(1)
    })

    it("keeps the retry action reachable without expanding the copy table", () => {
      const onRetry = jest.fn()
      render(<BookingDetailStateView state="unavailable" onRetry={onRetry} />)

      const retry = screen.getByRole("button", { name: /try again/i })
      expect(retry.className).toContain("w-full")
      expect(retry.className).toContain("sm:w-auto")
      fireEvent.click(retry)
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/token=/i)).not.toBeInTheDocument()
    })

    it("bounds the loading skeleton so it cannot overflow a narrow viewport", () => {
      render(<BookingDetailStateView state="missing" isLoading />)

      const status = screen.getByRole("status")
      expect(status).toHaveAttribute("aria-busy", "true")
      expect(status.className).toContain("min-w-0")
      const firstSkeleton = status.querySelector(".animate-pulse")
      expect(firstSkeleton?.className).toContain("w-full")
      expect(firstSkeleton?.className).toContain("max-w-56")
      expect(screen.getByText(/loading booking details/i)).toBeInTheDocument()
    })
  })

  describe("ScheduleChangeList", () => {
    it("stacks original and revised dates on narrow screens and wraps the badge", () => {
      render(<ScheduleChangeList changes={[change]} />)

      const heading = screen.getByRole("heading", { name: "Supplier schedule changes" })
      expect(heading.parentElement?.className).toContain("flex-wrap")

      const dates = screen.getByText("Originally purchased").parentElement?.parentElement
      expect(dates?.className).toContain("grid-cols-1")
      expect(dates?.className).toContain("sm:grid-cols-2")
      expect(screen.getByText(change.originalDeparture).className).toContain("break-words")
      expect(screen.getByText(change.revisedDeparture).className).toContain("break-words")
      expect(screen.getByRole("list")).toHaveAttribute("aria-live", "polite")
    })

    it("keeps long provider metadata from forcing horizontal overflow", () => {
      const longOfferId = `offer-${"x".repeat(120)}`
      render(
        <ScheduleChangeList
          changes={[
            {
              ...change,
              providerOfferId: longOfferId,
              reason: "<script>alert(1)</script>",
            },
          ]}
        />,
      )

      const offer = screen.getByText(new RegExp(longOfferId))
      expect(offer.className).toContain("break-words")
      expect(screen.getByText(/<script>alert\(1\)<\/script>/).className).toContain("break-words")
      expect(document.querySelector("script")).toBeNull()
    })

    it("renders nothing when there are no verified changes", () => {
      const { container } = render(<ScheduleChangeList changes={[]} />)
      expect(container).toBeEmptyDOMElement()
    })
  })
})
