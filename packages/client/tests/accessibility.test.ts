import { renderHook, act } from "@testing-library/react"
import {
  A11Y_KEYBOARD_KEYS,
  handleKeyboardNavigation,
  getFocusableElements,
  isVisible,
  setInitialFocus,
  restoreFocus,
  announce,
  announceToast,
  focusTrap,
  useAnnounce,
  useFocusTrap,
  LiveRegionManager,
} from "../lib/accessibility"

// jsdom has no layout engine, so every element's getBoundingClientRect() is
// zeroed by default — isVisible() would treat everything as invisible.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = jest.fn(() => ({
    width: 100,
    height: 20,
    top: 0,
    left: 0,
    bottom: 20,
    right: 100,
    x: 0,
    y: 0,
    toJSON() {},
  }))
  // Run rAF callbacks synchronously so live-region assertions don't need to await a frame.
  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0)
    return 0
  }) as typeof requestAnimationFrame
})

afterEach(() => {
  document.body.innerHTML = ""
  document.getElementById("a11y-polite-announce")?.remove()
  document.getElementById("a11y-assertive-announce")?.remove()
  document.getElementById("a11y-toast-live")?.remove()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe("handleKeyboardNavigation", () => {
  it("invokes the handler mapped to the pressed key", () => {
    const onEnter = jest.fn()
    const onEscape = jest.fn()
    const event = new KeyboardEvent("keydown", { key: A11Y_KEYBOARD_KEYS.ENTER })

    handleKeyboardNavigation(event, { onEnter, onEscape })

    expect(onEnter).toHaveBeenCalledWith(event)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it("does nothing when no handler is registered for the key", () => {
    const onEnter = jest.fn()
    const event = new KeyboardEvent("keydown", { key: A11Y_KEYBOARD_KEYS.ARROW_DOWN })

    expect(() => handleKeyboardNavigation(event, { onEnter })).not.toThrow()
    expect(onEnter).not.toHaveBeenCalled()
  })
})

describe("isVisible", () => {
  it("returns true for a plain visible element", () => {
    const el = document.createElement("button")
    document.body.appendChild(el)
    expect(isVisible(el)).toBe(true)
  })

  it("returns false when hidden attribute is set", () => {
    const el = document.createElement("div")
    el.hidden = true
    expect(isVisible(el)).toBe(false)
  })

  it("returns false when aria-hidden is true", () => {
    const el = document.createElement("div")
    el.setAttribute("aria-hidden", "true")
    expect(isVisible(el)).toBe(false)
  })

  it("returns false when display is none", () => {
    const el = document.createElement("div")
    el.style.display = "none"
    expect(isVisible(el)).toBe(false)
  })

  it("returns false when visibility is hidden", () => {
    const el = document.createElement("div")
    el.style.visibility = "hidden"
    expect(isVisible(el)).toBe(false)
  })

  it("returns false for a disabled form control", () => {
    const el = document.createElement("button")
    el.disabled = true
    expect(isVisible(el)).toBe(false)
  })

  it("returns false when the element has zero size", () => {
    const el = document.createElement("div")
    // Own-property override (not jest.spyOn): spying on a method only
    // present on Element.prototype mutates the shared prototype in this
    // jsdom/jest combo and doesn't reliably revert via restoreAllMocks.
    el.getBoundingClientRect = () => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON() {},
    })
    expect(isVisible(el)).toBe(false)
  })
})

describe("getFocusableElements", () => {
  it("returns focusable, visible descendants in DOM order", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <button>One</button>
      <button disabled>Disabled</button>
      <a href="/somewhere">Link</a>
      <input type="text" />
      <div tabindex="-1">Not focusable</div>
      <div tabindex="0">Focusable div</div>
    `
    document.body.appendChild(container)

    const focusable = getFocusableElements(container)

    expect(focusable).toHaveLength(4)
    expect(focusable.map((el) => el.tagName)).toEqual(["BUTTON", "A", "INPUT", "DIV"])
  })

  it("excludes elements hidden via aria-hidden", () => {
    const container = document.createElement("div")
    container.innerHTML = `<button aria-hidden="true">Hidden</button><button>Visible</button>`
    document.body.appendChild(container)

    const focusable = getFocusableElements(container)

    expect(focusable).toHaveLength(1)
    expect(focusable[0].textContent).toBe("Visible")
  })
})

describe("setInitialFocus", () => {
  it("focuses the preferred selector when present and visible", () => {
    const container = document.createElement("div")
    container.innerHTML = `<button id="a">A</button><button id="b" data-preferred>B</button>`
    document.body.appendChild(container)

    const result = setInitialFocus(container, "[data-preferred]")

    expect(result).toBe(true)
    expect(document.activeElement).toBe(container.querySelector("#b"))
  })

  it("falls back to the first focusable element when no preferred selector matches", () => {
    const container = document.createElement("div")
    container.innerHTML = `<button id="a">A</button><button id="b">B</button>`
    document.body.appendChild(container)

    const result = setInitialFocus(container)

    expect(result).toBe(true)
    expect(document.activeElement).toBe(container.querySelector("#a"))
  })

  it("focuses the container itself when nothing is focusable", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const result = setInitialFocus(container)

    expect(result).toBe(false)
    expect(container.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(container)
  })
})

describe("restoreFocus", () => {
  it("focuses the given element", () => {
    const el = document.createElement("button")
    document.body.appendChild(el)

    restoreFocus(el)

    expect(document.activeElement).toBe(el)
  })

  it("does nothing when passed null", () => {
    expect(() => restoreFocus(null)).not.toThrow()
  })
})

describe("announce", () => {
  it("creates a polite live region and sets its text", () => {
    announce("Booking confirmed")

    const region = document.getElementById("a11y-polite-announce")
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toHaveAttribute("aria-atomic", "true")
    expect(region?.textContent).toBe("Booking confirmed")
  })

  it("creates an assertive live region when requested", () => {
    announce("Payment failed", "assertive")

    const region = document.getElementById("a11y-assertive-announce")
    expect(region).toHaveAttribute("aria-live", "assertive")
    expect(region?.textContent).toBe("Payment failed")
  })

  it("reuses an existing live region instead of creating duplicates", () => {
    announce("First message")
    announce("Second message")

    expect(document.querySelectorAll("#a11y-polite-announce")).toHaveLength(1)
    expect(document.getElementById("a11y-polite-announce")?.textContent).toBe("Second message")
  })
})

describe("announceToast", () => {
  it("creates a toast live region and clears it after the duration", async () => {
    announceToast("Saved", 10)
    const container = document.getElementById("a11y-toast-live")
    expect(container?.textContent).toBe("Saved")

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(container?.textContent).toBe("")
  })

  it("cancels a pending clear timer when a new toast is announced", async () => {
    announceToast("First toast", 20)
    announceToast("Second toast", 20)

    const container = document.getElementById("a11y-toast-live")
    expect(container?.textContent).toBe("Second toast")

    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(container?.textContent).toBe("")
  })
})

describe("focusTrap", () => {
  it("returns a no-op cleanup function when element is null", () => {
    const cleanup = focusTrap(null)
    expect(() => cleanup()).not.toThrow()
  })

  it("prevents Tab from doing anything when there is nothing focusable", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const cleanup = focusTrap(container)
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    container.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    cleanup()
  })

  it("wraps focus from the last to the first element on Tab", () => {
    const container = document.createElement("div")
    container.innerHTML = `<button id="first">First</button><button id="last">Last</button>`
    document.body.appendChild(container)

    const cleanup = focusTrap(container)
    const first = container.querySelector<HTMLElement>("#first")!
    const last = container.querySelector<HTMLElement>("#last")!
    last.focus()

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    container.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    cleanup()
  })

  it("wraps focus from the first to the last element on Shift+Tab", () => {
    const container = document.createElement("div")
    container.innerHTML = `<button id="first">First</button><button id="last">Last</button>`
    document.body.appendChild(container)

    const cleanup = focusTrap(container)
    const first = container.querySelector<HTMLElement>("#first")!
    const last = container.querySelector<HTMLElement>("#last")!
    first.focus()

    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })
    container.dispatchEvent(event)

    expect(document.activeElement).toBe(last)

    cleanup()
  })

  it("restores focus to the previously active element on cleanup", () => {
    const trigger = document.createElement("button")
    document.body.appendChild(trigger)
    trigger.focus()

    const container = document.createElement("div")
    container.innerHTML = `<button>Inside</button>`
    document.body.appendChild(container)

    const cleanup = focusTrap(container, { previousActiveElement: trigger })
    cleanup()

    expect(document.activeElement).toBe(trigger)
  })

  it("does not restore focus when returnFocusOnDeactivate is false", () => {
    const trigger = document.createElement("button")
    document.body.appendChild(trigger)
    trigger.focus()

    const container = document.createElement("div")
    container.innerHTML = `<button id="inside">Inside</button>`
    document.body.appendChild(container)

    const cleanup = focusTrap(container, {
      previousActiveElement: trigger,
      returnFocusOnDeactivate: false,
    })
    cleanup()

    expect(document.activeElement).not.toBe(trigger)
  })
})

describe("useAnnounce", () => {
  it("exposes stable announce and announceToast callbacks", () => {
    const { result } = renderHook(() => useAnnounce())

    act(() => {
      result.current.announce("Hello from hook")
    })

    expect(document.getElementById("a11y-polite-announce")?.textContent).toBe("Hello from hook")

    act(() => {
      result.current.announceToast("Toast from hook")
    })

    expect(document.getElementById("a11y-toast-live")?.textContent).toBe("Toast from hook")
  })
})

describe("useFocusTrap", () => {
  it("activates a focus trap on mount and cleans up on unmount", () => {
    const container = document.createElement("div")
    container.innerHTML = `<button id="first">First</button><button id="last">Last</button>`
    document.body.appendChild(container)
    const ref = { current: container }

    const { unmount } = renderHook(() => useFocusTrap(ref))

    expect(document.activeElement).toBe(container.querySelector("#first"))

    unmount()
  })

  it("exposes activate/deactivate that (re)engage the trap on demand", () => {
    const trigger = document.createElement("button")
    document.body.appendChild(trigger)
    trigger.focus()

    const container = document.createElement("div")
    container.innerHTML = `<button id="first">First</button>`
    document.body.appendChild(container)
    const ref = { current: container }

    const { result, unmount } = renderHook(() =>
      useFocusTrap(ref, { previousActiveElement: trigger }),
    )

    act(() => {
      result.current.deactivate()
    })
    expect(document.activeElement).toBe(trigger)

    act(() => {
      result.current.activate()
    })
    expect(document.activeElement).toBe(container.querySelector("#first"))

    unmount()
  })
})

describe("LiveRegionManager", () => {
  it("announces polite and assertive messages to existing regions", () => {
    announce("") // ensures the polite region exists
    announce("", "assertive") // ensures the assertive region exists

    const manager = new LiveRegionManager()
    manager.announcePolite("Polite message")
    manager.announceAssertive("Assertive message")

    expect(document.getElementById("a11y-polite-announce")?.textContent).toBe("Polite message")
    expect(document.getElementById("a11y-assertive-announce")?.textContent).toBe("Assertive message")
  })

  it("clears both regions", () => {
    announce("Something")
    announce("Something else", "assertive")

    const manager = new LiveRegionManager()
    manager.clear()

    expect(document.getElementById("a11y-polite-announce")?.textContent).toBe("")
    expect(document.getElementById("a11y-assertive-announce")?.textContent).toBe("")
  })

  it("does nothing when regions don't exist yet", () => {
    const manager = new LiveRegionManager()
    expect(() => manager.announcePolite("x")).not.toThrow()
    expect(() => manager.clear()).not.toThrow()
  })
})
