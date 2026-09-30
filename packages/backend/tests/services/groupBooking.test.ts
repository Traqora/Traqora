import { GroupBookingService, CreateGroupBookingRequest } from '../src/services/groupBooking';

jest.mock('../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

jest.mock('../src/services/NotificationService', () => ({
  notificationService: {
    sendEmail: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-123456789',
}));

import { AppDataSource } from '../src/db/dataSource';
import { BadRequestError, NotFoundError, ForbiddenError } from '../src/utils/errors';

describe('GroupBookingService', () => {
  let service: GroupBookingService;
  let mockGroupBookingRepo: any;
  let mockFlightRepo: any;
  let mockMemberRepo: any;
  let mockBookingRepo: any;
  let mockPassengerRepo: any;
  let mockCheckInRepo: any;
  let mockAccountRepo: any;
  let mockCorporateUserRepo: any;
  let mockPolicyRepo: any;
  let mockApprovalRepo: any;

  const mockFlight = {
    id: 'flight-1',
    priceCents: 50000,
    seatsAvailable: 50,
    airlineCode: 'AA',
    flightNumber: 'AA100',
    departureTime: new Date(Date.now() + 86400000 * 30),
    fromAirport: 'JFK',
    toAirport: 'LHR',
  };

  const mockCreateRequest: CreateGroupBookingRequest = {
    groupName: 'Test Group',
    flightId: 'flight-1',
    organizerEmail: 'org@test.com',
    memberEmails: ['member1@test.com', 'member2@test.com'],
    splitMethod: 'equal',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGroupBookingRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((gb) => Promise.resolve({ ...gb, id: 'gb-1', members: [] })),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
    };

    mockFlightRepo = {
      findOne: jest.fn().mockResolvedValue(mockFlight),
      decrement: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockMemberRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((m) => {
        if (Array.isArray(m)) {
          return Promise.resolve(m.map((item: any, i: number) => ({
            ...item,
            id: item.email ? `member-${item.email}` : `member-${i}`,
            groupBookingId: 'gb-1',
          })));
        }
        return Promise.resolve({ ...m, id: `member-${m.email}` });
      }),
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
    };

    mockBookingRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((b) => Promise.resolve({ ...b, id: 'booking-1' })),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockPassengerRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((p) => Promise.resolve({ ...p, id: 'passenger-1' })),
    };

    mockCheckInRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ ...c, id: 'checkin-1' })),
      findOne: jest.fn(),
    };

    mockAccountRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((a) => Promise.resolve({ ...a, id: 'corp-1' })),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn(),
    };

    mockCorporateUserRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((u) => Promise.resolve({ ...u, id: 'cu-1' })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
    };

    mockPolicyRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((p) => Promise.resolve({ ...p, id: 'policy-1' })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    mockApprovalRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((a) => Promise.resolve({ ...a, id: 'approval-1' })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    (AppDataSource.getRepository as jest.Mock).mockImplementation((entity: any) => {
      const name = typeof entity === 'function' ? entity.name : '';
      switch (name) {
        case 'GroupBooking': return mockGroupBookingRepo;
        case 'Flight': return mockFlightRepo;
        case 'GroupMember': return mockMemberRepo;
        case 'Booking': return mockBookingRepo;
        case 'Passenger': return mockPassengerRepo;
        case 'CheckIn': return mockCheckInRepo;
        case 'CorporateAccount': return mockAccountRepo;
        case 'CorporateUser': return mockCorporateUserRepo;
        case 'CorporateBookingPolicy': return mockPolicyRepo;
        case 'BookingApproval': return mockApprovalRepo;
        default: return mockGroupBookingRepo;
      }
    });

    service = GroupBookingService.getInstance();
  });

  describe('createGroupBooking', () => {
    it('should create a group booking successfully', async () => {
      const result = await service.createGroupBooking(mockCreateRequest);

      expect(result.groupName).toBe('Test Group');
      expect(result.totalAmountCents).toBe(150000); // 3 members * $500
      expect(mockGroupBookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          groupName: 'Test Group',
          flightId: 'flight-1',
          splitMethod: 'equal',
        })
      );
    });

    it('should throw if flight not found', async () => {
      mockFlightRepo.findOne.mockResolvedValue(null);

      await expect(service.createGroupBooking(mockCreateRequest)).rejects.toThrow('Flight not found');
    });

    it('should throw if not enough seats', async () => {
      mockFlightRepo.findOne.mockResolvedValue({ ...mockFlight, seatsAvailable: 1 });

      await expect(service.createGroupBooking(mockCreateRequest)).rejects.toThrow('Not enough seats');
    });

    it('should set approvalStatus to pending when corporate policy requires approval', async () => {
      mockPolicyRepo.find.mockResolvedValue([{ requiresApproval: true }]);

      const result = await service.createGroupBooking({
        ...mockCreateRequest,
        corporateAccountId: 'corp-1',
      });

      expect(result.approvalStatus).toBe('pending');
    });

    it('should set approvalStatus to not_required when no corporate policy', async () => {
      const result = await service.createGroupBooking(mockCreateRequest);

      expect(result.approvalStatus).toBe('not_required');
    });
  });

  describe('calculateMemberShares', () => {
    it('should calculate equal shares correctly', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        totalAmountCents: 150000,
        splitMethod: 'equal',
        members: [
          { id: 'm1', status: 'confirmed', role: 'organizer' },
          { id: 'm2', status: 'confirmed', role: 'member' },
          { id: 'm3', status: 'confirmed', role: 'member' },
        ],
      });

      await service.calculateMemberShares('gb-1');

      expect(mockMemberRepo.save).toHaveBeenCalledTimes(3);
      const calls = (mockMemberRepo.save as jest.Mock).mock.calls;
      const shares = calls.map((c: any[]) => c[0].shareAmountCents);
      expect(shares).toContain(50000);
      expect(shares.reduce((a: number, b: number) => a + b, 0)).toBe(150000);
    });

    it('should throw if group booking not found', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue(null);

      await expect(service.calculateMemberShares('invalid')).rejects.toThrow('Group booking not found');
    });
  });

  describe('inviteMembers', () => {
    it('should invite new members', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        status: 'pending',
        groupName: 'Test Group',
        organizerEmail: 'org@test.com',
        members: [{ id: 'm1', email: 'org@test.com', role: 'organizer', status: 'confirmed', isInvited: true }],
      });

      const result = await service.inviteMembers({
        groupBookingId: 'gb-1',
        memberEmails: ['new@test.com'],
      });

      expect(result.status).toBe('inviting');
      expect(mockMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@test.com' })
      );
    });

    it('should throw if group booking not found', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue(null);

      await expect(service.inviteMembers({
        groupBookingId: 'invalid',
        memberEmails: ['test@test.com'],
      })).rejects.toThrow('Group booking not found');
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation and update status', async () => {
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'm1',
        inviteToken: 'token',
        status: 'pending',
        email: 'test@test.com',
        groupBookingId: 'gb-1',
        groupBooking: { id: 'gb-1' },
      });
      mockMemberRepo.find.mockResolvedValue([
        { status: 'confirmed', role: 'organizer' },
        { status: 'confirmed', role: 'member' },
      ]);
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        status: 'inviting',
      });

      const result = await service.acceptInvitation('token', {
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.status).toBe('confirmed');
      expect(result.firstName).toBe('John');
    });

    it('should throw for invalid token', async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);

      await expect(service.acceptInvitation('invalid', {})).rejects.toThrow('Invalid or expired');
    });
  });

  describe('processMemberPayment', () => {
    it('should process payment and transition to partial_paid', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        flightId: 'flight-1',
        status: 'awaiting_payment',
        paidAmountCents: 0,
        totalAmountCents: 150000,
        members: [
          { id: 'm1', email: 'org@test.com', role: 'organizer', status: 'confirmed', shareAmountCents: 50000 },
          { id: 'm2', email: 'm2@test.com', role: 'member', status: 'pending', shareAmountCents: 50000 },
          { id: 'm3', email: 'm3@test.com', role: 'member', status: 'pending', shareAmountCents: 50000 },
        ],
      });

      const result = await service.processMemberPayment('gb-1', 'm1', 50000);

      expect(result.paidAmountCents).toBe(50000);
      expect(result.status).toBe('partial_paid');
    });

    it('should throw for unknown member', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        members: [],
      });

      await expect(service.processMemberPayment('gb-1', 'invalid', 100)).rejects.toThrow('Member not found');
    });
  });

  describe('checkInAllMembers', () => {
    it('should check in all confirmed members', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        status: 'confirmed',
        members: [
          { id: 'm1', email: 'org@test.com', role: 'organizer', status: 'paid', firstName: 'Org', lastName: 'User' },
          { id: 'm2', email: 'm2@test.com', role: 'member', status: 'paid', firstName: 'M2', lastName: 'User' },
        ],
      });

      mockBookingRepo.find.mockResolvedValue([
        { id: 'b1', idempotencyKey: 'group_gb-1_member_m1' },
        { id: 'b2', idempotencyKey: 'group_gb-1_member_m2' },
      ]);

      mockCheckInRepo.findOne.mockResolvedValue(null);

      const result = await service.checkInAllMembers('gb-1');

      expect(result.checkedIn).toBe(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Corporate Account Management', () => {
    it('should create corporate account', async () => {
      mockAccountRepo.findOne.mockResolvedValue(null);

      const result = await service.createCorporateAccount({
        companyName: 'Test Corp',
        email: 'corp@test.com',
        registrationNumber: 'RN-123',
        industry: 'Technology',
      });

      expect(result.companyName).toBe('Test Corp');
      expect(result.status).toBe('active');
    });

    it('should throw if corporate account email already exists', async () => {
      mockAccountRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.createCorporateAccount({
        companyName: 'Test',
        email: 'existing@test.com',
      })).rejects.toThrow('already exists');
    });

    it('should update corporate account', async () => {
      mockAccountRepo.findOne.mockResolvedValue({ id: 'corp-1', companyName: 'Old Name' });

      const result = await service.updateCorporateAccount('corp-1', {
        companyName: 'New Name',
      });

      expect(result.companyName).toBe('New Name');
    });

    it('should suspend corporate account', async () => {
      const account = { id: 'corp-1', status: 'active' };
      mockAccountRepo.findOne.mockResolvedValue(account);

      const result = await service.suspendCorporateAccount('corp-1', 'Policy violation');

      expect(result.status).toBe('suspended');
    });

    it('should list corporate accounts', async () => {
      mockAccountRepo.findAndCount.mockResolvedValue([
        [{ id: 'corp-1', companyName: 'Test Corp' }],
        1,
      ]);

      const result = await service.listCorporateAccounts({});

      expect(result.accounts).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('Corporate User Management', () => {
    it('should add corporate user', async () => {
      mockAccountRepo.findOne.mockResolvedValue({ id: 'corp-1' });
      mockCorporateUserRepo.findOne.mockResolvedValue(null);

      const result = await service.addCorporateUser({
        corporateAccountId: 'corp-1',
        userId: 'user-1',
        role: 'traveler',
        department: 'Engineering',
      });

      expect(result.role).toBe('traveler');
    });

    it('should throw if user already in corporate account', async () => {
      mockAccountRepo.findOne.mockResolvedValue({ id: 'corp-1' });
      mockCorporateUserRepo.findOne.mockResolvedValue({ id: 'cu-1' });

      await expect(service.addCorporateUser({
        corporateAccountId: 'corp-1',
        userId: 'user-1',
        role: 'traveler',
      })).rejects.toThrow('already a member');
    });

    it('should update user role', async () => {
      const user = { id: 'cu-1', corporateAccountId: 'corp-1', userId: 'user-1', role: 'traveler' };
      mockCorporateUserRepo.findOne.mockResolvedValue(user);

      const result = await service.updateCorporateUserRole('corp-1', 'user-1', 'admin');

      expect(result.role).toBe('admin');
    });

    it('should remove corporate user', async () => {
      const user = { id: 'cu-1' };
      mockCorporateUserRepo.findOne.mockResolvedValue(user);

      await service.removeCorporateUser('corp-1', 'user-1');

      expect(mockCorporateUserRepo.remove).toHaveBeenCalledWith(user);
    });
  });

  describe('Booking Policies', () => {
    it('should create booking policy', async () => {
      mockAccountRepo.findOne.mockResolvedValue({ id: 'corp-1' });

      const result = await service.createBookingPolicy({
        corporateAccountId: 'corp-1',
        name: 'Standard Travel',
        requiresApproval: true,
        maxBookingAmountCents: 500000,
      });

      expect(result.name).toBe('Standard Travel');
    });

    it('should validate booking against policy - valid', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        corporateAccountId: 'corp-1',
        bookingPolicyId: 'policy-1',
        totalAmountCents: 100000,
        flightId: 'flight-1',
        members: [],
      });
      mockPolicyRepo.findOne.mockResolvedValue({
        maxBookingAmountCents: 500000,
        maxAdvanceBookingDays: 60,
        preferredAirlines: ['AA'],
        blacklistedAirlines: [],
      });

      const result = await service.validateBookingAgainstPolicy('gb-1');

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect policy violations', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        corporateAccountId: 'corp-1',
        bookingPolicyId: 'policy-1',
        totalAmountCents: 1000000,
        flightId: 'flight-1',
        members: [],
      });
      mockPolicyRepo.findOne.mockResolvedValue({
        maxBookingAmountCents: 500000,
        maxAdvanceBookingDays: 14,
        preferredAirlines: ['UA'],
        blacklistedAirlines: [],
      });

      const result = await service.validateBookingAgainstPolicy('gb-1');

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Approval Workflow', () => {
    it('should request approval', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        approvalStatus: 'not_required',
        corporateAccountId: 'corp-1',
      });

      const result = await service.requestApproval({
        groupBookingId: 'gb-1',
        requestedBy: 'user-1',
        requestReason: 'Corporate trip',
      });

      expect(result.status).toBe('pending');
    });

    it('should approve booking', async () => {
      mockApprovalRepo.findOne.mockResolvedValue({
        id: 'approval-1',
        status: 'pending',
        groupBookingId: 'gb-1',
      });
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        approvalStatus: 'pending',
        status: 'awaiting_payment',
      });

      const result = await service.approveBooking('approval-1', 'approver-1', 'Looks good');

      expect(result.status).toBe('approved');
      expect(result.approverId).toBe('approver-1');
    });

    it('should reject booking', async () => {
      mockApprovalRepo.findOne.mockResolvedValue({
        id: 'approval-1',
        status: 'pending',
        groupBookingId: 'gb-1',
      });
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        approvalStatus: 'pending',
      });

      const result = await service.rejectBooking('approval-1', 'approver-1', 'Budget exceeded');

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('Budget exceeded');
    });

    it('should list pending approvals', async () => {
      mockApprovalRepo.find.mockResolvedValue([
        { id: 'a1', status: 'pending', groupBookingId: 'gb-1' },
      ]);

      const result = await service.listPendingApprovals('corp-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('Billing and Invoicing', () => {
    it('should generate invoice', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        corporateAccountId: 'corp-1',
        totalAmountCents: 150000,
        members: [
          { id: 'm1', email: 'org@test.com', shareAmountCents: 50000, firstName: 'Org' },
          { id: 'm2', email: 'm2@test.com', shareAmountCents: 50000, firstName: 'M2' },
          { id: 'm3', email: 'm3@test.com', shareAmountCents: 50000, firstName: 'M3' },
        ],
      });
      mockAccountRepo.findOne.mockResolvedValue({
        id: 'corp-1',
        companyName: 'Test Corp',
        paymentTermsDays: 45,
      });

      const invoice = await service.generateInvoice('gb-1');

      expect(invoice.invoiceNumber).toContain('INV-');
      expect(invoice.lineItems).toHaveLength(3);
      expect(invoice.totalCents).toBeGreaterThan(150000);
      expect(invoice.companyName).toBe('Test Corp');
    });

    it('should get existing invoice', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        invoiceData: { invoiceNumber: 'INV-001', totalCents: 150000 },
      });

      const invoice = await service.getInvoice('gb-1');

      expect(invoice).not.toBeNull();
      expect(invoice!.invoiceNumber).toBe('INV-001');
    });

    it('should return null when no invoice', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        invoiceData: null,
      });

      const invoice = await service.getInvoice('gb-1');
      expect(invoice).toBeNull();
    });
  });

  describe('Corporate Group Booking Flow', () => {
    it('should create corporate group booking with approval', async () => {
      mockAccountRepo.findOne.mockResolvedValue({
        id: 'corp-1',
        companyName: 'Test Corp',
        status: 'active',
      });

      mockCorporateUserRepo.findOne.mockResolvedValue({
        id: 'cu-1',
        corporateAccountId: 'corp-1',
        userId: 'user-1',
        role: 'booking_manager',
      });

      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        groupName: 'Corporate Trip',
        flightId: 'flight-1',
        status: 'pending',
        totalAmountCents: 100000,
        approvalStatus: 'pending',
        members: [],
      });

      mockGroupBookingRepo.save.mockImplementation((gb: any) =>
        Promise.resolve({
          ...gb,
          id: 'gb-1',
          members: [],
          approvalStatus: 'pending',
        })
      );

      mockPolicyRepo.find.mockResolvedValue([{ requiresApproval: true }]);

      const result = await service.createCorporateGroupBooking({
        ...mockCreateRequest,
        corporateAccountId: 'corp-1',
        userId: 'user-1',
      });

      expect(result.approvalStatus).toBe('pending');
    });

    it('should throw for inactive corporate account', async () => {
      mockAccountRepo.findOne.mockResolvedValue({
        id: 'corp-1',
        status: 'suspended',
      });

      await expect(service.createCorporateGroupBooking({
        ...mockCreateRequest,
        corporateAccountId: 'corp-1',
        userId: 'user-1',
      })).rejects.toThrow('not active');
    });

    it('should throw if user not a corporate member', async () => {
      mockAccountRepo.findOne.mockResolvedValue({
        id: 'corp-1',
        status: 'active',
      });
      mockCorporateUserRepo.findOne.mockResolvedValue(null);

      await expect(service.createCorporateGroupBooking({
        ...mockCreateRequest,
        corporateAccountId: 'corp-1',
        userId: 'user-1',
      })).rejects.toThrow('not a member');
    });
  });

  describe('getGroupBooking', () => {
    it('should return group booking by id', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        groupName: 'Test',
        members: [],
      });

      const result = await service.getGroupBooking('gb-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('gb-1');
    });

    it('should return null for unknown id', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue(null);

      const result = await service.getGroupBooking('invalid');
      expect(result).toBeNull();
    });
  });

  describe('getGroupBookingByToken', () => {
    it('should return group and member by invite token', async () => {
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'm1',
        inviteToken: 'token-1',
        groupBooking: { id: 'gb-1', groupName: 'Test' },
      });

      const result = await service.getGroupBookingByToken('token-1');
      expect(result).not.toBeNull();
      expect(result!.group.id).toBe('gb-1');
    });

    it('should return null for invalid token', async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);

      const result = await service.getGroupBookingByToken('invalid');
      expect(result).toBeNull();
    });
  });

  describe('updateSharedItinerary', () => {
    it('should update shared itinerary', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({ id: 'gb-1' });

      const result = await service.updateSharedItinerary('gb-1', 'New itinerary');
      expect(result.sharedItinerary).toBe('New itinerary');
    });

    it('should throw for unknown group', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue(null);

      await expect(service.updateSharedItinerary('invalid', 'test')).rejects.toThrow('Group booking not found');
    });
  });

  describe('cancelGroupBooking', () => {
    it('should cancel group booking', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        status: 'pending',
        groupName: 'Test',
        organizerEmail: 'org@test.com',
        members: [],
      });

      const result = await service.cancelGroupBooking('gb-1', 'Changed plans');
      expect(result.status).toBe('cancelled');
    });

    it('should throw if already confirmed', async () => {
      mockGroupBookingRepo.findOne.mockResolvedValue({
        id: 'gb-1',
        status: 'confirmed',
        members: [],
      });

      await expect(service.cancelGroupBooking('gb-1', 'test')).rejects.toThrow('cannot be cancelled');
    });
  });
});
