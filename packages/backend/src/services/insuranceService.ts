import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../db/dataSource';
import {
  InsurancePolicy,
  InsuranceCoverageType,
  InsuranceCoverageDetails,
} from '../db/entities/InsurancePolicy';
import { InsuranceClaim, InsuranceClaimEventType } from '../db/entities/InsuranceClaim';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/errors';

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

// Destinations with elevated medical/travel risk carry a higher base rate.
const HIGH_RISK_DESTINATIONS = new Set(['LOS', 'CAI', 'JNB', 'MNL', 'BGI', 'PTY']);

const COVERAGE_TIERS: Record<
  InsuranceCoverageType,
  { rate: number; medical: number; baggage: number; cancellation: number }
> = {
  basic: { rate: 0.03, medical: 20000, baggage: 500, cancellation: 100 },
  standard: { rate: 0.05, medical: 50000, baggage: 1500, cancellation: 100 },
  premium: { rate: 0.08, medical: 150000, baggage: 3000, cancellation: 100 },
};

export interface PremiumQuote {
  coverageType: InsuranceCoverageType;
  premiumCents: number;
  coverageDetails: InsuranceCoverageDetails;
}

export interface ProviderPurchaseResult {
  providerPolicyRef: string;
  provider: string;
}

/**
 * Stand-in for a real third-party insurance provider API (e.g. Allianz, Battleface).
 * No live vendor credentials exist yet, so purchases are simulated but follow the
 * same async request/response shape a real integration would use.
 */
class MockInsuranceProviderClient {
  private readonly providerName = 'mock-global-shield';

  async issuePolicy(params: {
    destination: string;
    tripCostCents: number;
    coverageType: InsuranceCoverageType;
  }): Promise<ProviderPurchaseResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      providerPolicyRef: `MGS-${params.destination}-${uuidv4().slice(0, 8).toUpperCase()}`,
      provider: this.providerName,
    };
  }
}

export class InsuranceService {
  private static instance: InsuranceService;
  private policyRepo = AppDataSource.getRepository(InsurancePolicy);
  private claimRepo = AppDataSource.getRepository(InsuranceClaim);
  private providerClient = new MockInsuranceProviderClient();

  static getInstance(): InsuranceService {
    if (!InsuranceService.instance) {
      InsuranceService.instance = new InsuranceService();
    }
    return InsuranceService.instance;
  }

  calculatePremium(
    tripCostCents: number,
    destination: string,
    coverageType: InsuranceCoverageType = 'standard',
  ): PremiumQuote {
    const tier = COVERAGE_TIERS[coverageType];
    if (!tier) throw new BadRequestError(`Unknown coverage type: ${coverageType}`);

    const riskMultiplier = HIGH_RISK_DESTINATIONS.has(destination.toUpperCase()) ? 1.35 : 1;
    const premiumCents = Math.round(tripCostCents * tier.rate * riskMultiplier);

    return {
      coverageType,
      premiumCents,
      coverageDetails: {
        medicalCents: tier.medical * 100,
        baggageCents: tier.baggage * 100,
        tripCancellationCents: Math.round(tripCostCents * (tier.cancellation / 100)),
      },
    };
  }

  async purchasePolicy(params: {
    bookingId: string;
    destination: string;
    tripCostCents: number;
    coverageType: InsuranceCoverageType;
  }): Promise<InsurancePolicy> {
    const quote = this.calculatePremium(params.tripCostCents, params.destination, params.coverageType);

    const providerResult = await this.providerClient.issuePolicy({
      destination: params.destination,
      tripCostCents: params.tripCostCents,
      coverageType: params.coverageType,
    });

    const now = new Date();
    const policy = this.policyRepo.create({
      bookingId: params.bookingId,
      destination: params.destination.toUpperCase(),
      tripCostCents: params.tripCostCents,
      coverageType: params.coverageType,
      premiumCents: quote.premiumCents,
      currency: 'USD',
      status: 'active',
      provider: providerResult.provider,
      providerPolicyRef: providerResult.providerPolicyRef,
      coverageDetailsJson: JSON.stringify(quote.coverageDetails),
      refundEligibleUntil: new Date(now.getTime() + REFUND_WINDOW_MS),
    });

    const saved = await this.policyRepo.save(policy);
    logger.info('Insurance policy purchased', { policyId: saved.id, bookingId: params.bookingId });
    return saved;
  }

  async getPolicy(id: string): Promise<InsurancePolicy | null> {
    return this.policyRepo.findOne({ where: { id } });
  }

  async getPolicyByBooking(bookingId: string): Promise<InsurancePolicy | null> {
    return this.policyRepo.findOne({ where: { bookingId }, order: { purchasedAt: 'DESC' } });
  }

  async requestRefund(id: string): Promise<InsurancePolicy> {
    const policy = await this.policyRepo.findOne({ where: { id } });
    if (!policy) throw new NotFoundError('Insurance policy not found');
    if (policy.status !== 'active') {
      throw new BadRequestError(`Policy is not active (status: ${policy.status})`);
    }
    if (new Date() > new Date(policy.refundEligibleUntil)) {
      throw new BadRequestError('Refund window (24 hours from purchase) has expired');
    }

    policy.status = 'refunded';
    return this.policyRepo.save(policy);
  }

  async submitClaim(params: {
    policyId: string;
    eventType: InsuranceClaimEventType;
    description: string;
    amountRequestedCents: number;
    contactEmail?: string;
  }): Promise<InsuranceClaim> {
    const policy = await this.policyRepo.findOne({ where: { id: params.policyId } });
    if (!policy) throw new NotFoundError('Insurance policy not found');
    if (policy.status !== 'active') {
      throw new BadRequestError(`Cannot file a claim against a ${policy.status} policy`);
    }

    const claim = this.claimRepo.create({
      policyId: params.policyId,
      eventType: params.eventType,
      description: params.description,
      amountRequestedCents: params.amountRequestedCents,
      contactEmail: params.contactEmail,
      status: 'submitted',
    });

    return this.claimRepo.save(claim);
  }

  async getClaimsForPolicy(policyId: string): Promise<InsuranceClaim[]> {
    return this.claimRepo.find({ where: { policyId }, order: { submittedAt: 'DESC' } });
  }

  async generatePolicyPdf(policy: InsurancePolicy): Promise<Buffer> {
    const coverage = JSON.parse(policy.coverageDetailsJson) as InsuranceCoverageDetails;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Travel Insurance Policy', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).fillColor('#666').text(`Provider: ${policy.provider}`, { align: 'center' });
      doc.moveDown(2);

      doc.fillColor('#000').fontSize(12);
      doc.text(`Policy Reference: ${policy.providerPolicyRef}`);
      doc.text(`Booking ID: ${policy.bookingId}`);
      doc.text(`Destination: ${policy.destination}`);
      doc.text(`Coverage Type: ${policy.coverageType}`);
      doc.text(`Status: ${policy.status}`);
      doc.text(`Premium: $${(policy.premiumCents / 100).toFixed(2)} ${policy.currency}`);
      doc.text(`Purchased At: ${policy.purchasedAt.toISOString()}`);
      doc.text(`Refund Eligible Until: ${policy.refundEligibleUntil.toISOString()}`);
      doc.moveDown();

      doc.fontSize(14).text('Coverage Details', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Medical Coverage: $${(coverage.medicalCents / 100).toFixed(2)}`);
      doc.text(`Baggage Coverage: $${(coverage.baggageCents / 100).toFixed(2)}`);
      doc.text(`Trip Cancellation Coverage: $${(coverage.tripCancellationCents / 100).toFixed(2)}`);
      doc.moveDown(2);

      doc
        .fontSize(9)
        .fillColor('#999')
        .text(
          'This is a summary document generated at purchase time. Claims must be filed within the policy coverage period.',
        );

      doc.end();
    });
  }
}
