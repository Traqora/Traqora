import { Router, Request, Response } from "express";
import { requireAdmin, requireRole } from "../../middleware/adminAuth";
import { complianceService } from "../../services/governance/complianceService";
import { dataPrivacyService } from "../../services/governance/dataPrivacyService";
import { consentService } from "../../services/governance/consentService";
import { logger } from "../../utils/logger";

const router = Router();

/**
 * COMPLIANCE REPORT ROUTES
 */

/**
 * POST /api/governance/reports
 * Generate a new compliance report
 * Requires: admin role
 */
router.post(
  "/reports",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        reportName,
        reportType,
        reportContent,
        findings,
        recommendations,
        reportPeriodStart,
        reportPeriodEnd,
      } = req.body;

      if (!reportName || !reportType || !reportContent) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Missing required fields: reportName, reportType, reportContent",
          },
        });
        return;
      }

      const report = await complianceService.generateReport(
        {
          reportName,
          reportType,
          reportContent,
          findings,
          recommendations,
          reportPeriodStart: reportPeriodStart
            ? new Date(reportPeriodStart)
            : undefined,
          reportPeriodEnd: reportPeriodEnd
            ? new Date(reportPeriodEnd)
            : undefined,
        },
        req.admin!.email,
      );

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Error generating compliance report", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate compliance report",
        },
      });
    }
  },
);

/**
 * GET /api/governance/reports
 * Retrieve compliance reports with filtering
 * Requires: admin role
 */
router.get(
  "/reports",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        reportType,
        status,
        startDate,
        endDate,
        limit = "10",
        offset = "0",
      } = req.query;

      const result = await complianceService.getReports({
        reportType: reportType as any,
        status: status as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error fetching compliance reports", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch compliance reports",
        },
      });
    }
  },
);

/**
 * PUT /api/governance/reports/:reportId/approve
 * Approve a compliance report
 * Requires: admin role
 */
router.put(
  "/reports/:reportId/approve",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;
      const { notes } = req.body;

      const report = await complianceService.approveReport(
        reportId,
        req.admin!.email,
        notes,
      );

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Error approving compliance report", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to approve compliance report",
        },
      });
    }
  },
);

/**
 * GET /api/governance/reports/summary
 * Get compliance report summary
 * Requires: admin role
 */
router.get(
  "/reports/summary",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required fields: startDate, endDate",
          },
        });
        return;
      }

      const summary = await complianceService.getComplianceSummary(
        new Date(startDate as string),
        new Date(endDate as string),
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error("Error fetching compliance summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch compliance summary",
        },
      });
    }
  },
);

/**
 * DATA PRIVACY ROUTES
 */

/**
 * POST /api/governance/pia
 * Create a Privacy Impact Assessment
 * Requires: admin role
 */
router.post(
  "/pia",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pia = await dataPrivacyService.createPIA(
        req.body,
        req.admin!.email,
      );

      res.json({
        success: true,
        data: pia,
      });
    } catch (error) {
      logger.error("Error creating PIA", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create Privacy Impact Assessment",
        },
      });
    }
  },
);

/**
 * PUT /api/governance/pia/:piaId/approve
 * Approve a Privacy Impact Assessment
 * Requires: admin role
 */
router.put(
  "/pia/:piaId/approve",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { piaId } = req.params;

      const pia = await dataPrivacyService.approvePIA(piaId, req.admin!.email);

      res.json({
        success: true,
        data: pia,
      });
    } catch (error) {
      logger.error("Error approving PIA", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to approve Privacy Impact Assessment",
        },
      });
    }
  },
);

/**
 * GET /api/governance/classification
 * Get data classification guidelines
 * Requires: admin role
 */
router.get(
  "/classification",
  requireAdmin,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const guidelines = await dataPrivacyService.getClassificationGuidelines();

      res.json({
        success: true,
        data: guidelines,
      });
    } catch (error) {
      logger.error("Error fetching classification guidelines", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch data classification guidelines",
        },
      });
    }
  },
);

/**
 * POST /api/governance/access-policies
 * Create a data access policy
 * Requires: super_admin role
 */
router.post(
  "/access-policies",
  requireAdmin,
  requireRole("super_admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        policyName,
        description,
        dataClassification,
        requiredRoles,
        applicableFrameworks,
      } = req.body;

      const policy = await dataPrivacyService.createAccessPolicy(
        policyName,
        description,
        dataClassification,
        requiredRoles,
        applicableFrameworks,
        req.admin!.email,
      );

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      logger.error("Error creating access policy", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create data access policy",
        },
      });
    }
  },
);

/**
 * GET /api/governance/access-policies
 * Get active access policies
 * Requires: admin role
 */
router.get(
  "/access-policies",
  requireAdmin,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const policies = await dataPrivacyService.getAccessPolicies();

      res.json({
        success: true,
        data: policies,
      });
    } catch (error) {
      logger.error("Error fetching access policies", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch data access policies",
        },
      });
    }
  },
);

/**
 * CONSENT MANAGEMENT ROUTES
 */

/**
 * POST /api/governance/consent
 * Grant user consent
 * Requires: user authentication
 */
router.post("/consent", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      userWalletAddress,
      consentType,
      consentDetails,
      ipAddress,
      userAgent,
      expiresAt,
    } = req.body;

    if (!userWalletAddress || !consentType || !consentDetails) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Missing required fields: userWalletAddress, consentType, consentDetails",
        },
      });
      return;
    }

    const consent = await consentService.grantConsent({
      userWalletAddress,
      consentType,
      consentDetails,
      ipAddress,
      userAgent,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    res.json({
      success: true,
      data: consent,
    });
  } catch (error) {
    logger.error("Error granting consent", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to grant consent",
      },
    });
  }
});

/**
 * GET /api/governance/consent/:userWalletAddress
 * Get user's active consents
 * Requires: user authentication
 */
router.get(
  "/consent/:userWalletAddress",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userWalletAddress } = req.params;

      const consents = await consentService.getUserConsents(userWalletAddress);

      res.json({
        success: true,
        data: consents,
      });
    } catch (error) {
      logger.error("Error fetching user consents", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch user consents",
        },
      });
    }
  },
);

/**
 * DELETE /api/governance/consent/:consentId
 * Withdraw user consent
 * Requires: user authentication
 */
router.delete(
  "/consent/:consentId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { consentId } = req.params;
      const { reason } = req.body;

      const consent = await consentService.withdrawConsent(
        consentId,
        reason,
        "user_request",
      );

      res.json({
        success: true,
        data: consent,
      });
    } catch (error) {
      logger.error("Error withdrawing consent", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to withdraw consent",
        },
      });
    }
  },
);

/**
 * GET /api/governance/consent-stats/:consentType
 * Get consent statistics
 * Requires: admin role
 */
router.get(
  "/consent-stats/:consentType",
  requireAdmin,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { consentType } = req.params;

      const stats = await consentService.getConsentStatistics(
        consentType as any,
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Error fetching consent statistics", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch consent statistics",
        },
      });
    }
  },
);

export default router;
