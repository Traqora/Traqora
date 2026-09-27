## Summary

This PR implements four scoped capabilities:

### #735 Pagination Envelope Standard
- Created standard pagination types in `packages/backend/src/types/pagination.ts`
- Supports both offset-based (`PaginationMeta`) and cursor-based (`CursorPaginationMeta`) pagination
- Updated all admin list routes (refunds, flights, users, bookings, analyticsAudit)
- Updated audit, feedback, contract-events routes
- Updated common schemas to use page/limit instead of limit/offset

### #733 Refund SLA Status Copy
- Enhanced `RefundStatusTracker` component with SLA timelock information
- Added real-time countdown timer for delayed refunds using `useTimeRemaining` hook
- Updated `delayed_pending` status label to "Security Hold" with shield icon
- Added detailed SLA messaging explaining the timelock purpose

### #736 Error Schema RFC7807
- Updated error handler to return RFC 7807 Problem Details format
- Response includes: `type`, `title`, `status`, `detail`, `instance`
- Maintains backward compatibility with `code`, `details`, `requestId`, `timestamp`, `retryable`
- Sets `Content-Type: application/problem+json` header

### #734 OpenAPI Snapshot Test
- Added snapshot test in `packages/backend/tests/api/openapi.snapshot.test.ts`
- Validates OpenAPI 3.0.0 document structure
- Checks security schemes, core paths, response schemas
- Verifies error response schemas include RFC 7807 structure

## Testing
- All new tests pass
- Lint passes for modified files
- TypeScript compilation succeeds (pre-existing errors unrelated to changes)

Closes #735 #733 #736 #734