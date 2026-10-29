"use client"

export interface SegmentCarriers {
  marketingCarrier: string
  operatingCarrier?: string | null
}

export interface CarrierLabelSet {
  marketedBy: string
  operatedBy: string
  isCodeshare: boolean
}

/** Build traveler-facing labels for marketing vs operating carriers (#903). */
export function formatCarrierLabels(segment: SegmentCarriers): CarrierLabelSet | null {
  const marketing = segment.marketingCarrier?.trim().toUpperCase()
  if (!marketing) return null
  const operating = segment.operatingCarrier?.trim().toUpperCase() || marketing
  return {
    marketedBy: `Marketed by ${marketing}`,
    operatedBy: `Operated by ${operating}`,
    isCodeshare: marketing !== operating,
  }
}

export function CarrierLabels({
  marketingCarrier,
  operatingCarrier,
}: SegmentCarriers) {
  const labels = formatCarrierLabels({ marketingCarrier, operatingCarrier })
  if (!labels) return null

  return (
    <div className="text-xs text-muted-foreground space-y-0.5" data-testid="carrier-labels">
      <div>{labels.marketedBy}</div>
      <div>{labels.operatedBy}</div>
    </div>
  )
}
