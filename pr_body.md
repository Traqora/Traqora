- closes #568
- closes #569
- closes #570
- closes #571

### Changes Made:
- **Mobile View**: Built a clean `CheckInStatus` view component for the mobile app to display real-time check-in flows.
- **Push Notifications**: Created `PushNotificationService` to handle opt-ins and reliably sync notification preferences to the backend.
- **E2E Testing**: Added a core mobile smoke test (`smoke.test.ts`) that verifies successful booting and base search functionality.
- **Backend Worker**: Finalized unit tests for the notification queue and worker in the backend to ensure reliable message processing.
