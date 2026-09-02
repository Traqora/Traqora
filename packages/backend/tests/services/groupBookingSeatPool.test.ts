import { SeatAvailabilityService } from '../../src/services/seatAvailabilityService';
import { GroupBookingService } from '../../src/services/groupBooking';
import { AppDataSource } from '../../src/db/dataSource';
import { Flight } from '../../src/db/entities/Flight';
import { Booking } from '../../src/db/entities/Booking';
import { GroupBooking } from '../../src/db/entities/GroupBooking';
import { GroupMember } from '../../src/db/entities/GroupMember';
import { Passenger } from '../../src/db/entities/Passenger';
import { BadRequestError } from '../../src/utils/errors';

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

describe('Group Booking & Individual Holds Unified Seat Pool Consistency', () => {
  let seatService: SeatAvailabilityService;
  let groupService: GroupBookingService;

  let mockBookings: any[];
  let mockGroupBookings: any[];
  let mockGroupMembers: any[];
  let mockFlights: Map<string, any>;

  const testFlightId = 'flight-101';

  beforeEach(() => {
    jest.clearAllMocks();

    mockBookings = [];
    mockGroupBookings = [];
    mockGroupMembers = [];
    mockFlights = new Map();

    const sampleFlight = {
      id: testFlightId,
      priceCents: 20000,
      seatsAvailable: 120, // Total seats in DEFAULT aircraft config (20 rows * 6 cols = 120)
      airlineCode: 'TQ',
      flightNumber: 'TQ101',
      departureTime: new Date(Date.now() + 86400000 * 7),
    };
    mockFlights.set(testFlightId, sampleFlight);

    const mockBookingRepo: any = {
      find: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where?.flight?.id) {
          return mockBookings.filter((b) => b.flight?.id === where.flight.id);
        }
        return mockBookings;
      }),
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return mockBookings.find((b) => !where.id || b.id === where.id) || null;
      }),
      save: jest.fn().mockImplementation(async (b) => {
        mockBookings.push(b);
        return b;
      }),
      create: jest.fn().mockImplementation((data) => ({ id: `b-${Date.now()}`, ...data })),
    };

    const mockFlightRepo: any = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return mockFlights.get(where.id) || null;
      }),
      decrement: jest.fn().mockImplementation(async ({ id }: any, field: string, amount: number) => {
        const flight = mockFlights.get(id);
        if (flight) flight[field] -= amount;
        return { affected: 1 };
      }),
    };

    const mockGroupBookingRepo: any = {
      create: jest.fn().mockImplementation((data) => ({ id: `gb-${Date.now()}`, ...data, members: [] })),
      save: jest.fn().mockImplementation(async (gb) => {
        const idx = mockGroupBookings.findIndex((g) => g.id === gb.id);
        if (idx >= 0) mockGroupBookings[idx] = gb;
        else mockGroupBookings.push(gb);
        return gb;
      }),
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        const group = mockGroupBookings.find((g) => g.id === where.id);
        if (!group) return null;
        const members = mockGroupMembers.filter(
          (m) => m.groupBookingId === group.id || m.groupBooking?.id === group.id,
        );
        return { ...group, members };
      }),
      find: jest.fn().mockResolvedValue(mockGroupBookings),
    };

    const mockGroupMemberRepo: any = {
      create: jest.fn().mockImplementation((data) => ({ id: `gm-${Date.now()}-${Math.random()}`, ...data })),
      save: jest.fn().mockImplementation(async (members) => {
        const list = Array.isArray(members) ? members : [members];
        for (const item of list) {
          const idx = mockGroupMembers.findIndex((m) => m.id === item.id);
          if (idx >= 0) {
            mockGroupMembers[idx] = item;
          } else {
            mockGroupMembers.push(item);
          }
        }
        return members;
      }),
      find: jest.fn().mockResolvedValue(mockGroupMembers),
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return mockGroupMembers.find((m) => !where.id || m.id === where.id) || null;
      }),
    };

    const mockPassengerRepo: any = {
      create: jest.fn().mockImplementation((data) => ({ id: `p-${Date.now()}`, ...data })),
      save: jest.fn().mockImplementation(async (p) => p),
    };

    (AppDataSource.getRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === Booking) return mockBookingRepo;
      if (entity === Flight) return mockFlightRepo;
      if (entity === GroupBooking) return mockGroupBookingRepo;
      if (entity === GroupMember) return mockGroupMemberRepo;
      if (entity === Passenger) return mockPassengerRepo;
      return { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    });

    seatService = new SeatAvailabilityService();
    seatService.clearAllLocksAndHolds();
    groupService = GroupBookingService.getInstance();
  });

  afterEach(async () => {
    seatService.clearAllLocksAndHolds();
  });

  describe('Unified Pool & Overcommitment Protection', () => {
    it('accurately calculates available seats across individual locks and group holds', async () => {
      const initialAvailability = await seatService.getSeatAvailability(testFlightId);
      expect(initialAvailability.totalSeats).toBe(120);
      expect(initialAvailability.availableSeats).toBe(120);

      // Lock 3 individual seats
      await seatService.lockSeat(testFlightId, '1A', 'indiv-booking-1');
      await seatService.lockSeat(testFlightId, '1B', 'indiv-booking-2');
      await seatService.lockSeat(testFlightId, '1C', 'indiv-booking-3');

      let current = await seatService.getSeatAvailability(testFlightId);
      expect(current.availableSeats).toBe(117);

      // Hold 10 seats for a group booking
      const groupHold = await seatService.holdSeatsForGroup(testFlightId, 'group-1', 10);
      expect(groupHold.heldCount).toBe(10);
      expect(groupHold.seats).toHaveLength(10);

      current = await seatService.getSeatAvailability(testFlightId);
      expect(current.availableSeats).toBe(107); // 120 - 3 (individual) - 10 (group) = 107
    });

    it('prevents individual locks on seats currently held by a group', async () => {
      // Group holds specific seats including 2A, 2B, 2C
      const groupHold = await seatService.holdSeatsForGroup(testFlightId, 'group-hold-1', 3, ['2A', '2B', '2C']);
      expect(groupHold.seats).toEqual(expect.arrayContaining(['2A', '2B', '2C']));

      // Individual user attempts to lock seat 2A which is held by the group
      await expect(
        seatService.lockSeat(testFlightId, '2A', 'other-indiv-booking'),
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects group hold when requested capacity exceeds available seat pool', async () => {
      // Occupy 115 seats with existing bookings
      for (let row = 1; row <= 19; row++) {
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
          mockBookings.push({
            id: `b-${row}-${col}`,
            flight: { id: testFlightId },
            metadata: { seatNumber: `${row}${col}` },
          });
        }
      } // 19 * 6 = 114 booked seats

      // Lock 2 individual seats in row 20
      await seatService.lockSeat(testFlightId, '20A', 'indiv-1');
      await seatService.lockSeat(testFlightId, '20B', 'indiv-2');

      const avail = await seatService.getSeatAvailability(testFlightId);
      // 120 total - 114 booked - 2 locked = 4 available
      expect(avail.availableSeats).toBe(4);

      // Group requests 5 seats -> must be rejected
      await expect(
        seatService.holdSeatsForGroup(testFlightId, 'group-overcommit', 5),
      ).rejects.toThrow(BadRequestError);

      // Group requests 4 seats -> succeeds
      const hold = await seatService.holdSeatsForGroup(testFlightId, 'group-fits', 4);
      expect(hold.heldCount).toBe(4);

      const afterHold = await seatService.getSeatAvailability(testFlightId);
      expect(afterHold.availableSeats).toBe(0);
    });

    it('releases held seats back to the shared pool when group booking is cancelled', async () => {
      const hold = await seatService.holdSeatsForGroup(testFlightId, 'group-cancel-test', 8);
      expect(hold.heldCount).toBe(8);

      let avail = await seatService.getSeatAvailability(testFlightId);
      expect(avail.availableSeats).toBe(112);

      // Release group hold
      await seatService.releaseGroupSeatHold(testFlightId, 'group-cancel-test');

      avail = await seatService.getSeatAvailability(testFlightId);
      expect(avail.availableSeats).toBe(120);

      // Seats are now lockable by individual users
      await expect(
        seatService.lockSeat(testFlightId, hold.seats[0], 'indiv-after-release'),
      ).resolves.not.toThrow();
    });

    it('updates seat hold count when group members are invited/added', async () => {
      await seatService.holdSeatsForGroup(testFlightId, 'group-dynamic', 5);

      let avail = await seatService.getSeatAvailability(testFlightId);
      expect(avail.availableSeats).toBe(115);

      // 3 more members invited -> update hold to 8 seats
      await seatService.updateGroupSeatHold(testFlightId, 'group-dynamic', 8);

      avail = await seatService.getSeatAvailability(testFlightId);
      expect(avail.availableSeats).toBe(112);
    });
  });

  describe('Mixed Group and Individual Loads Scenario', () => {
    it('handles interleaved individual locks, group creation, member additions, and individual bookings', async () => {
      // 1. Initial flight capacity: 120 seats
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(120);

      // 2. 5 individual users lock seats for their checkout flow
      const indivLocks = ['1A', '1B', '1C', '1D', '1E'];
      for (const seat of indivLocks) {
        await seatService.lockSeat(testFlightId, seat, `indiv-session-${seat}`);
      }
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(115);

      // 3. Group Booking A created with organizer + 9 members (10 seats total)
      const groupA = await groupService.createGroupBooking({
        groupName: 'Tour Group Alpha',
        flightId: testFlightId,
        organizerEmail: 'leader@alpha.com',
        memberEmails: Array.from({ length: 9 }, (_, i) => `alpha${i + 1}@alpha.com`),
        splitMethod: 'equal',
      });
      expect(groupA).toBeDefined();
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(105);

      // 4. Group Booking B created with organizer + 4 members (5 seats total)
      const groupB = await groupService.createGroupBooking({
        groupName: 'Tour Group Beta',
        flightId: testFlightId,
        organizerEmail: 'leader@beta.com',
        memberEmails: Array.from({ length: 4 }, (_, i) => `beta${i + 1}@beta.com`),
        splitMethod: 'equal',
      });
      expect(groupB).toBeDefined();
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(100);

      // 5. Group A invites 2 more members -> hold expands from 10 to 12
      await groupService.inviteMembers({
        groupBookingId: groupA.id,
        memberEmails: ['alpha10@alpha.com', 'alpha11@alpha.com'],
      });
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(98);

      // 6. Individual user confirms booking for 1A and 1B
      mockBookings.push(
        { id: 'b-1A', flight: { id: testFlightId }, metadata: { seatNumber: '1A' } },
        { id: 'b-1B', flight: { id: testFlightId }, metadata: { seatNumber: '1B' } },
      );
      await seatService.releaseSeatLock(testFlightId, '1A', 'indiv-session-1A');
      await seatService.releaseSeatLock(testFlightId, '1B', 'indiv-session-1B');
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(98);

      // 7. Group B cancels -> 5 seats released back to the shared pool
      await groupService.cancelGroupBooking(groupB.id, 'Trip postponed');
      expect((await seatService.getSeatAvailability(testFlightId)).availableSeats).toBe(103);
    });
  });
});
