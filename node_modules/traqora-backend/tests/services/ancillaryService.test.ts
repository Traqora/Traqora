import { AncillaryService, AncillaryRepositories } from '../../src/services/ancillaryService';
import { Booking } from '../../src/db/entities/Booking';
import { AncillaryPurchase } from '../../src/db/entities/AncillaryPurchase';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../src/utils/errors';

describe('AncillaryService Availability & Stale Offer Validation', () => {
  let mockBookings: Map<string, any>;
  let mockPurchases: any[];
  let service: AncillaryService;

  beforeEach(() => {
    mockBookings = new Map();
    mockPurchases = [];

    const mockBookingRepo: any = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return mockBookings.get(where.id) || null;
      }),
    };

    const mockPurchaseRepo: any = {
      find: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where?.bookingId) {
          return mockPurchases.filter((p) => p.bookingId === where.bookingId);
        }
        return mockPurchases;
      }),
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return (
          mockPurchases.find(
            (p) =>
              (!where.id || p.id === where.id) &&
              (!where.status || p.status === where.status),
          ) || null
        );
      }),
      create: jest.fn().mockImplementation((data: any) => ({
        id: `purchase-${Date.now()}-${Math.random()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      save: jest.fn().mockImplementation(async (item: any) => {
        const idx = mockPurchases.findIndex((p) => p.id === item.id);
        if (idx >= 0) {
          mockPurchases[idx] = item;
        } else {
          mockPurchases.push(item);
        }
        return item;
      }),
    };

    const repositories: () => AncillaryRepositories = () => ({
      bookings: mockBookingRepo,
      purchases: mockPurchaseRepo,
    });

    service = new AncillaryService(repositories);
  });

  const setupBooking = (overrides: Partial<any> = {}) => {
    const booking = {
      id: 'b1111111-1111-1111-1111-111111111111',
      status: 'confirmed',
      walletAddress: 'GA_WALLET_USER_1',
      flight: {
        id: 'f1',
        fromAirport: 'JFK',
        toAirport: 'LHR',
        departureTime: new Date(Date.now() + 86400000), // Tomorrow
        rawData: { cabinClass: 'economy' },
      },
      ...overrides,
    };
    mockBookings.set(booking.id, booking);
    return booking;
  };

  describe('checkAvailability', () => {
    it('returns available: true when ancillary is valid and unpurchased', async () => {
      const booking = setupBooking();
      const res = await service.checkAvailability(
        booking.id,
        'PRIORITY_BOARDING',
        'GA_WALLET_USER_1',
      );

      expect(res.available).toBe(true);
      expect(res.item?.code).toBe('PRIORITY_BOARDING');
    });

    it('returns available: false when service code is unknown', async () => {
      const booking = setupBooking();
      const res = await service.checkAvailability(booking.id, 'UNKNOWN_SERVICE');

      expect(res.available).toBe(false);
      expect(res.reason).toContain('Unknown ancillary service code');
    });

    it('returns available: false when cabin class does not support the offer', async () => {
      const booking = setupBooking({
        flight: { rawData: { cabinClass: 'business' } },
      });
      // SEAT_UPGRADE_PREMIUM is only available for economy
      const res = await service.checkAvailability(booking.id, 'SEAT_UPGRADE_PREMIUM');

      expect(res.available).toBe(false);
      expect(res.reason).toContain('not available for business cabin');
    });

    it('returns available: false when airport does not match routing', async () => {
      const booking = setupBooking();
      const res = await service.checkAvailability(
        booking.id,
        'LOUNGE_STANDARD',
        'GA_WALLET_USER_1',
        { airport: 'DXB' }, // Flight is JFK -> LHR
      );

      expect(res.available).toBe(false);
      expect(res.reason).toContain('does not match flight itinerary');
    });

    it('returns available: false when ancillary was already purchased (stale offer)', async () => {
      const booking = setupBooking();
      mockPurchases.push({
        id: 'p1',
        bookingId: booking.id,
        serviceCode: 'PRIORITY_BOARDING',
        serviceType: 'priority_boarding',
        status: 'purchased',
      });

      const res = await service.checkAvailability(booking.id, 'PRIORITY_BOARDING');

      expect(res.available).toBe(false);
      expect(res.reason).toContain('already been purchased');
    });

    it('returns available: false when booking is refunded or cancelled', async () => {
      const booking = setupBooking({ status: 'refunded' });
      const res = await service.checkAvailability(booking.id, 'PRIORITY_BOARDING');

      expect(res.available).toBe(false);
      expect(res.reason).toContain('cannot accept ancillary purchases');
    });

    it('returns available: false when flight has already departed', async () => {
      const booking = setupBooking({
        flight: {
          departureTime: new Date(Date.now() - 3600000), // 1 hour ago
          rawData: { cabinClass: 'economy' },
        },
      });
      const res = await service.checkAvailability(booking.id, 'PRIORITY_BOARDING');

      expect(res.available).toBe(false);
      expect(res.reason).toContain('already departed');
    });
  });

  describe('purchase', () => {
    it('successfully purchases available ancillary service', async () => {
      const booking = setupBooking();
      const purchase = await service.purchase(
        {
          bookingId: booking.id,
          serviceCode: 'PRIORITY_BOARDING',
          quantity: 1,
        },
        'GA_WALLET_USER_1',
      );

      expect(purchase).toBeDefined();
      expect(purchase.serviceCode).toBe('PRIORITY_BOARDING');
      expect(purchase.status).toBe('purchased');
      expect(purchase.amountCents).toBe(2500);
      expect(mockPurchases).toHaveLength(1);
    });

    it('rejects stale purchase if ancillary was already bought for this booking', async () => {
      const booking = setupBooking();
      await service.purchase(
        {
          bookingId: booking.id,
          serviceCode: 'PRIORITY_BOARDING',
        },
        'GA_WALLET_USER_1',
      );

      // Attempt second purchase with the now-stale offer
      await expect(
        service.purchase(
          {
            bookingId: booking.id,
            serviceCode: 'PRIORITY_BOARDING',
          },
          'GA_WALLET_USER_1',
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects purchase when booking belongs to a different wallet', async () => {
      const booking = setupBooking({ walletAddress: 'GA_ACTUAL_OWNER' });

      await expect(
        service.purchase(
          {
            bookingId: booking.id,
            serviceCode: 'PRIORITY_BOARDING',
          },
          'GA_IMPOSTER',
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects purchase when booking is refunded or failed', async () => {
      const booking = setupBooking({ status: 'refunded' });

      await expect(
        service.purchase(
          {
            bookingId: booking.id,
            serviceCode: 'PRIORITY_BOARDING',
          },
          'GA_WALLET_USER_1',
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects lounge purchase if airport is missing', async () => {
      const booking = setupBooking();

      await expect(
        service.purchase(
          {
            bookingId: booking.id,
            serviceCode: 'LOUNGE_STANDARD',
          },
          'GA_WALLET_USER_1',
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it('accepts lounge purchase when airport matches departure airport', async () => {
      const booking = setupBooking();

      const purchase = await service.purchase(
        {
          bookingId: booking.id,
          serviceCode: 'LOUNGE_STANDARD',
          details: { airport: 'JFK' },
        },
        'GA_WALLET_USER_1',
      );

      expect(purchase.serviceCode).toBe('LOUNGE_STANDARD');
      expect(purchase.status).toBe('purchased');
    });
  });

  describe('placeUpgradeBid', () => {
    it('places an upgrade bid for an eligible cabin', async () => {
      const booking = setupBooking();
      const bid = await service.placeUpgradeBid(
        {
          bookingId: booking.id,
          targetClass: 'premium',
          bidCents: 10000,
        },
        'GA_WALLET_USER_1',
      );

      expect(bid.serviceType).toBe('seat_upgrade');
      expect(bid.status).toBe('bid_pending');
      expect(bid.amountCents).toBe(10000);
    });

    it('rejects upgrade bid if another bid/upgrade is already active', async () => {
      const booking = setupBooking();
      await service.placeUpgradeBid(
        {
          bookingId: booking.id,
          targetClass: 'premium',
          bidCents: 10000,
        },
        'GA_WALLET_USER_1',
      );

      await expect(
        service.placeUpgradeBid(
          {
            bookingId: booking.id,
            targetClass: 'business',
            bidCents: 30000,
          },
          'GA_WALLET_USER_1',
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects upgrade bid below minimum threshold', async () => {
      const booking = setupBooking();

      await expect(
        service.placeUpgradeBid(
          {
            bookingId: booking.id,
            targetClass: 'premium',
            bidCents: 1000, // Minimum is 7500
          },
          'GA_WALLET_USER_1',
        ),
      ).rejects.toThrow(BadRequestError);
    });
  });
});
