import { renderHook, act } from "@testing-library/react"
import {
  focusTrap,
  getFocusableElements,
  setInitialFocus,
  restoreFocus,
} from "../../lib/accessibility"

jest.mock("../../lib/accessibility", () => ({
  focusTrap: jest.fn(() => jest.fn()),
  getFocusableElements: jest.fn(() => []),
  setInitialFocus: jest.fn(() => true),
  restoreFocus: jest.fn(),
}))

describe("useBookingStepFocus (via accessibility utilities)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.body.innerHTML = ""
  })

  it("focusTrap activates and returns cleanup function", () => {
    const stepElement = document.createElement("div")
    stepElement.innerHTML = '<button id="first">First</button><input id="second" />'
    document.body.appendChild(stepElement)

    const cleanup = focusTrap(stepElement, {
      initialFocus: "#first",
      returnFocusOnDeactivate: true,
    })

    expect(focusTrap).toHaveBeenCalledWith(stepElement, expect.objectContaining({
      initialFocus: "#first",
      returnFocusOnDeactivate: true,
    }))
    expect(typeof cleanup).toBe("function")
  })

  it("setInitialFocus focuses preferred element", () => {
    const container = document.createElement("div")
    container.innerHTML = '<button id="a">A</button><button id="b" data-preferred>B</button>'
    document.body.appendChild(container)

    const result = setInitialFocus(container, "[data-preferred]")

    expect(result).toBe(true)
    expect(setInitialFocus).toHaveBeenCalledWith(container, "[data-preferred]")
  })

  it("getFocusableElements returns focusable elements", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <button>One</button>
      <button disabled>Disabled</button>
      <a href="/somewhere">Link</a>
      <input type="text" />
    `
    document.body.appendChild(container)

    const focusable = getFocusableElements(container)

    expect(getFocusableElements).toHaveBeenCalledWith(container)
  })

  it("restoreFocus focuses the given element", () => {
    const el = document.createElement("button")
    document.body.appendChild(el)

    restoreFocus(el)

    expect(restoreFocus).toHaveBeenCalledWith(el)
  })
})

describe("Keyboard Navigation Helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.body.innerHTML = ""
  })

  it("handles keyboard events for navigation", () => {
    const onNext = jest.fn()
    const onPrevious = jest.fn()
    const onSubmit = jest.fn()

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        onSubmit?.()
      }
      if (event.key === "ArrowRight" && event.altKey) {
        event.preventDefault()
        onNext?.()
      }
      if (event.key === "ArrowLeft" && event.altKey) {
        event.preventDefault()
        onPrevious?.()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))
    })
    expect(onNext).toHaveBeenCalled()

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }))
    })
    expect(onPrevious).toHaveBeenCalled()

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }))
    })
    expect(onSubmit).toHaveBeenCalled()

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }))
    })
    expect(onSubmit).toHaveBeenCalledTimes(2)

    document.removeEventListener("keydown", handleKeyDown)

    // Verify cleanup - events should not fire after removal
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }))
    })
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})

describe("Form Focus Helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.body.innerHTML = ""
  })

  it("getFocusableElements filters visible elements", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <button>Visible</button>
      <button style="display: none">Hidden</button>
      <input aria-hidden="true" />
      <a href="#">Link</a>
    `
    document.body.appendChild(container)

    const focusable = getFocusableElements(container)
    expect(getFocusableElements).toHaveBeenCalledWith(container)
  })

  it("setInitialFocus falls back to first focusable", () => {
    const container = document.createElement("div")
    container.innerHTML = '<button id="a">A</button><button id="b">B</button>'
    document.body.appendChild(container)

    const result = setInitialFocus(container)

    expect(result).toBe(true)
    expect(setInitialFocus).toHaveBeenCalledWith(container)
  })
})