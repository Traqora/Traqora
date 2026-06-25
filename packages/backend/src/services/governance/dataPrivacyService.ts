import { AppDataSource } from "../../db/dataSource";
import {
  DataPrivacyImpactAssessment,
  PIAStatus,
  RiskLevel,
} from "../../db/entities/DataPrivacyImpactAssessment";
import {
  DataClassificationLabel,
  ClassificationLevel,
  DataType,
} from "../../db/entities/DataClassificationLabel";
import { DataAccessPolicy } from "../../db/entities/DataAccessPolicy";
import { AdminAuditLog } from "../../db/entities/AdminAuditLog";
import { logger } from "../../utils/logger";

interface PIAInput {
  piaTitle: string;
  description: string;
  processDescription: string;
  personalDataTypes: string[];
  dataCategories: string[];
  justification: string;
  necessity: string;
  proportionality: string;
  overallRiskLevel: RiskLevel;
  riskAssessment?: {
    dataSecurityRisk?: RiskLevel;
    privacyViolationRisk?: RiskLevel;
    unauthorizedAccessRisk?: RiskLevel;
    dataBreachRisk?: RiskLevel;
  };
  mitigationMeasures?: {
    technicalMeasures?: string[];
    organizationalMeasures?: string[];
    legacyMeasures?: string[];
  };
  involvedThirdParties?: string[];
  requiresConsent: boolean;
  consentStrategy?: string;
}

export class DataPrivacyService {
  private piaRepository = AppDataSource.getRepository(
    DataPrivacyImpactAssessment,
  );
  private classificationRepository = AppDataSource.getRepository(
    DataClassificationLabel,
  );
  private policyRepository = AppDataSource.getRepository(DataAccessPolicy);
  private auditRepository = AppDataSource.getRepository(AdminAuditLog);

  /**
   * Create a new Privacy Impact Assessment
   */
  async createPIA(
    input: PIAInput,
    assessedByEmail: string,
  ): Promise<DataPrivacyImpactAssessment> {
    try {
      const pia = this.piaRepository.create({
        piaTitle: input.piaTitle,
        description: input.description,
        processDescription: input.processDescription,
        personalDataTypes: input.personalDataTypes,
        dataCategories: input.dataCategories,
        justification: input.justification,
        necessity: input.necessity,
        proportionality: input.proportionality,
        status: "draft",
        overallRiskLevel: input.overallRiskLevel,
        riskAssessment: input.riskAssessment,
        mitigationMeasures: input.mitigationMeasures,
        involvedThirdParties: input.involvedThirdParties,
        requiresConsent: input.requiresConsent,
        consentStrategy: input.consentStrategy,
        assessedBy: assessedByEmail,
      });

      await this.piaRepository.save(pia);

      await this.auditRepository.save({
        adminEmail: assessedByEmail,
        action: "pia_created",
        resource: "data_privacy_impact_assessment",
        resourceId: pia.id,
        details: JSON.stringify({
          piaTitle: pia.piaTitle,
          overallRiskLevel: pia.overallRiskLevel,
        }),
      });

      logger.info("Privacy Impact Assessment created", {
        piaId: pia.id,
        piaTitle: input.piaTitle,
        riskLevel: input.overallRiskLevel,
      });

      return pia;
    } catch (error) {
      logger.error("Error creating PIA", {
        error: error instanceof Error ? error.message : String(error),
        input,
      });
      throw error;
    }
  }

  /**
   * Approve a PIA
   */
  async approvePIA(
    piaId: string,
    approvedByEmail: string,
  ): Promise<DataPrivacyImpactAssessment> {
    try {
      const pia = await this.piaRepository.findOneBy({ id: piaId });

      if (!pia) {
        throw new Error(`PIA not found: ${piaId}`);
      }

      pia.status = "approved";
      pia.approvedBy = approvedByEmail;
      pia.approvedAt = new Date();

      await this.piaRepository.save(pia);

      await this.auditRepository.save({
        adminEmail: approvedByEmail,
        action: "pia_approved",
        resource: "data_privacy_impact_assessment",
        resourceId: pia.id,
        details: JSON.stringify({ piaTitle: pia.piaTitle }),
      });

      logger.info("PIA approved", { piaId, approvedBy: approvedByEmail });

      return pia;
    } catch (error) {
      logger.error("Error approving PIA", {
        error: error instanceof Error ? error.message : String(error),
        piaId,
      });
      throw error;
    }
  }

  /**
   * Create a data classification label
   */
  async createClassificationLabel(
    labelName: string,
    entityType: string,
    classificationLevel: ClassificationLevel,
    dataType: DataType,
    description: string,
    applicableFields: string[],
    requiresEncryption: boolean,
    requiresMasking: boolean,
    createdByEmail: string,
  ): Promise<DataClassificationLabel> {
    try {
      const label = this.classificationRepository.create({
        labelName,
        entityType,
        classificationLevel,
        dataType,
        description,
        applicableFields,
        requiresEncryption,
        requiresMasking,
        createdBy: createdByEmail,
      });

      await this.classificationRepository.save(label);

      await this.auditRepository.save({
        adminEmail: createdByEmail,
        action: "classification_label_created",
        resource: "data_classification_label",
        resourceId: label.id,
        details: JSON.stringify({ labelName, classificationLevel }),
      });

      logger.info("Classification label created", {
        labelId: label.id,
        labelName,
      });

      return label;
    } catch (error) {
      logger.error("Error creating classification label", {
        error: error instanceof Error ? error.message : String(error),
        labelName,
      });
      throw error;
    }
  }

  /**
   * Get data classification guidelines
   */
  async getClassificationGuidelines(): Promise<DataClassificationLabel[]> {
    try {
      return await this.classificationRepository.find({
        where: { isActive: true },
        order: { classificationLevel: "ASC" },
      });
    } catch (error) {
      logger.error("Error fetching classification guidelines", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a data access policy
   */
  async createAccessPolicy(
    policyName: string,
    description: string,
    dataClassification: ClassificationLevel,
    requiredRoles: string[],
    applicableFrameworks: string[],
    createdByEmail: string,
  ): Promise<DataAccessPolicy> {
    try {
      const policy = this.policyRepository.create({
        policyName,
        description,
        dataClassification,
        requiredRoles,
        applicableFrameworks: applicableFrameworks as any,
        createdBy: createdByEmail,
      });

      await this.policyRepository.save(policy);

      await this.auditRepository.save({
        adminEmail: createdByEmail,
        action: "access_policy_created",
        resource: "data_access_policy",
        resourceId: policy.id,
        details: JSON.stringify({ policyName, dataClassification }),
      });

      logger.info("Access policy created", { policyId: policy.id, policyName });

      return policy;
    } catch (error) {
      logger.error("Error creating access policy", {
        error: error instanceof Error ? error.message : String(error),
        policyName,
      });
      throw error;
    }
  }

  /**
   * Get active access policies
   */
  async getAccessPolicies(): Promise<DataAccessPolicy[]> {
    try {
      return await this.policyRepository.find({
        where: { isActive: true },
        order: { createdAt: "DESC" },
      });
    } catch (error) {
      logger.error("Error fetching access policies", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if user role has access to data classification
   */
  async hasAccessToData(
    userRole: string,
    dataClassification: ClassificationLevel,
  ): Promise<boolean> {
    try {
      const policy = await this.policyRepository.findOne({
        where: {
          dataClassification,
          isActive: true,
        },
      });

      if (!policy) {
        return false;
      }

      return policy.requiredRoles.includes(userRole);
    } catch (error) {
      logger.error("Error checking data access", {
        error: error instanceof Error ? error.message : String(error),
        userRole,
        dataClassification,
      });
      return false;
    }
  }
}

export const dataPrivacyService = new DataPrivacyService();
