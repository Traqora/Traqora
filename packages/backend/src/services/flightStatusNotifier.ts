import { logger } from '../utils/logger';
import FlightStatusAlert from '../models/FlightStatusAlert';
import { FlightStatusUpdate } from './FlightStatusService';
import { NotificationService } from './NotificationService';
import { getWebSocketServer, FlightStatus as WsFlightStatus } from '../websockets/server';

/**
 * Shared by the manual /flight-status/report endpoint and the automated
 * polling job (issue #332) so a status change is notified/broadcast the
 * same way regardless of how it was detected.
 */

/**
 * Translates FlightStatusService's status vocabulary (matches the airline-
 * status-feed shape) to the WebSocket layer's FlightStatus enum (issue
 * #381's flight_status event) — the two were defined independently and use
 * different casing/value sets.
 */
const STATUS_TO_WS: Record<FlightStatusUpdate['status'], WsFlightStatus> = {
  on_time: 'SCHEDULED',
  delayed: 'DELAYED',
  cancelled: 'CANCELLED',
  gate_changed: 'GATE_CHANGED',
  boarding: 'BOARDING',
  departed: 'LANDED',
};

export function buildAlertMessage(
  flightId: string,
  status: string,
  details: { gate?: string; delayMinutes?: number; reason?: string },
): string {
  switch (status) {
    case 'delayed':
      return details.delayMinutes
        ? `Flight ${flightId} is delayed by ${details.delayMinutes} minutes.`
        : `Flight ${flightId} is delayed.`;
    case 'cancelled':
      return details.reason
        ? `Flight ${flightId} has been cancelled: ${details.reason}`
        : `Flight ${flightId} has been cancelled.`;
    case 'gate_changed':
      return details.gate
        ? `Flight ${flightId}'s gate has changed to ${details.gate}.`
        : `Flight ${flightId}'s gate has changed.`;
    case 'boarding':
      return `Flight ${flightId} is now boarding.`;
    case 'departed':
      return `Flight ${flightId} has departed.`;
    default:
      return `Flight ${flightId} status updated: ${status}.`;
  }
}

/**
 * Notifies every active subscriber of a flight status change and broadcasts
 * it over WebSocket (both the free-text `alert` event and the typed
 * `flight_status` event). Returns how many subscribers were notified.
 */
export async function notifyFlightStatusChange(update: FlightStatusUpdate): Promise<{ notifiedCount: number }> {
  const { flightId, status, gate, delayMinutes, reason } = update;

  const subscribers = await FlightStatusAlert.find({ flightId, isActive: true }).exec();
  const notifier = NotificationService.getInstance();
  let notifiedCount = 0;

  for (const subscription of subscribers) {
    const sent = await notifier.sendFlightStatusAlert(subscription.userId, flightId, status, {
      gate,
      delayMinutes,
      reason,
    });
    if (sent) {
      subscription.lastNotifiedAt = new Date();
      subscription.lastStatus = status;
      await subscription.save();
      notifiedCount += 1;
    }
  }

  try {
    const ws = getWebSocketServer();
    const message = buildAlertMessage(flightId, status, { gate, delayMinutes, reason });

    ws.broadcastFlightAlert({ flightId, status, gate, delayMinutes, message });
    ws.broadcastFlightStatus(flightId, STATUS_TO_WS[status], message);
  } catch (_e) {
    logger.warn('WebSocket server not ready, skipping flight status broadcast');
  }

  return { notifiedCount };
}
