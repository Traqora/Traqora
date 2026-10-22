# Flight-Provider Synchronization and Durable Cursors

## Overview
The flight synchronization worker pulls records from external flight providers using pagination cursors. To prevent data duplication or skipped records upon worker restart or crash, pagination cursors are durably committed after each successfully processed page.

## Expected Behavior
- When a synchronization job starts, it queries the persistent storage layer for the last committed cursor for the provider.
- If a cursor exists, synchronization resumes precisely from that cursor position.
- If no cursor exists, synchronization starts from the beginning (initial cursor).
- Each completed page updates the durable cursor atomically.

## Failure Cases and Retries
- **Worker Crash Mid-Page**: If the worker terminates before page completion, the cursor remains at the start of the current page. Upon restart, the sync resumes from the last committed cursor, re-fetching the uncommitted page safely.
- **Network/Provider Failure**: Temporary network errors trigger exponential backoff retries without advancing the durable cursor, preventing partial commit inconsistencies.