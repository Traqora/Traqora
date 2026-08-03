import { CheckInService, getCheckInWindow } from '../checkinService';
import { MockFactories } from '../../testing/mockFactories';

describe('CheckInService Unit Tests', () => {
  let service: CheckInService;

  beforeEach(() => {
    service = new CheckInService();
  });

  test('getCheckInWindow returns open status within 24h of departure', () => {
    const flight = MockFactories.createFlight({
      departureTime: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10 hours from now
    });

    const window = getCheckInWindow(flight);
    expect(window.isOpen).toBe(true);
    expect(window.opensAt).toBeDefined();
    expect(window.closesAt).toBeDefined();
  });

  test('getCheckInWindow returns closed status if flight is in 30 days', () => {
    const flight = MockFactories.createFlight({
      departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    const window = getCheckInWindow(flight);
    expect(window.isOpen).toBe(false);
  });
});
