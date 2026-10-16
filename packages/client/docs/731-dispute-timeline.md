# Issue #731: Dispute Timeline UI

## Overview

Added a `DisputeTimeline` component to the disputes client UI that shows all dispute phases in a visual timeline.

## Features

- Visual timeline showing all dispute phases: Created → Evidence → Jury Selection → Commit Vote → Reveal Vote → Appeal → Finalized
- Phase status indicators (completed, active, upcoming, failed)
- Current phase highlighting
- Progress calculation based on current phase
- Summary cards showing total phases, current phase, and completion count

## Files

- `packages/client/components/disputes/DisputeTimeline.tsx` — Main component
- `packages/client/app/disputes/page.tsx` — Dedicated page

## Usage

```tsx
import { DisputeTimeline } from "@/components/disputes/DisputeTimeline";

<DisputeTimeline
  disputeId="dispute-456"
  phases={phases}
  currentPhase="reveal_vote"
  title="Dispute Details"
/>
```

## Testing

Manual verification via `/disputes` route.
