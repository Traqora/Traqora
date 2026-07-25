/**
 * SkipNav — keyboard skip-navigation link (WCAG 2.4.1 Bypass Blocks).
 *
 * Rendered as the very first focusable element in the document. Visually
 * hidden until focused; activating it jumps keyboard focus directly to the
 * main content region, bypassing the repeated navigation bar.
 *
 * Usage:
 *   1. Mount <SkipNav /> as the first child of <body>.
 *   2. Add `id="main-content"` to the primary <main> element.
 */
export function SkipNav() {
  return (
    <a
      href="#main-content"
      className={[
        // Hidden off-screen by default
        "absolute -top-full left-4 z-[9999]",
        // Visible and in-flow when focused
        "focus:top-4",
        // Styling
        "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
        "shadow-lg ring-2 ring-primary ring-offset-2 transition-all duration-150",
        "focus:outline-none",
      ].join(" ")}
    >
      Skip to main content
    </a>
  );
}
