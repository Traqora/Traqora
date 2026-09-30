# Traqora Backend Workers & Graceful Shutdown

This document outlines the operational contract, configuration guidelines, and deployment behavior for background workers and task execution in the Traqora backend service.

## Overview

Traqora workers process background tasks such as cache warming, price monitoring, flight status polling, and contract monitoring. To prevent data corruption, dropped jobs, and incomplete blockchain interactions during deployments or container scaling events, the worker infrastructure implements a robust **Graceful Shutdown** capability.

---

## Worker Contract & API

The core primitives are defined in `packages/backend/src/jobs/worker.ts`:

### 1. `WorkerJob`
```typescript
export interface WorkerJob {
  id: string;
  name: string;
  execute(): Promise<void>;
}
```

### 2. `WorkerManager`
- **`registerAndExecute(job: WorkerJob): Promise<void>`**: Registers an active job and executes it. If the worker manager has initiated shutdown, new job submissions are rejected immediately with an error (`Worker is shutting down`).
- **`gracefulShutdown(): Promise<void>`**: Transitions the worker into shutdown mode, preventing new job registrations and waiting for all active jobs to complete (up to `shutdownTimeoutMs`).
- **`getActiveJobCount(): number`**: Returns the count of currently executing jobs.
- **`getIsShuttingDown(): boolean`**: Returns whether the worker manager is currently undergoing shutdown.

---

## Configuration & Timeouts

The `WorkerManager` accepts configuration options:

```typescript
export interface WorkerOptions {
  shutdownTimeoutMs?: number; // Default: 10000ms (10 seconds)
}
```

### Operational Behavior
1. **Happy Path**: When a shutdown signal (`SIGTERM` or `SIGINT`) is received, the worker manager stops accepting new jobs and waits for active jobs to finish. Once all active jobs resolve, the process exits cleanly with status code `0`.
2. **Failure Mode / Timeout**: If active jobs take longer than `shutdownTimeoutMs` to finish, a timeout promise triggers a forced unblock. The shutdown sequence logs a warning and resolves, allowing the process to terminate without getting permanently stuck on hung network calls or stalled operations.

---

## Operator Guide & Deployment Signals

When orchestrators like Kubernetes, Docker, or systemd issue a shutdown signal:

1. **`SIGTERM` / `SIGINT` Handling**:
   - The signal handler invokes `defaultWorkerManager.gracefulShutdown()`.
   - Existing HTTP requests and background jobs are given time to complete safely.
2. **Load Balancer Grace Period**:
   - Ensure your orchestrator configures a termination grace period (e.g., `terminationGracePeriodSeconds: 15` in Kubernetes) greater than `shutdownTimeoutMs` (default 10s) to allow workers adequate time to flush tasks.
3. **Rejection of New Tasks**:
   - Any job submitted while `isShuttingDown` is `true` is safely rejected so clients receive fast feedback rather than stalled background queues.
