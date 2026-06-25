import { AppDataSource } from "../../db/dataSource";
import {
  ConsentRecord,
  ConsentType,
  ConsentStatus,
} from "../../db/entities/ConsentRecord";
import { AdminAuditLog } from "../../db/entities/AdminAuditLog";
import { logger } from "../../utils/logger";
import crypto from "crypto";

interface ConsentRequestInput {
  userWalletAddress: string;
  consentType: ConsentType;
  consentDetails: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt?: Date;
}

interface ConsentQuery {
  userWalletAddress?: string;
  consentType?: ConsentType;
  status?: ConsentStatus;
  limit?: number;
  offset?: number;
}

export class ConsentService {
  private consentRepository = AppDataSource.getRepository(ConsentRecord);
  private auditRepository = AppDataSource.getRepository(AdminAuditLog);

  /**
   * Create a new consent request or update existing one
   */
  async grantConsent(input: ConsentRequestInput): Promise<ConsentRecord> {
    try {
      // Check if consent already exists
      const existingConsent = await this.consentRepository.findOne({
        where: {
          userWalletAddress: input.userWalletAddress,
          consentType: input.consentType,
        },
        order: { createdAt: "DESC" },
      });

      const consent =
        existingConsent ||
        this.consentRepository.create({
          userWalletAddress: input.userWalletAddress,
          consentType: input.consentType,
        });

      consent.status = "granted";
      consent.consentDetails = input.consentDetails;
      consent.ipAddress = input.ipAddress;
      consent.userAgent = input.userAgent;
      consent.expiresAt = input.expiresAt;
      consent.isVerified = true;

      await this.consentRepository.save(consent);

      await this.auditRepository.save({
        adminEmail: "system",
        action: "user_consent_granted",
        resource: "consent_record",
        resourceId: consent.id,
        details: JSON.stringify({
          userWalletAddress: input.userWalletAddress,
          consentType: input.consentType,
        }),
      });

      logger.info("User consent granted", {
        consentId: consent.id,
        userWalletAddress: input.userWalletAddress,
        consentType: input.consentType,
      });

      return consent;
    } catch (error) {
      logger.error("Error granting consent", {
        error: error instanceof Error ? error.message : String(error),
        input,
      });
      throw error;
    }
  }

  /**
   * Withdraw user consent
   */
  async withdrawConsent(
    consentId: string,
    reason?: string,
    withdrawnByEmail?: string,
  ): Promise<ConsentRecord> {
    try {
      const consent = await this.consentRepository.findOneBy({ id: consentId });

      if (!consent) {
        throw new Error(`Consent record not found: ${consentId}`);
      }

      const previousStatus = consent.status;
      consent.status = "withdrawn";
      consent.withdrawalReason = reason;
      consent.withdrawnAt = new Date();
      consent.withdrawnBy = withdrawnByEmail || "user_request";

      await this.consentRepository.save(consent);

      await this.auditRepository.save({
        adminEmail: withdrawnByEmail || "system",
        action: "user_consent_withdrawn",
        resource: "consent_record",
        resourceId: consent.id,
        details: JSON.stringify({
          previousStatus,
          reason,
        }),
      });

      logger.info("User consent withdrawn", {
        consentId,
        consentType: consent.consentType,
        reason,
      });

      return consent;
    } catch (error) {
      logger.error("Error withdrawing consent", {
        error: error instanceof Error ? error.message : String(error),
        consentId,
      });
      throw error;
    }
  }

  /**
   * Get user's active consents
   */
  async getUserConsents(userWalletAddress: string): Promise<ConsentRecord[]> {
    try {
      const consents = await this.consentRepository.find({
        where: {
          userWalletAddress,
          status: "granted",
        },
        order: { createdAt: "DESC" },
      });

      return consents;
    } catch (error) {
      logger.error("Error fetching user consents", {
        error: error instanceof Error ? error.message : String(error),
        userWalletAddress,
      });
      throw error;
    }
  }

  /**
   * Query consent records with filtering
   */
  async queryConsents(query: ConsentQuery): Promise<{
    records: ConsentRecord[];
    total: number;
  }> {
    try {
      const builder = this.consentRepository.createQueryBuilder("consent");

      if (query.userWalletAddress) {
        builder.andWhere("consent.userWalletAddress = :userWalletAddress", {
          userWalletAddress: query.userWalletAddress,
        });
      }

      if (query.consentType) {
        builder.andWhere("consent.consentType = :consentType", {
          consentType: query.consentType,
        });
      }

      if (query.status) {
        builder.andWhere("consent.status = :status", { status: query.status });
      }

      const total = await builder.getCount();

      builder.orderBy("consent.createdAt", "DESC");

      if (query.limit) {
        builder.limit(query.limit);
      }
      if (query.offset) {
        builder.offset(query.offset);
      }

      const records = await builder.getMany();

      return { records, total };
    } catch (error) {
      logger.error("Error querying consent records", {
        error: error instanceof Error ? error.message : String(error),
        query,
      });
      throw error;
    }
  }

  /**
   * Get consent statistics
   */
  async getConsentStatistics(consentType: ConsentType): Promise<{
    totalRequested: number;
    granted: number;
    withdrawn: number;
    pending: number;
    grantRate: number;
  }> {
    try {
      const builder = this.consentRepository
        .createQueryBuilder("consent")
        .where("consent.consentType = :consentType", { consentType });

      const records = await builder.getMany();
      const total = records.length;

      const granted = records.filter((r) => r.status === "granted").length;
      const withdrawn = records.filter((r) => r.status === "withdrawn").length;
      const pending = records.filter((r) => r.status === "pending").length;

      const grantRate = total > 0 ? (granted / total) * 100 : 0;

      return {
        totalRequested: total,
        granted,
        withdrawn,
        pending,
        grantRate: Math.round(grantRate * 100) / 100,
      };
    } catch (error) {
      logger.error("Error calculating consent statistics", {
        error: error instanceof Error ? error.message : String(error),
        consentType,
      });
      throw error;
    }
  }
}

export const consentService = new ConsentService();
