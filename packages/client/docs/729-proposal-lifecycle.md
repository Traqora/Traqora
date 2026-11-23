# Issue #729: Proposal Lifecycle UI

## Overview

Added a `ProposalLifecycle` component to the governance client UI that displays all proposal stages in a visual timeline.

## Features

- Visual timeline showing all proposal stages: Created → Active → Voting → Passed/Rejected → Executed
- Current stage indicator with color-coded badges
- Progress calculation based on current stage
- Summary cards showing total stages, current stage, and progress percentage

## Files

- `packages/client/components/governance/ProposalLifecycle.tsx` — Main component
- `packages/client/app/governance/lifecycle/page.tsx` — Dedicated page

## Usage

```tsx
import { ProposalLifecycle } from "@/components/governance/ProposalLifecycle";

<ProposalLifecycle
  proposalId="prop-123"
  stages={stages}
  currentStage="voting"
  title="My Proposal"
/>
```

## Testing

Manual verification via `/governance/lifecycle` route.
