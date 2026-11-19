# Flight-Provider Synchronization Durable Cursors

## Overview
Traqora's flight-provider synchronization jobs persist pagination cursors in durable storage. Upon worker restart or interruption, the synchronization job automatically resumes from the last committed cursor page, ensuring zero data duplication or dropped records.

## Expected Behavior and Failure Cases

### Primary Path
1. The sync worker polls flight providers using pagination tokens/cursors.
2. Each successfully processed page commits its resulting records and advances the persistent cursor atomically.
3. Normal shutdowns or worker crashes leave the last committed cursor intact in storage.

### Failure & Retry Case
- If a provider request or downstream write fails mid-page, the batch is rolled back or left uncommitted.
- Upon worker restart, the synchronization engine reads the last successfully committed durable cursor and resumes pagination from that exact point.
- Idempotency guarantees prevent duplicate record insertion during retries.
