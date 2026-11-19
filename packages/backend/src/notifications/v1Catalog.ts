export type V1NotificationChannel = "email" | "sms" | "push";

export type V1LifecycleEvent =
  | "booking_confirmed"
  | "payment_confirmed"
  | "schedule_change"
  | "booking_cancelled"
  | "refund_status";

export type V1CatalogEntry = {
  event: V1LifecycleEvent;
  notificationType: string;
  trigger: string;
  channels: V1NotificationChannel[];
  requiredPayload: string[];
  idempotencyKeyShape: string;
  description: string;
};

export const V1_BOOKING_NOTIFICATION_CATALOG: readonly V1CatalogEntry[] = [
  {
    event: "booking_confirmed",
    notificationType: "booking",
    trigger: "Booking transitions to confirmed (payment and reservation accepted for the traveler).",
    channels: ["email", "sms", "push"],
    requiredPayload: ["bookingId", "bookingReference", "flightNumber"],
    idempotencyKeyShape: "booking_confirmed:{bookingId}",
    description: "Confirms the booking details and reference to the traveler.",
  },
  {
    event: "payment_confirmed",
    notificationType: "payment",
    trigger: "Payment for a booking is captured/confirmed.",
    channels: ["email", "sms", "push"],
    requiredPayload: ["bookingId", "bookingReference", "amount"],
    idempotencyKeyShape: "payment_confirmed:{bookingId}:{paymentIdOrIntent}",
    description: "Confirms successful payment for the booking.",
  },
  {
    event: "schedule_change",
    notificationType: "flight_status",
    trigger: "A material schedule/status change occurs for a booked flight (delay, cancellation, gate change, boarding update).",
    channels: ["email", "sms", "push"],
    requiredPayload: ["bookingIdOrFlightId", "flightNumber", "changeType"],
    idempotencyKeyShape: "schedule_change:{flightId}:{changeType}:{eventTimestampOrState}",
    description: "Notifies travelers/followers about schedule or operational changes affecting the trip.",
  },
  {
    event: "booking_cancelled",
    notificationType: "flight_cancelled",
    trigger: "A booking or its flight is cancelled in a way that affects the traveler.",
    channels: ["email", "sms", "push"],
    requiredPayload: ["bookingIdOrFlightId", "flightNumber", "reason"],
    idempotencyKeyShape: "booking_cancelled:{bookingIdOrFlightId}",
    description: "Notifies the traveler that the booking/flight was cancelled.",
  },
  {
    event: "refund_status",
    notificationType: "refund",
    trigger: "Refund lifecycle updates relevant to the traveler (initiated, processed/completed, failed/rejected where applicable).",
    channels: ["email", "sms", "push"],
    requiredPayload: ["refundId", "bookingId", "bookingReference", "status"],
    idempotencyKeyShape: "refund_status:{refundId}:{status}",
    description: "Communicates refund progress and outcome for a booking.",
  },
] as const;

export function buildLifecycleIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part === null || part === undefined ? "unknown" : String(part)))
    .map((part) => part.trim().replace(/\s+/g, "_"))
    .filter((part) => part.length > 0)
    .join(":");
}

export function getV1CatalogEvent(event: V1LifecycleEvent): V1CatalogEntry {
  const entry = V1_BOOKING_NOTIFICATION_CATALOG.find((e) => e.event === event);
  if (!entry) {
    throw new Error(`Unknown v1 notification catalog event: ${event}`);
  }
  return entry;
}
