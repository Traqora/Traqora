import { Between, Repository } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import {
  AncillaryPurchase,
  AncillaryPurchaseStatus,
  AncillaryServiceType,
} from '../db/entities/AncillaryPurchase';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';

export type CabinClass = 'economy' | 'premium' | 'business' | 'first';

export interface AncillaryCatalogItem {
  code: string;
  name: string;
  description: string;
  type: AncillaryServiceType;
  priceCents: number;
  availableCabins: CabinClass[];
  requiresAirport?: boolean;
  availableAtGate?: boolean;
}

export interface PurchaseAncillaryInput {
  bookingId: string;
  serviceCode: string;
  quantity?: number;
  details?: Record<string, string | number | boolean>;
}

export interface UpgradeBidInput {
  bookingId: string;
  targetClass: Exclude<CabinClass, 'economy'>;
  bidCents: number;
}

export interface GateUpgradeInput {
  bookingId: string;
  targetClass: Exclude<CabinClass, 'economy'>;
  seatNumber?: string;
}

export interface AncillaryRevenueReport {
  totalCents: number;
  purchaseCount: number;
  byType: Record<AncillaryServiceType, { totalCents: number; purchaseCount: number }>;
}

export interface AncillaryRepositories {
  bookings: Repository<Booking>;
  purchases: Repository<AncillaryPurchase>;
}

const ALL_CABINS: CabinClass[] = ['economy', 'premium', 'business', 'first'];
const CABIN_RANK: Record<CabinClass, number> = {
  economy: 0,
  premium: 1,
  business: 2,
  first: 3,
};

export const ANCILLARY_CATALOG: AncillaryCatalogItem[] = [
  {
    code: 'SEAT_UPGRADE_PREMIUM',
    name: 'Premium cabin upgrade',
    description: 'Upgrade to premium seating with more space and priority service.',
    type: 'seat_upgrade',
    priceCents: 12500,
    availableCabins: ['economy'],
  },
  {
    code: 'SEAT_UPGRADE_BUSINESS',
    name: 'Business cabin upgrade',
    description: 'Move to business class when inventory is available.',
    type: 'seat_upgrade',
    priceCents: 45000,
    availableCabins: ['economy', 'premium'],
  },
  {
    code: 'PRIORITY_BOARDING',
    name: 'Priority boarding',
    description: 'Board in an earlier group and settle in before general boarding.',
    type: 'priority_boarding',
    priceCents: 2500,
    availableCabins: ALL_CABINS,
  },
  {
    code: 'LOUNGE_STANDARD',
    name: 'Airport lounge access',
    description: 'One-time lounge admission before departure.',
    type: 'lounge_access',
    priceCents: 4500,
    availableCabins: ALL_CABINS,
    requiresAirport: true,
  },
  {
    code: 'EXTRA_LEGROOM',
    name: 'Extra legroom seat',
    description: 'Reserve a seat with additional pitch, subject to availability.',
    type: 'extra_legroom',
    priceCents: 3500,
    availableCabins: ['economy', 'premium'],
    availableAtGate: true,
  },
];

const MINIMUM_UPGRADE_BIDS: Record<Exclude<CabinClass, 'economy'>, number> = {
  premium: 7500,
  business: 25000,
  first: 50000,
};

const GATE_UPGRADE_PRICES: Record<Exclude<CabinClass, 'economy'>, number> = {
  premium: 20000,
  business: 50000,
  first: 80000,
};

const REVENUE_STATUSES = new Set<AncillaryPurchaseStatus>([
  'purchased',
  'fulfilled',
  'bid_accepted',
]);

export function normalizeCabinClass(value?: string): CabinClass {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'premium_economy' || normalized === 'premium') return 'premium';
  if (normalized === 'business') return 'business';
  if (normalized === 'first') return 'first';
  return 'economy';
}

export function getAncillaryCatalog(
  cabinClass?: string,
  airport?: string,
): AncillaryCatalogItem[] {
  const cabin = normalizeCabinClass(cabinClass);
  return ANCILLARY_CATALOG.filter(
    (item) =>
      item.availableCabins.includes(cabin) &&
      (!item.requiresAirport || Boolean(airport?.trim())),
  );
}

export function recommendAncillaryServices(
  cabinClass: string | undefined,
  purchasedCodes: string[],
  airport?: string,
): AncillaryCatalogItem[] {
  const purchased = new Set(purchasedCodes);
  return getAncillaryCatalog(cabinClass, airport).filter(
    (item) => !purchased.has(item.code),
  );
}

export function summarizeAncillaryRevenue(
  purchases: AncillaryPurchase[],
): AncillaryRevenueReport {
  const byType: AncillaryRevenueReport['byType'] = {
    seat_upgrade: { totalCents: 0, purchaseCount: 0 },
    priority_boarding: { totalCents: 0, purchaseCount: 0 },
    lounge_access: { totalCents: 0, purchaseCount: 0 },
    extra_legroom: { totalCents: 0, purchaseCount: 0 },
  };

  let totalCents = 0;
  let purchaseCount = 0;
  for (const purchase of purchases) {
    if (!REVENUE_STATUSES.has(purchase.status)) continue;
    const lineTotal = purchase.amountCents * purchase.quantity;
    totalCents += lineTotal;
    purchaseCount += 1;
    byType[purchase.serviceType].totalCents += lineTotal;
    byType[purchase.serviceType].purchaseCount += 1;
  }

  return { totalCents, purchaseCount, byType };
}

function defaultRepositories(): AncillaryRepositories {
  return {
    bookings: AppDataSource.getRepository(Booking),
    purchases: AppDataSource.getRepository(AncillaryPurchase),
  };
}

export class AncillaryService {
  constructor(private readonly repositories: () => AncillaryRepositories = defaultRepositories) {}

  private async getBooking(bookingId: string, walletAddress?: string): Promise<Booking> {
    const booking = await this.repositories().bookings.findOne({
      where: { id: bookingId },
      relations: ['flight'],
    });
    if (!booking) throw new NotFoundError('Booking not found');
    if (walletAddress && booking.walletAddress && booking.walletAddress !== walletAddress) {
      throw new ForbiddenError('This booking belongs to a different wallet');
    }
    return booking;
  }

  async purchase(input: PurchaseAncillaryInput, walletAddress?: string): Promise<AncillaryPurchase> {
    const booking = await this.getBooking(input.bookingId, walletAddress);
    const item = ANCILLARY_CATALOG.find((candidate) => candidate.code === input.serviceCode);
    if (!item) throw new BadRequestError('Unknown ancillary service code');

    const cabin = normalizeCabinClass(booking.flight?.rawData?.cabinClass as string | undefined);
    if (!item.availableCabins.includes(cabin)) {
      throw new BadRequestError(`${item.name} is not available for ${cabin} cabin`);
    }
    if (item.requiresAirport && typeof input.details?.airport !== 'string') {
      throw new BadRequestError('An airport is required for lounge access');
    }

    const quantity = input.quantity ?? 1;
    const repository = this.repositories().purchases;
    return repository.save(
      repository.create({
        bookingId: input.bookingId,
        serviceCode: item.code,
        serviceType: item.type,
        amountCents: item.priceCents,
        quantity,
        status: 'purchased',
        details: input.details,
      }),
    );
  }

  async placeUpgradeBid(input: UpgradeBidInput, walletAddress?: string): Promise<AncillaryPurchase> {
    const booking = await this.getBooking(input.bookingId, walletAddress);
    const currentCabin = normalizeCabinClass(
      booking.flight?.rawData?.cabinClass as string | undefined,
    );
    if (CABIN_RANK[input.targetClass] <= CABIN_RANK[currentCabin]) {
      throw new BadRequestError('Target cabin must be higher than the current cabin');
    }
    const minimumBid = MINIMUM_UPGRADE_BIDS[input.targetClass];
    if (input.bidCents < minimumBid) {
      throw new BadRequestError(`Minimum ${input.targetClass} upgrade bid is ${minimumBid} cents`);
    }

    const repository = this.repositories().purchases;
    return repository.save(
      repository.create({
        bookingId: input.bookingId,
        serviceCode: `UPGRADE_BID_${input.targetClass.toUpperCase()}`,
        serviceType: 'seat_upgrade',
        amountCents: input.bidCents,
        quantity: 1,
        status: 'bid_pending',
        details: { targetClass: input.targetClass },
      }),
    );
  }

  async resolveUpgradeBid(id: string, accepted: boolean): Promise<AncillaryPurchase> {
    const repository = this.repositories().purchases;
    const bid = await repository.findOne({ where: { id, status: 'bid_pending' } });
    if (!bid) throw new NotFoundError('Pending upgrade bid not found');
    bid.status = accepted ? 'bid_accepted' : 'bid_rejected';
    return repository.save(bid);
  }

  async purchaseGateUpgrade(input: GateUpgradeInput): Promise<AncillaryPurchase> {
    const booking = await this.getBooking(input.bookingId);
    if (!['paid', 'onchain_submitted', 'confirmed'].includes(booking.status)) {
      throw new BadRequestError('Gate upgrades require a paid or confirmed booking');
    }
    const currentCabin = normalizeCabinClass(
      booking.flight?.rawData?.cabinClass as string | undefined,
    );
    if (CABIN_RANK[input.targetClass] <= CABIN_RANK[currentCabin]) {
      throw new BadRequestError('Target cabin must be higher than the current cabin');
    }

    const repository = this.repositories().purchases;
    return repository.save(
      repository.create({
        bookingId: input.bookingId,
        serviceCode: `GATE_UPGRADE_${input.targetClass.toUpperCase()}`,
        serviceType: 'seat_upgrade',
        amountCents: GATE_UPGRADE_PRICES[input.targetClass],
        quantity: 1,
        status: 'fulfilled',
        details: {
          targetClass: input.targetClass,
          ...(input.seatNumber ? { seatNumber: input.seatNumber } : {}),
          purchasedAtGate: true,
        },
      }),
    );
  }

  async recommendations(
    bookingId: string,
    walletAddress?: string,
  ): Promise<AncillaryCatalogItem[]> {
    const booking = await this.getBooking(bookingId, walletAddress);
    const purchases = await this.repositories().purchases.find({ where: { bookingId } });
    const cabin = booking.flight?.rawData?.cabinClass as string | undefined;
    return recommendAncillaryServices(
      cabin,
      purchases
        .filter((purchase) => purchase.status !== 'bid_rejected')
        .map((purchase) => purchase.serviceCode),
      booking.flight?.fromAirport,
    );
  }

  async revenueReport(from: Date, to: Date): Promise<AncillaryRevenueReport> {
    if (from > to) throw new BadRequestError('"from" must be before "to"');
    const purchases = await this.repositories().purchases.find({
      where: { createdAt: Between(from, to) },
    });
    return summarizeAncillaryRevenue(purchases);
  }
}

export const ancillaryService = new AncillaryService();
