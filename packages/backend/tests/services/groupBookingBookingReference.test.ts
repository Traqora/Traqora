import { GroupBookingService } from '../../src/services/groupBooking';

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

jest.mock('../../src/services/NotificationService', () => ({
  notificationService: {
    sendEmail: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/seatAvailabilityService', () => ({
  seatAvailabilityService: {
    releaseGroupSeatHold: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/config', () => ({
  config: {
    jwtSecret: 'test-group-booking-secret-at-least-16',
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { AppDataSource } from '../../src/db/dataSource';

describe('GroupBookingService booking references (#1134)', () => {
  it('assigns a stable privacy-safe reference to each confirmed member booking', async () => {
    const groupBookingRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const memberRepo = {
      save: jest.fn(),
    };
    const bookingRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((booking) =>
        Promise.resolve({ ...booking, id: 'booking-1' }),
      ),
    };
    const passengerRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((passenger) =>
        Promise.resolve({ ...passenger, id: 'passenger-1' }),
      ),
    };
    const flightRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flight-1',
        seatsAvailable: 10,
      }),
      decrement: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    (AppDataSource.getRepository as jest.Mock).mockImplementation((entity: any) => {
      switch (entity.name) {
        case 'GroupBooking':
          return groupBookingRepo;
        case 'GroupMember':
          return memberRepo;
        case 'Booking':
          return bookingRepo;
        case 'Passenger':
          return passengerRepo;
        case 'Flight':
          return flightRepo;
        default:
          return {};
      }
    });

    const group = {
      id: 'gb-1',
      flightId: 'flight-1',
      groupName: 'Test Group',
      status: 'awaiting_payment',
      approvalStatus: 'not_required',
      paidAmountCents: 0,
      totalAmountCents: 50000,
      members: [
        {
          id: 'm1',
          email: 'org@test.com',
          role: 'organizer',
          status: 'pending',
          shareAmountCents: 50000,
          firstName: 'Org',
          lastName: 'User',
        },
      ],
    };
    groupBookingRepo.findOne.mockResolvedValue(group);

    const service = GroupBookingService.getInstance();
    await service.processMemberPayment('gb-1', 'm1', 50000);

    expect(bookingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: expect.stringMatching(/^TRQ-[0-9A-HJKMNP-TV-Z]{16}$/),
      }),
    );

    const created = bookingRepo.create.mock.calls[0][0];
    expect(created.bookingReference).not.toContain('org@test.com');
    expect(created.bookingReference).not.toContain('m1');
    expect(created.bookingReference).not.toContain('Org');
  });
});
