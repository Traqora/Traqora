/**
 * Unit tests for the SkipNav component.
 *
 * Contract: SkipNav MUST render a single anchor whose href points to
 * "#main-content" and whose visible text is "Skip to main content".
 * The link must be the first interactive element encountered by keyboard
 * and assistive-technology users so they can bypass repeated navigation.
 *
 * Regression tests: happy-path render + two failure-mode paths that guard
 * the contract invariants (wrong href, missing/empty text).
 */
import { render, screen } from "@testing-library/react"
import { SkipNav } from "@/components/skip-nav"

describe("SkipNav", () => {
  it("renders a link to #main-content", () => {
    render(<SkipNav />)

    const link = screen.getByRole("link", { name: /skip to main content/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "#main-content")
  })

  it('contains the text "Skip to main content"', () => {
    render(<SkipNav />)

    expect(screen.getByText("Skip to main content")).toBeInTheDocument()
  })

  it("renders exactly one link", () => {
    render(<SkipNav />)

    // There must be exactly one skip-nav link — two would confuse AT users.
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it("carries the skip-to-content class for CSS positioning", () => {
    render(<SkipNav />)

    const link = screen.getByRole("link")
    expect(link).toHaveClass("skip-to-content")
  })
})

// ---------------------------------------------------------------------------
// Failure-mode guard: the tests below exist to catch regressions that would
// silently break keyboard accessibility without a visible UI change.
// ---------------------------------------------------------------------------
describe("SkipNav – regression guards", () => {
  /**
   * If the href ever changes away from "#main-content" the skip link stops
   * working: pressing Enter on a focused skip link would navigate nowhere
   * useful. This test pins the exact target id.
   */
  it("href is exactly '#main-content', not a different anchor", () => {
    render(<SkipNav />)

    const link = screen.getByRole("link")
    // A typo like "#main" or "#content" would still pass a contains check,
    // so we use toEqual for an exact match.
    expect(link.getAttribute("href")).toEqual("#main-content")
  })

  /**
   * An empty or missing accessible name would make the link invisible to
   * screen-reader users who navigate by landmark / link list. The name must
   * be non-empty and match the expected copy.
   */
  it("has a non-empty accessible name", () => {
    render(<SkipNav />)

    const link = screen.getByRole("link")
    const name = link.textContent?.trim() ?? ""
    expect(name.length).toBeGreaterThan(0)
  })
})
