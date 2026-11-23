import {
  BOOKING_LIFECYCLE_TEMPLATES,
  getBookingLifecycleTemplate,
  type BookingLifecycleData,
  type BookingLifecycleEvent,
} from './index';

const sample: BookingLifecycleData = {
  bookingReference: 'TRQ-ABCDEFGHIJKLMNOP',
  flightNumber: 'UA123',
  origin: 'LOS',
  destination: 'ACC',
  departureDate: '2026-12-01T10:00:00Z',
  previousDepartureDate: '2026-12-01T08:00:00Z',
  refundAmount: '120.50 USD',
  reason: 'Carrier schedule change',
  actionUrl: 'https://example.com/booking/TRQ-ABCDEFGHIJKLMNOP',
};

const LIFECYCLE_EVENTS: BookingLifecycleEvent[] = [
  'confirmation',
  'pending',
  'schedule-change',
  'cancellation',
  'refund',
];

describe('v1 booking lifecycle email templates', () => {
  test.each(LIFECYCLE_EVENTS)('%s renders subject, text and html', (event) => {
    const template = getBookingLifecycleTemplate(event);
    const rendered = template(sample);

    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.text).toContain(sample.bookingReference);
    expect(rendered.html).toContain(sample.bookingReference);
    expect(rendered.html).toContain('<div');
  });

  test('all five reviewed lifecycle events are registered', () => {
    expect(Object.keys(BOOKING_LIFECYCLE_TEMPLATES).sort()).toEqual(
      [...LIFECYCLE_EVENTS].sort()
    );
  });

  test('schedule change shows both the previous and new departure', () => {
    const rendered = BOOKING_LIFECYCLE_TEMPLATES['schedule-change'](sample);

    expect(rendered.text).toContain(sample.previousDepartureDate!);
    expect(rendered.text).toContain(sample.departureDate!);
    expect(rendered.html).toContain('Previous departure');
    expect(rendered.html).toContain('New departure');
  });

  test('cancellation includes the reason and refund shows the amount', () => {
    const cancelled = BOOKING_LIFECYCLE_TEMPLATES.cancellation(sample);
    const refunded = BOOKING_LIFECYCLE_TEMPLATES.refund(sample);

    expect(cancelled.text).toContain(sample.reason!);
    expect(refunded.text).toContain(sample.refundAmount!);
  });

  test('provider or passenger markup is escaped in html output', () => {
    const rendered = BOOKING_LIFECYCLE_TEMPLATES.confirmation({
      ...sample,
      flightNumber: '<script>alert(1)</script>',
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.text).not.toContain('<script>');
  });

  test('unknown lifecycle events are rejected', () => {
    expect(() => getBookingLifecycleTemplate('unknown' as BookingLifecycleEvent)).toThrow(
      'Unknown booking lifecycle event'
    );
  });
});
