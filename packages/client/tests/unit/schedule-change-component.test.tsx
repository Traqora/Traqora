/**
 * Component coverage for supplier schedule changes (issue #1145).
 * Runs with the full client toolchain (React, Next and jsdom).
 */

import { render, screen } from "@testing-library/react";
import { ScheduleChangeList } from "@/components/booking/schedule-change";
import type { ScheduleChange } from "@/components/booking/schedule-change";

const change: ScheduleChange = {
  id: "change-1",
  flightNumber: "DL 1234",
  originalDeparture: "2026-12-15T08:30:00Z",
  revisedDeparture: "2026-12-15T09:45:00Z",
  verifiedBy: "provider",
  verifiedAt: "2026-11-20T10:00:00Z",
};

describe("ScheduleChangeList (issue #1145)", () => {
  it("renders nothing when there are no verified changes", () => {
    const { container } = render(<ScheduleChangeList changes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the original and revised departures side by side", () => {
    render(<ScheduleChangeList changes={[change]} />);

    expect(
      screen.getByRole("heading", { name: "Supplier schedule changes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Originally purchased")).toBeInTheDocument();
    expect(screen.getByText("Revised departure")).toBeInTheDocument();
    expect(screen.getByText(change.originalDeparture)).toBeInTheDocument();
    expect(screen.getByText(change.revisedDeparture)).toBeInTheDocument();
  });

  it("labels the change as supplier verified", () => {
    render(<ScheduleChangeList changes={[change]} />);
    expect(screen.getByText(/verified by supplier/i)).toBeInTheDocument();
  });

  it("renders provider metadata and escapes free text as text only", () => {
    const { container } = render(
      <ScheduleChangeList
        changes={[
          {
            ...change,
            reason: "<script>alert(1)</script>",
            providerOfferId: "offer-abc",
          },
        ]}
      />,
    );

    expect(screen.getByText(/supplier offer: offer-abc/i)).toBeInTheDocument();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("exposes a polite live region for assistive technology", () => {
    render(<ScheduleChangeList changes={[change]} />);
    expect(screen.getByRole("list")).toHaveAttribute("aria-live", "polite");
  });
});
