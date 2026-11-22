import {
  V1_BOOKING_NOTIFICATION_CATALOG,
  buildLifecycleIdempotencyKey,
  getV1CatalogEvent,
} from '../v1Catalog';

describe('v1 notification catalog', () => {
  it('includes required essential lifecycle events with channel and payload definitions', () => {
    const events = V1_BOOKING_NOTIFICATION_CATALOG.map((e) => e.event).sort();
    expect(events).toEqual([
      'booking_cancelled',
      'booking_confirmed',
      'payment_confirmed',
      'refund_status',
      'schedule_change',
    ]);

    for (const entry of V1_BOOKING_NOTIFICATION_CATALOG) {
      expect(entry.notificationType).toBeTruthy();
      expect(entry.trigger).toBeTruthy();
      expect(entry.channels.length).toBeGreaterThan(0);
      expect(entry.requiredPayload.length).toBeGreaterThan(0);
      expect(entry.idempotencyKeyShape).toContain(':');
      expect(entry.description).toBeTruthy();
    }

    expect(getV1CatalogEvent('booking_confirmed').channels).toEqual(
      expect.arrayContaining(['email', 'sms', 'push']),
    );
  });

  it('builds deterministic and normalized idempotency keys', () => {
    const a = buildLifecycleIdempotencyKey(['payment_confirmed', 'booking-1', 'pi 123']);
    const b = buildLifecycleIdempotencyKey(['payment_confirmed', 'booking-1', 'pi 123']);
    const c = buildLifecycleIdempotencyKey(['payment_confirmed', 'booking-1', 'pi 124']);
    const d = buildLifecycleIdempotencyKey(['refund_status', 'refund-1', undefined, 'completed']);

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe('payment_confirmed:booking-1:pi_123');
    expect(d).toBe('refund_status:refund-1:unknown:completed');
  });
});
