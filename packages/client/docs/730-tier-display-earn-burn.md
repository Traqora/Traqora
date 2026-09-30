# Issue #730: Tier Display Earn/Burn UX

## Overview

Added a `TierEarnBurn` component to the loyalty client UI that displays tier progression with earn/burn visualization.

## Features

- Current tier display with progress bar
- Earn vs Burn ratio visualization with pie chart-style cards
- Net points calculation (earned - burned)
- Activity feed showing recent earn/burn transactions
- Loading states with skeleton UI

## Files

- `packages/client/components/loyalty/TierEarnBurn.tsx` — Main component
- `packages/client/app/loyalty/earn-burn/page.tsx` — Dedicated page

## Usage

```tsx
import { TierEarnBurn } from "@/components/loyalty/TierEarnBurn";

<TierEarnBurn
  data={{
    tier: "Gold",
    tierProgress: 75,
    pointsEarned: 12500,
    pointsBurned: 3200,
    nextTier: "Platinum",
    entries: [...],
  }}
/>
```

## Testing

Manual verification via `/loyalty/earn-burn` route.
