"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root error boundary (issue #334) — Next.js only invokes this for errors
 * thrown during rendering of the root layout itself, which is why it must
 * render its own <html>/<body> rather than relying on app/layout.tsx (that
 * may be what failed). Captures the crash to Sentry and offers the report
 * dialog so the user can attach what they were doing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const eventId = Sentry.captureException(error);

    Sentry.showReportDialog({
      eventId,
      title: "Something went wrong",
      subtitle: "Our team has been notified. Let us know what happened, if you'd like.",
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#64748b", maxWidth: "32rem" }}>
            We&apos;ve been notified and are looking into it. You can try again, or send us more
            details using the report dialog.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.375rem",
              border: "none",
              background: "#0f172a",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
