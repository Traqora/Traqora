"use client"

export interface RepriceConfirmationProps {
  acceptedCents: number
  confirmedCents: number
  onAccept: () => void
  onDecline: () => void
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function RepriceConfirmation({
  acceptedCents,
  confirmedCents,
  onAccept,
  onDecline,
}: RepriceConfirmationProps) {
  return (
    <div role="alertdialog" aria-labelledby="reprice-title" className="rounded-xl border p-4">
      <h2 id="reprice-title" className="text-lg font-semibold">
        Price changed
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The provider total is {formatUsd(confirmedCents)}, not the {formatUsd(acceptedCents)} you
        accepted. Review the new total before payment is captured.
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onAccept}>
          Accept new total
        </button>
        <button type="button" onClick={onDecline}>
          Decline
        </button>
      </div>
    </div>
  )
}
