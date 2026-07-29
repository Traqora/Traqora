import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../db/dataSource';
import { CarbonOffset } from '../db/entities/CarbonOffset';
import { OffsetProject, OffsetProjectType } from '../db/entities/OffsetProject';
import { Flight } from '../db/entities/Flight';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/errors';

export interface CarbonFootprint {
  flightId: string;
  totalCO2kg: number;
  cabinClassFactor: number;
  distanceKm: number;
  calculationMethod: string;
}

export interface OffsetCost {
  costCents: number;
  tonsToOffset: number;
  projectId: string;
  projectName: string;
  pricePerTonCents: number;
}

export interface OffsetCertificate {
  id: string;
  purchaseId: string;
  certificateRef: string;
  co2Kg: number;
  tonsOffset: number;
  projectName: string;
  projectType: OffsetProjectType;
  purchasedAt: Date;
  userId: string;
}

/** Everything the booking flow needs to render the carbon-neutral option. */
export interface CarbonNeutralQuote {
  footprint: CarbonFootprint;
  /** One priced option per active project, cheapest first. */
  options: OffsetCost[];
  recommended: OffsetCost | null;
}

export interface PlatformSustainabilityReport {
  from: Date | null;
  to: Date | null;
  totalCO2OffsetKg: number;
  totalOffsetCents: number;
  totalPurchases: number;
  carbonNeutralBookings: number;
  uniqueContributors: number;
  treesEquivalent: number;
  byProject: Array<{
    projectId: string;
    projectName: string;
    projectType: OffsetProjectType;
    purchases: number;
    co2Kg: number;
    amountCents: number;
  }>;
  /** Totals bucketed by calendar month, "YYYY-MM", oldest first. */
  byMonth: Array<{ month: string; purchases: number; co2Kg: number; amountCents: number }>;
}

export interface SustainabilityStats {
  totalCO2OffsetKg: number;
  totalOffsetCents: number;
  totalPurchases: number;
  projectsSupported: number;
  treesEquivalent: number;
  carsOffRoadEquivalent: number;
  recentPurchases: CarbonOffset[];
}

const CABIN_CLASS_FACTORS: Record<string, number> = {
  economy: 1,
  premium_economy: 1.3,
  business: 1.5,
  first: 2,
};

const EMISSIONS_PER_KM_KG = 0.115;

class MockBlockchainClient {
  async recordOffset(_params: {
    userId: string;
    tonsOffset: number;
    projectId: string;
  }): Promise<{ txHash: string }> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      txHash: `0x${uuidv4().replace(/-/g, '').slice(0, 32)}`,
    };
  }
}

const SEED_PROJECTS: Array<{
  name: string;
  type: OffsetProjectType;
  pricePerTonCents: number;
  description: string;
  certifications: string[];
}> = [
  {
    name: 'Amazon Rainforest Reforestation',
    type: 'reforestation',
    pricePerTonCents: 1500,
    description: 'Supports reforestation efforts in the Amazon basin, restoring native tree species and protecting biodiversity.',
    certifications: ['Verra VCS', 'CCBS'],
  },
  {
    name: 'Solar Energy Farm - India',
    type: 'renewable',
    pricePerTonCents: 1000,
    description: 'Funds solar energy infrastructure in rural India, replacing coal-powered electricity with clean alternatives.',
    certifications: ['Gold Standard', 'UNFCCC'],
  },
  {
    name: 'Clean Water Initiative - Africa',
    type: 'community',
    pricePerTonCents: 1200,
    description: 'Provides clean water access and efficient cookstoves to communities, reducing deforestation and improving health.',
    certifications: ['Gold Standard', 'SDG Verified'],
  },
];

export class CarbonOffsetService {
  private static instance: CarbonOffsetService;
  private offsetRepo = AppDataSource.getRepository(CarbonOffset);
  private projectRepo = AppDataSource.getRepository(OffsetProject);
  private flightRepo = AppDataSource.getRepository(Flight);
  private blockchainClient = new MockBlockchainClient();

  static getInstance(): CarbonOffsetService {
    if (!CarbonOffsetService.instance) {
      CarbonOffsetService.instance = new CarbonOffsetService();
    }
    return CarbonOffsetService.instance;
  }

  static resetForTesting(): void {
    CarbonOffsetService.instance = undefined as any;
  }

  async ensureDefaultProjects(): Promise<void> {
    const count = await this.projectRepo.count();
    if (count > 0) return;

    for (const p of SEED_PROJECTS) {
      const project = this.projectRepo.create({
        name: p.name,
        type: p.type,
        pricePerTonCents: p.pricePerTonCents,
        description: p.description,
        certifications: p.certifications,
        status: 'active',
      });
      await this.projectRepo.save(project);
    }

    logger.info(`Seeded ${SEED_PROJECTS.length} default offset projects`);
  }

  async calculateFlightFootprint(
    flightId: string,
    cabinClass: string = 'economy',
  ): Promise<CarbonFootprint> {
    const flight = await this.flightRepo.findOne({ where: { id: flightId } });
    if (!flight) throw new NotFoundError('Flight not found');

    const cabinClassFactor = CABIN_CLASS_FACTORS[cabinClass] ?? 1;

    const distanceKm = this.estimateDistance(
      flight.fromAirport,
      flight.toAirport,
    );

    const totalCO2kg = Math.round(distanceKm * EMISSIONS_PER_KM_KG * cabinClassFactor);

    return {
      flightId,
      totalCO2kg,
      cabinClassFactor,
      distanceKm,
      calculationMethod: 'ICAO_CARBON_EMISSIONS_CALCULATOR_V2',
    };
  }

  async getOffsetProjects(): Promise<OffsetProject[]> {
    await this.ensureDefaultProjects();
    return this.projectRepo.find({ where: { status: 'active' } });
  }

  async calculateOffsetCost(
    footprintKg: number,
    projectId: string,
  ): Promise<OffsetCost> {
    const tonsToOffset = Math.ceil(footprintKg / 1000);

    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundError('Offset project not found');

    return {
      costCents: tonsToOffset * project.pricePerTonCents,
      tonsToOffset,
      projectId,
      projectName: project.name,
      pricePerTonCents: project.pricePerTonCents,
    };
  }

  async purchaseOffset(params: {
    userId: string;
    flightId: string;
    projectId: string;
    amountCents: number;
    bookingId?: string;
  }): Promise<OffsetCertificate> {
    const project = await this.projectRepo.findOne({ where: { id: params.projectId } });
    if (!project) throw new NotFoundError('Offset project not found');

    const footprint = await this.calculateFlightFootprint(params.flightId);
    const cost = await this.calculateOffsetCost(footprint.totalCO2kg, params.projectId);

    if (params.amountCents < cost.costCents) {
      throw new BadRequestError(
        `Insufficient amount: minimum ${cost.costCents} cents required for ${cost.tonsToOffset} ton(s)`,
      );
    }

    const txResult = await this.blockchainClient.recordOffset({
      userId: params.userId,
      tonsOffset: cost.tonsToOffset,
      projectId: params.projectId,
    });

    const certificateRef = `CRB-${uuidv4().slice(0, 8).toUpperCase()}`;

    const offset = this.offsetRepo.create({
      userId: params.userId,
      flightId: params.flightId,
      projectId: params.projectId,
      project,
      amountCents: cost.costCents,
      co2Kg: footprint.totalCO2kg,
      tonsOffset: cost.tonsToOffset,
      status: 'completed',
      bookingId: params.bookingId,
      certificateRef,
      sorobanTxHash: txResult.txHash,
    });

    const saved = await this.offsetRepo.save(offset);

    await this.projectRepo.increment({ id: params.projectId }, 'totalOffsetTons', cost.tonsToOffset);

    logger.info('Carbon offset purchased', {
      offsetId: saved.id,
      userId: params.userId,
      projectId: params.projectId,
      co2Kg: footprint.totalCO2kg,
    });

    return {
      id: saved.id,
      purchaseId: saved.id,
      certificateRef,
      co2Kg: footprint.totalCO2kg,
      tonsOffset: cost.tonsToOffset,
      projectName: project.name,
      projectType: project.type,
      purchasedAt: saved.createdAt,
      userId: params.userId,
    };
  }

  /**
   * Prices the offset for a flight against every active project so the
   * booking flow can show the carbon-neutral option before checkout.
   */
  async getCarbonNeutralQuote(
    flightId: string,
    cabinClass: string = 'economy',
  ): Promise<CarbonNeutralQuote> {
    const footprint = await this.calculateFlightFootprint(flightId, cabinClass);
    const projects = await this.getOffsetProjects();

    const options = projects
      .map((project) => {
        const tonsToOffset = Math.ceil(footprint.totalCO2kg / 1000);
        return {
          costCents: tonsToOffset * project.pricePerTonCents,
          tonsToOffset,
          projectId: project.id,
          projectName: project.name,
          pricePerTonCents: project.pricePerTonCents,
        };
      })
      .sort((a, b) => a.costCents - b.costCents);

    return {
      footprint,
      options,
      recommended: options[0] ?? null,
    };
  }

  /**
   * Offsets a booking in one step: prices the flight, then buys the offset
   * from the chosen project (cheapest active one when unspecified).
   *
   * This is what the "make this booking carbon neutral" checkbox calls, so it
   * never asks the caller to compute the amount itself.
   */
  async purchaseCarbonNeutralBooking(params: {
    userId: string;
    flightId: string;
    bookingId: string;
    projectId?: string;
    cabinClass?: string;
  }): Promise<OffsetCertificate> {
    const quote = await this.getCarbonNeutralQuote(
      params.flightId,
      params.cabinClass ?? 'economy',
    );

    const selected = params.projectId
      ? quote.options.find((option) => option.projectId === params.projectId)
      : quote.recommended;

    if (!selected) {
      throw new NotFoundError('No active offset project available');
    }

    const existing = await this.offsetRepo.findOne({
      where: { bookingId: params.bookingId, status: 'completed' },
    });
    if (existing) {
      throw new BadRequestError('This booking has already been offset');
    }

    return this.purchaseOffset({
      userId: params.userId,
      flightId: params.flightId,
      projectId: selected.projectId,
      amountCents: selected.costCents,
      bookingId: params.bookingId,
    });
  }

  /**
   * Platform-wide sustainability reporting: totals, per-project breakdown,
   * and a monthly series for trend reporting.
   */
  async getPlatformSustainabilityReport(range: {
    from?: Date;
    to?: Date;
  } = {}): Promise<PlatformSustainabilityReport> {
    const query = this.offsetRepo
      .createQueryBuilder('offset')
      .leftJoinAndSelect('offset.project', 'project')
      .where('offset.status = :status', { status: 'completed' });

    if (range.from) query.andWhere('offset.createdAt >= :from', { from: range.from });
    if (range.to) query.andWhere('offset.createdAt <= :to', { to: range.to });

    const offsets = await query.orderBy('offset.createdAt', 'ASC').getMany();

    const byProjectMap = new Map<string, PlatformSustainabilityReport['byProject'][number]>();
    const byMonthMap = new Map<string, PlatformSustainabilityReport['byMonth'][number]>();

    for (const offset of offsets) {
      const projectId = offset.projectId;
      const projectEntry = byProjectMap.get(projectId) ?? {
        projectId,
        projectName: offset.project?.name ?? 'Unknown',
        projectType: offset.project?.type ?? ('reforestation' as OffsetProjectType),
        purchases: 0,
        co2Kg: 0,
        amountCents: 0,
      };
      projectEntry.purchases += 1;
      projectEntry.co2Kg += offset.co2Kg;
      projectEntry.amountCents += offset.amountCents;
      byProjectMap.set(projectId, projectEntry);

      const month = offset.createdAt.toISOString().slice(0, 7);
      const monthEntry = byMonthMap.get(month) ?? {
        month,
        purchases: 0,
        co2Kg: 0,
        amountCents: 0,
      };
      monthEntry.purchases += 1;
      monthEntry.co2Kg += offset.co2Kg;
      monthEntry.amountCents += offset.amountCents;
      byMonthMap.set(month, monthEntry);
    }

    const totalCO2OffsetKg = offsets.reduce((sum, o) => sum + o.co2Kg, 0);

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      totalCO2OffsetKg,
      totalOffsetCents: offsets.reduce((sum, o) => sum + o.amountCents, 0),
      totalPurchases: offsets.length,
      carbonNeutralBookings: new Set(
        offsets.filter((o) => o.bookingId).map((o) => o.bookingId),
      ).size,
      uniqueContributors: new Set(offsets.map((o) => o.userId)).size,
      treesEquivalent: Math.round(totalCO2OffsetKg / 21),
      byProject: [...byProjectMap.values()].sort((a, b) => b.co2Kg - a.co2Kg),
      byMonth: [...byMonthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  async getOffsetPurchase(purchaseId: string): Promise<CarbonOffset | null> {
    return this.offsetRepo.findOne({
      where: { id: purchaseId },
      relations: ['project'],
    });
  }

  async generateCertificate(purchaseId: string): Promise<Buffer> {
    const offset = await this.offsetRepo.findOne({
      where: { id: purchaseId },
      relations: ['project'],
    });
    if (!offset) throw new NotFoundError('Offset purchase not found');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(24).text('Carbon Offset Certificate', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).fillColor('#666').text('Traqora Sustainability Initiative', { align: 'center' });
      doc.moveDown(2);

      doc.fillColor('#000').fontSize(12);
      doc.text(`Certificate Reference: ${offset.certificateRef || 'N/A'}`);
      doc.text(`Purchase ID: ${offset.id}`);
      doc.text(`User ID: ${offset.userId}`);
      doc.text(`Flight ID: ${offset.flightId}`);
      doc.text(`Project: ${offset.project?.name || 'Unknown'}`);
      doc.text(`CO₂ Offset: ${offset.co2Kg} kg (${offset.tonsOffset} tons)`);
      doc.text(`Amount: $${(offset.amountCents / 100).toFixed(2)} USD`);
      doc.text(`Status: ${offset.status}`);
      doc.text(`Date: ${offset.createdAt.toISOString()}`);
      if (offset.sorobanTxHash) {
        doc.text(`Blockchain Tx: ${offset.sorobanTxHash}`);
      }
      doc.moveDown(2);

      doc.fontSize(10).fillColor('#999').text(
        'This certificate certifies that the above carbon offset has been purchased and recorded on the Stellar blockchain. ' +
        'The offset contributes to verified emission reduction projects.',
      );

      doc.end();
    });
  }

  async getUserSustainabilityStats(userId: string): Promise<SustainabilityStats> {
    const purchases = await this.offsetRepo.find({
      where: { userId, status: 'completed' },
      relations: ['project'],
      order: { createdAt: 'DESC' },
    });

    const totalCO2OffsetKg = purchases.reduce((sum, p) => sum + p.co2Kg, 0);
    const totalOffsetCents = purchases.reduce((sum, p) => sum + p.amountCents, 0);
    const projectsSupported = new Set(purchases.map((p) => p.projectId)).size;

    const treesEquivalent = Math.round(totalCO2OffsetKg / 21);
    const carsOffRoadEquivalent = Math.round(totalCO2OffsetKg / 4600);

    return {
      totalCO2OffsetKg,
      totalOffsetCents,
      totalPurchases: purchases.length,
      projectsSupported,
      treesEquivalent,
      carsOffRoadEquivalent,
      recentPurchases: purchases.slice(0, 10),
    };
  }

  private estimateDistance(from: string, to: string): number {
    const airports: Record<string, { lat: number; lon: number }> = {
      JFK: { lat: 40.6413, lon: -73.7781 },
      LAX: { lat: 33.9425, lon: -118.4081 },
      LHR: { lat: 51.4700, lon: -0.4543 },
      CDG: { lat: 49.0097, lon: 2.5479 },
      DXB: { lat: 25.2532, lon: 55.3657 },
      HND: { lat: 35.5494, lon: 139.7798 },
      SIN: { lat: 1.3644, lon: 103.9915 },
      SFO: { lat: 37.6213, lon: -122.3790 },
      ORD: { lat: 41.9742, lon: -87.9073 },
      DFW: { lat: 32.8998, lon: -97.0403 },
      ATL: { lat: 33.6407, lon: -84.4277 },
      DEN: { lat: 39.8561, lon: -104.6737 },
      MIA: { lat: 25.7959, lon: -80.2870 },
      BOS: { lat: 42.3656, lon: -71.0096 },
      SEA: { lat: 47.4502, lon: -122.3088 },
      AMS: { lat: 52.3105, lon: 4.7683 },
      FRA: { lat: 50.0379, lon: 8.5622 },
      NRT: { lat: 35.7647, lon: 140.3864 },
      ICN: { lat: 37.4602, lon: 126.4407 },
      SYD: { lat: -33.9399, lon: 151.1753 },
    };

    const fromAirport = airports[from?.toUpperCase()];
    const toAirport = airports[to?.toUpperCase()];

    if (!fromAirport || !toAirport) {
      return 1000;
    }

    const R = 6371;
    const dLat = this.toRad(toAirport.lat - fromAirport.lat);
    const dLon = this.toRad(toAirport.lon - fromAirport.lon);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(fromAirport.lat)) *
        Math.cos(this.toRad(toAirport.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
