import { AppDataSource } from "../db/dataSource";
import { Booking } from "../db/entities/Booking";
import { logger } from "../utils/logger";

export interface AncillaryProduct {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  category: "seat" | "boarding" | "lounge" | "legroom";
}

export interface AncillarySelection {
  productId: string;
  quantity: number;
}

export interface BookingAncillaries {
  bookingId: string;
  items: Array<{
    productId: string;
    name: string;
    priceCents: number;
    quantity: number;
    addedAt: string;
  }>;
  totalCents: number;
}

const ANCILIARY_CATALOG: AncillaryProduct[] = [
  {
    id: "seat-upgrade",
    name: "Seat Upgrade",
    description: "Upgrade to a better seat in Economy Plus or Business.",
    priceCents: 4500,
    currency: "USD",
    category: "seat",
  },
  {
    id: "priority-boarding",
    name: "Priority Boarding",
    description: "Board the aircraft first with priority access.",
    priceCents: 1500,
    currency: "USD",
    category: "boarding",
  },
  {
    id: "lounge-access",
    name: "Lounge Access",
    description: "Enjoy airport lounge access before your flight.",
    priceCents: 3500,
    currency: "USD",
    category: "lounge",
  },
  {
    id: "extra-legroom",
    name: "Extra Legroom Seat",
    description: "Select a seat with additional legroom for extra comfort.",
    priceCents: 2500,
    currency: "USD",
    category: "legroom",
  },
];

export class AncillaryService {
  public static getInstance(): AncillaryService {
    if (!AncillaryService.instance) {
      AncillaryService.instance = new AncillaryService();
    }
    return AncillaryService.instance;
  }

  private static instance: AncillaryService | null = null;

  public getCatalog(): AncillaryProduct[] {
    return ANCILIARY_CATALOG;
  }

  public async addAncillaries(bookingId: string, items: AncillarySelection[]): Promise<BookingAncillaries> {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });

    if (!booking) {
      throw new Error("Booking not found");
    }

    const meta: Record<string, unknown> = (booking as any).metadata ?? {};
    const existing: BookingAncillaries["items"] = Array.isArray(meta.ancillaries)
      ? (meta.ancillaries as BookingAncillaries["items"])
      : [];

    const now = new Date().toISOString();
    const updatedItems = [...existing];

    for (const item of items) {
      const product = ANCILIARY_CATALOG.find((p) => p.id === item.productId);
      if (!product) {
        throw new Error(`Unknown ancillary product: ${item.productId}`);
      }

      const existingIndex = updatedItems.findIndex((i) => i.productId === item.productId);
      if (existingIndex >= 0) {
        updatedItems[existingIndex].quantity += item.quantity;
      } else {
        updatedItems.push({
          productId: item.productId,
          name: product.name,
          priceCents: product.priceCents,
          quantity: item.quantity,
          addedAt: now,
        });
      }
    }

    const totalCents = updatedItems.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

    meta.ancillaries = updatedItems;
    (booking as any).metadata = meta;
    await bookingRepo.save(booking);

    logger.info("Ancillaries added", { bookingId, items: updatedItems.length, totalCents });

    return {
      bookingId,
      items: updatedItems,
      totalCents,
    };
  }

  public async getAncillaries(bookingId: string): Promise<BookingAncillaries | null> {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });

    if (!booking) {
      return null;
    }

    const meta: Record<string, unknown> = (booking as any).metadata ?? {};
    const items: BookingAncillaries["items"] = Array.isArray(meta.ancillaries)
      ? (meta.ancillaries as BookingAncillaries["items"])
      : [];

    const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

    return {
      bookingId,
      items,
      totalCents,
    };
  }
}
