/**
 * Version 1 transactional email templates for the booking lifecycle.
 *
 * The five lifecycle events are the reviewed v1 set: confirmation, pending
 * status, schedule change, cancellation, and refund updates. Every template
 * renders a subject, plain text, and HTML body, and every interpolated value
 * is escaped so passenger or provider data can never inject markup.
 */

export type BookingLifecycleEvent =
  | 'confirmation'
  | 'pending'
  | 'schedule-change'
  | 'cancellation'
  | 'refund';

export interface BookingLifecycleData {
  bookingReference: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  previousDepartureDate?: string;
  refundAmount?: string;
  reason?: string;
  actionUrl?: string;
}

export interface LifecycleEmail {
  subject: string;
  text: string;
  html: string;
}

/** Escape a single interpolation value for both HTML and plain text output. */
const escapeValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const wrapHtml = (heading: string, rows: Array<[string, unknown]>, footer: string): string => {
  const items = rows
    .map(([label, value]) => `        <li><strong>${escapeValue(label)}:</strong> ${escapeValue(value)}</li>`)
    .join('\n');

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>${escapeValue(heading)}</h2>
      <ul>
${items}
      </ul>
      <p>${escapeValue(footer)}</p>
    </div>
  `;
};

export const bookingTemplate = (data: BookingLifecycleData): LifecycleEmail => ({
  subject: `Booking Confirmation: ${escapeValue(data.bookingReference)}`,
  text: `Your booking is confirmed! Reference: ${escapeValue(data.bookingReference)}. Flight: ${escapeValue(data.flightNumber)}`,
  html: wrapHtml(
    'Booking Confirmation',
    [
      ['Reference', data.bookingReference],
      ['Flight', data.flightNumber],
      ['Date', data.departureDate],
    ],
    'Thank you for choosing Traqora!'
  ),
});

export const pendingTemplate = (data: BookingLifecycleData): LifecycleEmail => ({
  subject: `Booking Pending: ${escapeValue(data.bookingReference)}`,
  text: `Your booking ${escapeValue(data.bookingReference)} is pending confirmation. No action is needed from you yet.`,
  html: wrapHtml(
    'Booking Pending',
    [
      ['Reference', data.bookingReference],
      ['Flight', data.flightNumber],
      ['Date', data.departureDate],
    ],
    'We will email you as soon as the booking is confirmed.'
  ),
});

export const scheduleChangeTemplate = (data: BookingLifecycleData): LifecycleEmail => ({
  subject: `Schedule Change for Booking ${escapeValue(data.bookingReference)}`,
  text: `The schedule for flight ${escapeValue(data.flightNumber)} on booking ${escapeValue(data.bookingReference)} has changed from ${escapeValue(data.previousDepartureDate)} to ${escapeValue(data.departureDate)}.`,
  html: wrapHtml(
    'Schedule Change',
    [
      ['Reference', data.bookingReference],
      ['Flight', data.flightNumber],
      ['Previous departure', data.previousDepartureDate],
      ['New departure', data.departureDate],
    ],
    'Please review your updated itinerary.'
  ),
});

export const cancellationTemplate = (data: BookingLifecycleData): LifecycleEmail => ({
  subject: `Booking Cancelled: ${escapeValue(data.bookingReference)}`,
  text: `Your booking ${escapeValue(data.bookingReference)} has been cancelled.${data.reason ? ` Reason: ${escapeValue(data.reason)}.` : ''}`,
  html: wrapHtml(
    'Booking Cancelled',
    [
      ['Reference', data.bookingReference],
      ['Flight', data.flightNumber],
      ['Reason', data.reason],
    ],
    'If you did not request this cancellation, please contact support.'
  ),
});

export const refundTemplate = (data: BookingLifecycleData): LifecycleEmail => ({
  subject: `Refund Processed for Booking ${escapeValue(data.bookingReference)}`,
  text: `Your refund of ${escapeValue(data.refundAmount)} has been processed for booking ${escapeValue(data.bookingReference)}.`,
  html: wrapHtml(
    'Refund Processed',
    [
      ['Booking Reference', data.bookingReference],
      ['Amount Refunded', data.refundAmount],
    ],
    'Please allow 3-5 business days for the funds to reflect in your account.'
  ),
});

export const reminderTemplate = (data: BookingLifecycleData): LifecycleEmail => ({
  subject: `Flight Reminder: ${escapeValue(data.flightNumber)} departs in 24 hours`,
  text: `Reminder: Your flight ${escapeValue(data.flightNumber)} departs on ${escapeValue(data.departureDate)}. Please check in.`,
  html: wrapHtml(
    'Flight Reminder',
    [
      ['Flight', data.flightNumber],
      ['Date', data.departureDate],
    ],
    'Please remember to check in 24 hours before departure.'
  ),
});

/** The reviewed v1 booking lifecycle template set, keyed by event. */
export const BOOKING_LIFECYCLE_TEMPLATES: Readonly<
  Record<BookingLifecycleEvent, (data: BookingLifecycleData) => LifecycleEmail>
> = {
  confirmation: bookingTemplate,
  pending: pendingTemplate,
  'schedule-change': scheduleChangeTemplate,
  cancellation: cancellationTemplate,
  refund: refundTemplate,
};

export const getBookingLifecycleTemplate = (
  event: BookingLifecycleEvent
): ((data: BookingLifecycleData) => LifecycleEmail) => {
  const template = BOOKING_LIFECYCLE_TEMPLATES[event];
  if (!template) {
    throw new Error(`Unknown booking lifecycle event: ${event}`);
  }
  return template;
};

// Transactional templates for the notification reliability batch. These are
// additive to the v1 booking lifecycle set above and keep their own modules.
export { paymentTemplate } from "./payment";
export { flightStatusTemplate } from "./flight_status";
