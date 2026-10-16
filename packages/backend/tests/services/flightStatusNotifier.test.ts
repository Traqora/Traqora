jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const findExecMock = jest.fn();
jest.mock('../../src/models/FlightStatusAlert', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ exec: findExecMock })),
  },
}));

const sendFlightStatusAlertMock = jest.fn();
jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    getInstance: () => ({ sendFlightStatusAlert: sendFlightStatusAlertMock }),
  },
}));

const broadcastFlightAlertMock = jest.fn();
const broadcastFlightStatusMock = jest.fn();
jest.mock('../../src/websockets/server', () => ({
  getWebSocketServer: jest.fn(() => ({
    broadcastFlightAlert: broadcastFlightAlertMock,
    broadcastFlightStatus: broadcastFlightStatusMock,
  })),
}));

import { notifyFlightStatusChange, buildAlertMessage } from '../../src/services/flightStatusNotifier';
import { getWebSocketServer } from '../../src/websockets/server';

describe('notifyFlightStatusChange (issue #332)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifies every active subscriber and updates their lastStatus/lastNotifiedAt', async () => {
    const subscription1 = { userId: 'user-1', save: jest.fn() };
    const subscription2 = { userId: 'user-2', save: jest.fn() };
    findExecMock.mockResolvedValue([subscription1, subscription2]);
    sendFlightStatusAlertMock.mockResolvedValue(true);

    const { notifiedCount } = await notifyFlightStatusChange({
      flightId: 'FL1',
      status: 'delayed',
      delayMinutes: 20,
      timestamp: new Date(),
    });

    expect(notifiedCount).toBe(2);
    expect(subscription1.save).toHaveBeenCalled();
    expect(subscription1).toMatchObject({ lastStatus: 'delayed' });
    expect(sendFlightStatusAlertMock).toHaveBeenCalledTimes(2);
  });

  it('does not count a subscriber whose notification failed to send', async () => {
    const subscription = { userId: 'user-1', save: jest.fn() };
    findExecMock.mockResolvedValue([subscription]);
    sendFlightStatusAlertMock.mockResolvedValue(false);

    const { notifiedCount } = await notifyFlightStatusChange({
      flightId: 'FL1',
      status: 'cancelled',
      timestamp: new Date(),
    });

    expect(notifiedCount).toBe(0);
    expect(subscription.save).not.toHaveBeenCalled();
  });

  it('broadcasts both the free-text alert and the typed flight_status event', async () => {
    findExecMock.mockResolvedValue([]);

    await notifyFlightStatusChange({
      flightId: 'FL1',
      status: 'gate_changed',
      gate: 'B12',
      timestamp: new Date(),
    });

    expect(broadcastFlightAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({ flightId: 'FL1', status: 'gate_changed', gate: 'B12' }),
    );
    expect(broadcastFlightStatusMock).toHaveBeenCalledWith('FL1', 'GATE_CHANGED', expect.any(String));
  });

  it('maps every FlightStatusService status to a valid WebSocket FlightStatus value', async () => {
    findExecMock.mockResolvedValue([]);
    const cases: Array<[string, string]> = [
      ['on_time', 'SCHEDULED'],
      ['delayed', 'DELAYED'],
      ['cancelled', 'CANCELLED'],
      ['gate_changed', 'GATE_CHANGED'],
      ['boarding', 'BOARDING'],
      ['departed', 'LANDED'],
    ];

    for (const [status, expectedWs] of cases) {
      broadcastFlightStatusMock.mockClear();
      await notifyFlightStatusChange({ flightId: 'FL1', status: status as any, timestamp: new Date() });
      expect(broadcastFlightStatusMock).toHaveBeenCalledWith('FL1', expectedWs, expect.any(String));
    }
  });

  it('does not throw when the WebSocket server is not initialized yet', async () => {
    findExecMock.mockResolvedValue([]);
    (getWebSocketServer as jest.Mock).mockImplementationOnce(() => {
      throw new Error('WebSocket Server not initialized');
    });

    await expect(
      notifyFlightStatusChange({ flightId: 'FL1', status: 'delayed', timestamp: new Date() }),
    ).resolves.toEqual({ notifiedCount: 0 });
  });
});

describe('buildAlertMessage (issue #332)', () => {
  it('builds a delay message with minutes when provided', () => {
    expect(buildAlertMessage('FL1', 'delayed', { delayMinutes: 45 })).toBe(
      'Flight FL1 is delayed by 45 minutes.',
    );
  });

  it('builds a generic message for an unrecognized status', () => {
    expect(buildAlertMessage('FL1', 'unknown_status', {})).toBe('Flight FL1 status updated: unknown_status.');
  });
});
