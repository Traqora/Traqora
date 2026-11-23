import { AlertTriangle } from "lucide-react"
import type { AirportChangeNotice } from "./airport-change"

export function AirportChangeWarning({ notices }: { notices: AirportChangeNotice[] }) {
  if (notices.length === 0) return null

  return (
    <ul className="mt-2 space-y-1" aria-label="Airport change warnings">
      {notices.map((notice) => (
        <li
          key={`${notice.arrivedAt}-${notice.departsFrom}`}
          role="status"
          className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Change airports in {notice.metro}: arrive {notice.arrivedAt}, depart {notice.departsFrom}.
            Ground transfer required
            {notice.distanceKm != null ? ` (${notice.distanceKm} km)` : ""}.
          </span>
        </li>
      ))}
    </ul>
  )
}
