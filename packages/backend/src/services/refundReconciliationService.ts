import { AppDataSource } from "../db/dataSource";
import { Refund } from "../db/entities/Refund";
import { stripe } from "./stripe";
import { getTransactionStatus } from "./soroban";
import { RefundAuditService } from "./refundAuditService";
import { logger } from "../utils/logger";

export type RefundReconciliationMismatchType =
  | "stripe_status_mismatch"
  | "soroban_status_mismatch"
  | "soroban_hash_missing"
  | "stripe_refund_missing"
  | "internal_state_inconsistent";

export type RefundReconciliationAction =
  | "none"
  | "investigate"
  | "retry_provider_check"
  | "escalate_ops"
  | "mark_manual_review";

export interface RefundReconciliationFinding {
  refundId: string;
  bookingId: string;
  status: string;
  stripeRefundId?: string | null;
  sorobanTxHash?: string | null;
  mismatches: Array<{
    type: RefundReconciliationMismatchType;
    detail: string;
    escalation: "low" | "medium" | "high";
    recommendedAction: RefundReconciliationAction;
  }>;
  providerState?: {
    stripe?: { id?: string; status?: string } | { error: string };
    soroban?: { status?: string; error?: string; txHash?: string } | { error: string };
  };
}

export interface ReconcileRefundsOptions {
  limit?: number;
  statuses?: string[];
  dryRun?: boolean;
}

export interface ReconcileRefundsResult {
  scanned: number;
  matched: number;
  mismatched: number;
  findings: RefundReconciliationFinding[];
  runId: string;
}

function escalationAction(escalation: "low" | "medium" | "high"): RefundReconciliationAction {
  if (escalation === "high") return "escalate_ops";
  if (escalation === "medium") return "investigate";
  return "retry_provider_check";
}

export class RefundReconciliationService {
  private static instance: RefundReconciliationService;
  private auditService = RefundAuditService.getInstance();

  public static getInstance(): RefundReconciliationService {
    if (!RefundReconciliationService.instance) {
      RefundReconciliationService.instance = new RefundReconciliationService();
    }
    return RefundReconciliationService.instance;
  }

  public async reconcile(options: ReconcileRefundsOptions = {}): Promise<ReconcileRefundsResult> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const statuses = options.statuses?.length
      ? options.statuses
      : ["processing", "stripe_refunded", "onchain_pending", "onchain_submitted", "failed", "manual_review"];
    const runId = `refund-reconcile-${Date.now()}`;
    const refundRepo = AppDataSource.getRepository(Refund);

    const refunds = await refundRepo
      .createQueryBuilder("refund")
      .leftJoinAndSelect("refund.booking", "booking")
      .where("refund.status IN (:...statuses)", { statuses })
      .orderBy("refund.updatedAt", "DESC")
      .take(limit)
      .getMany();

    const findings: RefundReconciliationFinding[] = [];

    for (const refund of refunds) {
      const finding = await this.reconcileOne(refund);
      if (finding.mismatches.length > 0) {
        findings.push(finding);
        if (!options.dryRun) {
          await this.auditService.logAction({
            refundId: refund.id,
            action: "refund_reconciliation_mismatch",
            actor: "system:reconciliation",
            previousStatus: refund.status,
            newStatus: refund.status,
            metadata: {
              runId,
              mismatches: finding.mismatches,
              providerState: finding.providerState,
              escalationCriteria: "Any high-severity mismatch requires escalation; medium requires investigation; low requires retry/check.",
            },
          });
        }
      }
    }

    logger.info("refund-reconciliation: completed", {
      runId,
      scanned: refunds.length,
      mismatched: findings.length,
      dryRun: Boolean(options.dryRun),
    });

    return {
      scanned: refunds.length,
      matched: refunds.length - findings.length,
      mismatched: findings.length,
      findings,
      runId,
    };
  }

  private async reconcileOne(refund: Refund): Promise<RefundReconciliationFinding> {
    const mismatches: RefundReconciliationFinding["mismatches"] = [];
    const providerState: RefundReconciliationFinding["providerState"] = {};

    // Stripe state comparison (if applicable)
    if (refund.stripeRefundId) {
      try {
        const stripeRefund = await stripe.refunds.retrieve(refund.stripeRefundId);
        providerState.stripe = { id: stripeRefund.id, status: stripeRefund.status ?? undefined };
        const stripeStatus = stripeRefund.status;
        if (stripeStatus === "failed" && refund.status !== "failed") {
          mismatches.push({
            type: "stripe_status_mismatch",
            detail: `Stripe refund is failed but internal status is ${refund.status}`,
            escalation: "high",
            recommendedAction: escalationAction("high"),
          });
        } else if (stripeStatus === "succeeded" && ["pending", "processing", "approved", "manual_review"].includes(refund.status)) {
          mismatches.push({
            type: "stripe_status_mismatch",
            detail: `Stripe refund succeeded but internal status is ${refund.status}`,
            escalation: "medium",
            recommendedAction: escalationAction("medium"),
          });
        } else if (stripeStatus === "canceled" && refund.status !== "failed" && refund.status !== "rejected") {
          mismatches.push({
            type: "stripe_status_mismatch",
            detail: `Stripe refund canceled but internal status is ${refund.status}`,
            escalation: "high",
            recommendedAction: escalationAction("high"),
          });
        }
      } catch (error: any) {
        providerState.stripe = { error: error?.message || String(error) };
        mismatches.push({
          type: "stripe_refund_missing",
          detail: `Unable to retrieve Stripe refund ${refund.stripeRefundId}: ${error?.message || "unknown error"}`,
          escalation: "high",
          recommendedAction: escalationAction("high"),
        });
      }
    } else if (["processing", "stripe_refunded"].includes(refund.status) && (refund.approvedAmountCents ?? 0) > 0) {
      mismatches.push({
        type: "stripe_refund_missing",
        detail: `Internal status ${refund.status} expects Stripe refund state but stripeRefundId is missing`,
        escalation: "high",
        recommendedAction: escalationAction("high"),
      });
    }

    // Soroban/on-chain state comparison (if applicable)
    if (refund.sorobanTxHash) {
      try {
        const tx = await getTransactionStatus(refund.sorobanTxHash);
        providerState.soroban = { status: tx.status, error: tx.error, txHash: tx.txHash };
        if (tx.status === "failed" && refund.status !== "failed") {
          mismatches.push({
            type: "soroban_status_mismatch",
            detail: `Soroban transaction failed but internal status is ${refund.status}`,
            escalation: "high",
            recommendedAction: escalationAction("high"),
          });
        } else if (tx.status === "success" && refund.status !== "completed") {
          mismatches.push({
            type: "soroban_status_mismatch",
            detail: `Soroban transaction succeeded but internal status is ${refund.status}`,
            escalation: "medium",
            recommendedAction: escalationAction("medium"),
          });
        } else if (tx.status === "not_found" && ["onchain_submitted", "completed"].includes(refund.status)) {
          mismatches.push({
            type: "soroban_status_mismatch",
            detail: `Soroban transaction not found but internal status is ${refund.status}`,
            escalation: "medium",
            recommendedAction: escalationAction("medium"),
          });
        }
      } catch (error: any) {
        providerState.soroban = { error: error?.message || String(error) };
        mismatches.push({
          type: "soroban_status_mismatch",
          detail: `Unable to retrieve Soroban transaction ${refund.sorobanTxHash}: ${error?.message || "unknown error"}`,
          escalation: "medium",
          recommendedAction: escalationAction("medium"),
        });
      }
    } else if (["onchain_pending", "onchain_submitted", "completed"].includes(refund.status)) {
      mismatches.push({
        type: "soroban_hash_missing",
        detail: `Internal status ${refund.status} expects Soroban transaction state but sorobanTxHash is missing`,
        escalation: "high",
        recommendedAction: escalationAction("high"),
      });
    }

    // Internal consistency checks
    if (refund.status === "completed" && (refund.approvedAmountCents ?? 0) <= 0) {
      mismatches.push({
        type: "internal_state_inconsistent",
        detail: "Refund marked completed without approved amount",
        escalation: "high",
        recommendedAction: escalationAction("high"),
      });
    }

    return {
      refundId: refund.id,
      bookingId: (refund.booking as any)?.id ?? (refund as any).booking?.id,
      status: refund.status,
      stripeRefundId: refund.stripeRefundId,
      sorobanTxHash: refund.sorobanTxHash,
      mismatches,
      providerState,
    };
  }

  public async recordOperatorAction(params: {
    refundId: string;
    action: "investigated" | "escalated" | "resolved";
    actor: string;
    notes: string;
    nextAction?: string;
  }): Promise<void> {
    const refund = await AppDataSource.getRepository(Refund).findOne({ where: { id: params.refundId } });
    if (!refund) {
      throw new Error("Refund not found");
    }
    await this.auditService.logAction({
      refundId: params.refundId,
      action:
        params.action === "escalated"
          ? "refund_reconciliation_escalated"
          : params.action === "resolved"
            ? "refund_reconciliation_resolved"
            : "refund_reconciliation_investigated",
      actor: params.actor,
      previousStatus: refund.status,
      newStatus: refund.status,
      metadata: {
        notes: params.notes,
        nextAction: params.nextAction ?? null,
        escalationCriteria:
          "Escalate when provider/internal states conflict in a way that risks incorrect funds movement or customer-facing status; resolve only after evidence-backed reconciliation.",
      },
    });
  }
}

export const refundReconciliationService = RefundReconciliationService.getInstance();
