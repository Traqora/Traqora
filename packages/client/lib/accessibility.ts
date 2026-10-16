"use client"

import { useEffect, useCallback, useRef } from "react"

export const A11Y_KEYBOARD_KEYS = {
  ENTER: "Enter",
  ESCAPE: "Escape",
  TAB: "Tab",
  SPACE: " ",
  ARROW_UP: "ArrowUp",
  ARROW_DOWN: "ArrowDown",
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  HOME: "Home",
  END: "End",
} as const

type KeyboardKey = string

interface KeyboardHandlers {
  onEnter?: (event: KeyboardEvent) => void
  onEscape?: (event: KeyboardEvent) => void
  onTab?: (event: KeyboardEvent) => void
  onArrowUp?: (event: KeyboardEvent) => void
  onArrowDown?: (event: KeyboardEvent) => void
  onArrowLeft?: (event: KeyboardEvent) => void
  onArrowRight?: (event: KeyboardEvent) => void
  onHome?: (event: KeyboardEvent) => void
  onEnd?: (event: KeyboardEvent) => void
  onSpace?: (event: KeyboardEvent) => void
}

export function handleKeyboardNavigation(
  event: KeyboardEvent,
  handlers: KeyboardHandlers,
): void {
  const key = event.key
  const handlerMap: Record<string, ((event: KeyboardEvent) => void) | undefined> = {
    [A11Y_KEYBOARD_KEYS.ENTER]: handlers.onEnter,
    [A11Y_KEYBOARD_KEYS.ESCAPE]: handlers.onEscape,
    [A11Y_KEYBOARD_KEYS.TAB]: handlers.onTab,
    [A11Y_KEYBOARD_KEYS.ARROW_UP]: handlers.onArrowUp,
    [A11Y_KEYBOARD_KEYS.ARROW_DOWN]: handlers.onArrowDown,
    [A11Y_KEYBOARD_KEYS.ARROW_LEFT]: handlers.onArrowLeft,
    [A11Y_KEYBOARD_KEYS.ARROW_RIGHT]: handlers.onArrowRight,
    [A11Y_KEYBOARD_KEYS.HOME]: handlers.onHome,
    [A11Y_KEYBOARD_KEYS.END]: handlers.onEnd,
    [A11Y_KEYBOARD_KEYS.SPACE]: handlers.onSpace,
  }

  const handler = handlerMap[key]
  if (handler) {
    handler(event)
  }
}

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "area[href]",
  "[contenteditable]:not([contenteditable='false'])",
].join(", ")

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
  ).filter((el) => isVisible(el))
}

export function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false
  if (element.getAttribute("aria-hidden") === "true") return false
  if (element.style.display === "none") return false
  if (element.style.visibility === "hidden") return false
  if (element.disabled) return false
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  return true
}

export function setInitialFocus(
  container: HTMLElement,
  preferredSelector?: string,
): boolean {
  if (preferredSelector) {
    const preferred = container.querySelector<HTMLElement>(preferredSelector)
    if (preferred && isVisible(preferred)) {
      preferred.focus()
      return true
    }
  }

  const focusable = getFocusableElements(container)
  if (focusable.length > 0) {
    focusable[0].focus()
    return true
  }

  container.setAttribute("tabindex", "-1")
  container.focus()
  return false
}

export function restoreFocus(previousElement: HTMLElement | null): void {
  if (previousElement && typeof previousElement.focus === "function") {
    previousElement.focus()
  }
}

export function announce(message: string, priority: "polite" | "assertive" = "polite"): void {
  if (typeof document === "undefined") return

  const id = priority === "assertive" ? "a11y-assertive-announce" : "a11y-polite-announce"
  let liveRegion = document.getElementById(id)

  if (!liveRegion) {
    liveRegion = document.createElement("div")
    liveRegion.id = id
    liveRegion.setAttribute("aria-live", priority)
    liveRegion.setAttribute("aria-atomic", "true")
    liveRegion.className = "sr-only"
    document.body.appendChild(liveRegion)
  }

  liveRegion.textContent = ""
  requestAnimationFrame(() => {
    liveRegion!.textContent = message
  })
}

let toastLiveTimer: ReturnType<typeof setTimeout> | null = null

export function announceToast(message: string, duration = 5000): void {
  if (typeof document === "undefined") return

  let container = document.getElementById("a11y-toast-live")
  if (!container) {
    container = document.createElement("div")
    container.id = "a11y-toast-live"
    container.setAttribute("aria-live", "polite")
    container.setAttribute("aria-atomic", "true")
    container.className = "sr-only"
    document.body.appendChild(container)
  }

  if (toastLiveTimer) {
    clearTimeout(toastLiveTimer)
  }

  container.textContent = ""
  requestAnimationFrame(() => {
    container!.textContent = message
  })

  toastLiveTimer = setTimeout(() => {
    if (container) {
      container.textContent = ""
    }
  }, duration)
}

interface FocusTrapOptions {
  initialFocus?: string
  returnFocusOnDeactivate?: boolean
  previousActiveElement?: HTMLElement | null
}

export function focusTrap(element: HTMLElement | null, options: FocusTrapOptions = {}): () => void {
  if (!element) return () => {}

  const previousActive = options.previousActiveElement ?? document.activeElement as HTMLElement | null

  setInitialFocus(element, options.initialFocus)

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Tab") return

    const focusable = getFocusableElements(element!)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  element.addEventListener("keydown", handleKeyDown)

  return () => {
    element?.removeEventListener("keydown", handleKeyDown)
    if (options.returnFocusOnDeactivate !== false) {
      restoreFocus(previousActive)
    }
  }
}

export function useAnnounce() {
  return {
    announce: useCallback(
      (message: string, priority: "polite" | "assertive" = "polite") => {
        announce(message, priority)
      },
      [],
    ),
    announceToast: useCallback((message: string, duration?: number) => {
      announceToast(message, duration)
    }, []),
  }
}

export function useFocusTrap(
  elementRef: React.RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {},
) {
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!elementRef.current) return

    cleanupRef.current = focusTrap(elementRef.current, {
      ...options,
      previousActiveElement: (document.activeElement as HTMLElement) ?? undefined,
    })

    return () => {
      cleanupRef.current?.()
    }
  }, [elementRef, options.initialFocus, options.returnFocusOnDeactivate])

  return {
    activate: useCallback(() => {
      if (elementRef.current) {
        cleanupRef.current = focusTrap(elementRef.current, {
          ...options,
          previousActiveElement: (document.activeElement as HTMLElement) ?? undefined,
        })
      }
    }, [elementRef, options]),
    deactivate: useCallback(() => {
      cleanupRef.current?.()
      if (options.returnFocusOnDeactivate !== false && options.previousActiveElement) {
        restoreFocus(options.previousActiveElement)
      }
    }, [options]),
  }
}

export class LiveRegionManager {
  private politeRegion: HTMLElement | null = null
  private assertiveRegion: HTMLElement | null = null

  constructor() {
    if (typeof document === "undefined") return
    this.politeRegion = document.getElementById("a11y-polite-announce")
    this.assertiveRegion = document.getElementById("a11y-assertive-announce")
  }

  announcePolite(message: string): void {
    this.announce(message, "polite")
  }

  announceAssertive(message: string): void {
    this.announce(message, "assertive")
  }

  clear(): void {
    if (this.politeRegion) this.politeRegion.textContent = ""
    if (this.assertiveRegion) this.assertiveRegion.textContent = ""
  }

  private announce(message: string, priority: "polite" | "assertive"): void {
    const region = priority === "assertive" ? this.assertiveRegion : this.politeRegion
    if (!region) return
    region.textContent = ""
    requestAnimationFrame(() => {
      region.textContent = message
    })
  }
}
