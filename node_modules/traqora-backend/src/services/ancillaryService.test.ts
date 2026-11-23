import { Repository } from 'typeorm';
import { Booking } from '../db/entities/Booking';
import { AncillaryPurchase } from '../db/entities/AncillaryPurchase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import {
  AncillaryRepositories,
  AncillaryService,
  getAncillaryCatalog,
  normalizeCabinClass,
  recommendAncillaryServices,
  summarizeAncillaryRevenue,
} from './ancillaryService';

function purchase(overrides: Partial<AncillaryPurchase> = {}): AncillaryPurchase {
  return {
    id: 'purchase-id',
    bookingId: 'booking-id',
    serviceCode: 'PRIORITY_BOARDING',
    serviceType: 'priority_boarding',
    amountCents: 2500,
    quantity: 1,
    status: 'purchased',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-id',
    flight: {
      id: 'flight-id',
      fromAirport: 'JFK',
      rawData: { cabinClass: 'economy' },
    } as Booking['flight'],
    passenger: {} as Booking['passenger'],
    status: 'paid',
    amountCents: 50000,
    contractSubmitAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(bookingResult: Booking | null = booking()) {
  const bookingRepository = {
    findOne: jest.fn().mockResolvedValue(bookingResult),
  };
  const purchaseRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'saved-id', ...value })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };
  const repositories = {
    bookings: bookingRepository as unknown as Repository<Booking>,
    purchases: purchaseRepository as unknown as Repository<AncillaryPurchase>,
  } satisfies AncillaryRepositories;
  return {
    service: new AncillaryService(() => repositories),
    bookingRepository,
    purchaseRepository,
  };
}

describe('ancillary catalog helpers', () => {
  it('normalizes supported cabin names and defaults unknown values', () => {
    expect(normalizeCabinClass('Premium Economy')).toBe('premium');
    expect(normalizeCabinClass('BUSINESS')).toBe('business');
    expect(normalizeCabinClass('unknown')).toBe('economy');
  });

  it('filters services by cabin and only offers lounge access when an airport is supplied', () => {
    const withoutAirport = getAncillaryCatalog('economy');
    expect(withoutAirport.some((item) => item.code === 'LOUNGE_STANDARD')).toBe(false);
    expect(withoutAirport.some((item) => item.code === 'EXTRA_LEGROOM')).toBe(true);

    const withAirport = getAncillaryCatalog('first', 'JFK');
    expect(withAirport.map((item) => item.code)).toEqual(
      expect.arrayContaining(['PRIORITY_BOARDING', 'LOUNGE_STANDARD']),
    );
    expect(withAirport.some((item) => item.type === 'seat_upgrade')).toBe(false);
  });

  it('does not recommend services that were already purchased', () => {
    const recommendations = recommendAncillaryServices('economy', ['EXTRA_LEGROOM']);
    expect(recommendations.some((item) => item.code === 'EXTRA_LEGROOM')).toBe(false);
    expect(recommendations.some((item) => item.code === 'PRIORITY_BOARDING')).toBe(true);
  });

  it('recognises only completed revenue and accounts for quantity', () => {
    const report = summarizeAncillaryRevenue([
      purchase({ quantity: 2 }),
      purchase({
        id: 'accepted-bid',
        serviceType: 'seat_upgrade',
        amountCents: 10000,
        status: 'bid_accepted',
      }),
      purchase({ id: 'pending-bid', amountCents: 50000, status: 'bid_pending' }),
      purchase({ id: 'rejected-bid', amountCents: 50000, status: 'bid_rejected' }),
    ]);

    expect(report.totalCents).toBe(15000);
    expect(report.purchaseCount).toBe(2);
    expect(report.byType.priority_boarding).toEqual({ totalCents: 5000, purchaseCount: 1 });
    expect(report.byType.seat_upgrade).toEqual({ totalCents: 10000, purchaseCount: 1 });
  });
});

describe('AncillaryService', () => {
  it('purchases an eligible catalog service at the server-controlled price', async () => {
    const { service, purchaseRepository } = setup();
    const result = await service.purchase({
      bookingId: 'booking-id',
      serviceCode: 'PRIORITY_BOARDING',
      quantity: 2,
    });

    expect(result).toMatchObject({
      serviceCode: 'PRIORITY_BOARDING',
      amountCents: 2500,
      quantity: 2,
      status: 'purchased',
    });
    expect(purchaseRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown, ineligible, and incomplete lounge purchases', async () => {
    const { service } = setup(
      booking({ flight: { id: 'flight-id', rawData: { cabinClass: 'business' } } as Booking['flight'] }),
    );
    await expect(
      service.purchase({ bookingId: 'booking-id', serviceCode: 'NO_SUCH_SERVICE' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      service.purchase({ bookingId: 'booking-id', serviceCode: 'EXTRA_LEGROOM' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      service.purchase({ bookingId: 'booking-id', serviceCode: 'LOUNGE_STANDARD' }),
    ).rejects.toThrow('An airport is required');
  });

  it('returns not found when the booking does not exist', async () => {
    const { service } = setup(null);
    await expect(
      service.purchase({ bookingId: 'missing', serviceCode: 'PRIORITY_BOARDING' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prevents a wallet from purchasing extras for another wallet booking', async () => {
    const { service } = setup(booking({ walletAddress: 'GBOOKINGOWNER' }));
    await expect(
      service.purchase(
        { bookingId: 'booking-id', serviceCode: 'PRIORITY_BOARDING' },
        'GDIFFERENTWALLET',
      ),
    ).rejects.toThrow('different wallet');
  });

  it('enforces minimum upgrade bids and stores valid bids as pending', async () => {
    const { service } = setup();
    await expect(
      service.placeUpgradeBid({
        bookingId: 'booking-id',
        targetClass: 'business',
        bidCents: 24999,
      }),
    ).rejects.toThrow('Minimum business upgrade bid');

    await expect(
      service.placeUpgradeBid({
        bookingId: 'booking-id',
        targetClass: 'business',
        bidCents: 25000,
      }),
    ).resolves.toMatchObject({
      serviceCode: 'UPGRADE_BID_BUSINESS',
      amountCents: 25000,
      status: 'bid_pending',
    });

    const businessBooking = setup(
      booking({
        flight: {
          id: 'flight-id',
          fromAirport: 'JFK',
          rawData: { cabinClass: 'business' },
        } as Booking['flight'],
      }),
    );
    await expect(
      businessBooking.service.placeUpgradeBid({
        bookingId: 'booking-id',
        targetClass: 'premium',
        bidCents: 10000,
      }),
    ).rejects.toThrow('higher than the current cabin');
  });

  it('accepts or rejects only pending bids', async () => {
    const acceptedSetup = setup();
    acceptedSetup.purchaseRepository.findOne.mockResolvedValue(purchase({ status: 'bid_pending' }));
    await expect(acceptedSetup.service.resolveUpgradeBid('bid-id', true)).resolves.toMatchObject({
      status: 'bid_accepted',
    });

    const rejectedSetup = setup();
    rejectedSetup.purchaseRepository.findOne.mockResolvedValue(purchase({ status: 'bid_pending' }));
    await expect(rejectedSetup.service.resolveUpgradeBid('bid-id', false)).resolves.toMatchObject({
      status: 'bid_rejected',
    });

    const missingSetup = setup();
    missingSetup.purchaseRepository.findOne.mockResolvedValue(null);
    await expect(missingSetup.service.resolveUpgradeBid('missing', true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('allows gate upgrades only for paid bookings', async () => {
    const unpaid = setup(booking({ status: 'created' }));
    await expect(
      unpaid.service.purchaseGateUpgrade({ bookingId: 'booking-id', targetClass: 'premium' }),
    ).rejects.toThrow('paid or confirmed');

    const paid = setup();
    await expect(
      paid.service.purchaseGateUpgrade({
        bookingId: 'booking-id',
        targetClass: 'first',
        seatNumber: '2A',
      }),
    ).resolves.toMatchObject({
      serviceCode: 'GATE_UPGRADE_FIRST',
      amountCents: 80000,
      status: 'fulfilled',
      details: { targetClass: 'first', seatNumber: '2A', purchasedAtGate: true },
    });

    const firstClass = setup(
      booking({
        flight: {
          id: 'flight-id',
          fromAirport: 'JFK',
          rawData: { cabinClass: 'first' },
        } as Booking['flight'],
      }),
    );
    await expect(
      firstClass.service.purchaseGateUpgrade({
        bookingId: 'booking-id',
        targetClass: 'first',
      }),
    ).rejects.toThrow('higher than the current cabin');
  });

  it('builds recommendations from the booking cabin and active purchases', async () => {
    const { service, purchaseRepository } = setup();
    purchaseRepository.find.mockResolvedValue([
      purchase({ serviceCode: 'PRIORITY_BOARDING' }),
      purchase({ serviceCode: 'EXTRA_LEGROOM', status: 'bid_rejected' }),
    ]);
    const recommendations = await service.recommendations('booking-id');
    expect(recommendations.some((item) => item.code === 'PRIORITY_BOARDING')).toBe(false);
    expect(recommendations.some((item) => item.code === 'EXTRA_LEGROOM')).toBe(true);
    expect(recommendations.some((item) => item.code === 'LOUNGE_STANDARD')).toBe(true);
  });

  it('validates report dates and aggregates repository results', async () => {
    const { service, purchaseRepository } = setup();
    purchaseRepository.find.mockResolvedValue([purchase()]);
    await expect(
      service.revenueReport(new Date('2026-02-01'), new Date('2026-01-01')),
    ).rejects.toThrow('"from" must be before "to"');
    await expect(
      service.revenueReport(new Date('2026-01-01'), new Date('2026-02-01')),
    ).resolves.toMatchObject({ totalCents: 2500, purchaseCount: 1 });
  });
});
