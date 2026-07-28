/**
 * Two-Factor Authentication Service
 * Handles TOTP, recovery codes, device fingerprinting, and 2FA verification
 */

import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { logger } from "../utils/logger";
import { BadRequestError, NotFoundError } from "../utils/errors";
import type {
  TwoFASettings,
  RecoveryCode,
  TwoFAChallenge,
  DeviceFingerprint,
  TwoFASetupSession,
  TwoFAVerificationRequest,
  TwoFAAuditLog,
  TwoFAStats,
  TwoFAMethod,
  TwoFAStatus,
} from "../types/twofa";

const RECOVERY_CODES_COUNT = 10;
const RECOVERY_CODE_LENGTH = 8;
const TOTP_WINDOW = 1; // Allow codes from 1 window before/after

export class TwoFAService {
  private settings: Map<string, TwoFASettings> = new Map();
  private recoveryCodes: Map<string, RecoveryCode[]> = new Map();
  private challenges: Map<string, TwoFAChallenge> = new Map();
  private deviceFingerprints: Map<string, DeviceFingerprint[]> = new Map();
  private setupSessions: Map<string, TwoFASetupSession> = new Map();
  private auditLogs: Map<string, TwoFAAuditLog[]> = new Map();

  /**
   * Generate TOTP secret for setup
   */
  generateTOTPSecret(
    userEmail: string,
    issuer: string = "Traqora",
  ): { secret: string; uri: string } {
    const secret = authenticator.generateSecret();
    const uri = authenticator.keyuri(userEmail, issuer, secret);

    return { secret, uri };
  }

  /**
   * Generate QR code for TOTP setup
   */
  async generateQRCode(uri: string): Promise<string> {
    try {
      return await QRCode.toDataURL(uri);
    } catch (error) {
      logger.error("Failed to generate QR code", { error });
      throw error;
    }
  }

  /**
   * Create 2FA setup session
   */
  async createSetupSession(
    userId: string,
    method: TwoFAMethod,
    userEmail: string,
  ): Promise<TwoFASetupSession> {
    const { secret, uri } = this.generateTOTPSecret(userEmail);
    const qrCode = await this.generateQRCode(uri);
    const backupCodes = this.generateBackupCodes(RECOVERY_CODES_COUNT);

    const session: TwoFASetupSession = {
      id: `setup-${Date.now()}-${Math.random()}`,
      userId,
      method,
      secret,
      qrCode,
      backupCodes,
      status: "pending",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      createdAt: new Date(),
    };

    this.setupSessions.set(session.id, session);

    logger.info("2FA setup session created", { userId, method });

    return session;
  }

  /**
   * Confirm 2FA setup with verification code
   */
  async confirmSetup(
    userId: string,
    sessionId: string,
    code: string,
  ): Promise<TwoFASettings> {
    const session = this.setupSessions.get(sessionId);

    if (!session || session.userId !== userId) {
      throw new BadRequestError("Invalid setup session");
    }

    if (session.expiresAt < new Date()) {
      throw new BadRequestError("Setup session expired");
    }

    // Verify TOTP code
    const isValid = authenticator.check(code, session.secret);

    if (!isValid) {
      await this.logAudit(
        userId,
        "setup",
        "failure",
        session.method,
        "Invalid TOTP code",
      );
      throw new BadRequestError("Invalid verification code");
    }

    // Create 2FA settings
    const settings: TwoFASettings = {
      id: `2fa-${Date.now()}-${Math.random()}`,
      userId,
      method: session.method,
      status: "enabled",
      secret: this.encrypt(session.secret),
      enabledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.settings.set(userId, settings);

    // Store recovery codes
    const codes: RecoveryCode[] = session.backupCodes.map((code) => ({
      id: `code-${Date.now()}-${Math.random()}`,
      userId,
      code: this.hashCode(code),
      status: "active",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    }));

    this.recoveryCodes.set(userId, codes);
    this.setupSessions.delete(sessionId);

    await this.logAudit(userId, "setup", "success", session.method);

    logger.info("2FA setup confirmed", { userId, method: session.method });

    return settings;
  }

  /**
   * Create 2FA verification challenge
   */
  async createChallenge(
    userId: string,
    method: TwoFAMethod,
    code?: string,
  ): Promise<TwoFAChallenge> {
    const challenge: TwoFAChallenge = {
      id: `challenge-${Date.now()}-${Math.random()}`,
      userId,
      method,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
    };

    this.challenges.set(challenge.id, challenge);

    return challenge;
  }

  /**
   * Verify 2FA code
   */
  async verify(request: TwoFAVerificationRequest): Promise<boolean> {
    const settings = this.settings.get(request.userId);

    if (!settings || settings.status !== "enabled") {
      throw new NotFoundError("2FA not enabled");
    }

    // Check if using recovery code
    if (request.recoveryCode) {
      return await this.verifyRecoveryCode(request.userId, request.code);
    }

    // Verify TOTP code
    const secret = this.decrypt(settings.secret!);
    const isValid = authenticator.check(request.code, secret, {
      window: TOTP_WINDOW,
    });

    if (!isValid) {
      await this.logAudit(
        request.userId,
        "verify",
        "failure",
        settings.method,
        "Invalid code",
      );
      return false;
    }

    // Update last used time
    settings.lastUsedAt = new Date();

    // Trust device if requested
    if (request.deviceId && request.rememberDevice) {
      await this.trustDevice(request.userId, request.deviceId);
    }

    await this.logAudit(request.userId, "verify", "success", settings.method);

    return true;
  }

  /**
   * Verify recovery code
   */
  private async verifyRecoveryCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const codes = this.recoveryCodes.get(userId) || [];
    const recoveryCode = codes.find(
      (c) => c.status === "active" && this.compareCode(code, c.code),
    );

    if (!recoveryCode) {
      await this.logAudit(
        userId,
        "recovery_used",
        "failure",
        undefined,
        "Invalid recovery code",
      );
      return false;
    }

    // Mark code as used
    recoveryCode.status = "used";
    recoveryCode.usedAt = new Date();

    await this.logAudit(userId, "recovery_used", "success");

    return true;
  }

  /**
   * Disable 2FA
   */
  async disable(userId: string, password?: string): Promise<void> {
    const settings = this.settings.get(userId);

    if (!settings) {
      throw new NotFoundError("2FA not enabled");
    }

    this.settings.delete(userId);
    this.recoveryCodes.delete(userId);

    await this.logAudit(userId, "disable", "success", settings.method);

    logger.info("2FA disabled", { userId });
  }

  /**
   * Get user 2FA statistics
   */
  async getStats(userId: string): Promise<TwoFAStats> {
    const settings = this.settings.get(userId);
    const codes = this.recoveryCodes.get(userId) || [];
    const devices = this.deviceFingerprints.get(userId) || [];
    const logs = this.auditLogs.get(userId) || [];

    return {
      userId,
      enabled: !!settings,
      method: settings?.method,
      enabledAt: settings?.enabledAt,
      lastVerification: settings?.lastUsedAt,
      totalVerifications: logs.filter(
        (l) => l.action === "verify" && l.status === "success",
      ).length,
      failedAttempts: logs.filter(
        (l) => l.action === "verify" && l.status === "failure",
      ).length,
      recoveryCodesRemaining: codes.filter((c) => c.status === "active").length,
      trustedDevices: devices.filter((d) => d.trusted).length,
    };
  }

  /**
   * Trust device
   */
  private async trustDevice(userId: string, deviceId: string): Promise<void> {
    let devices = this.deviceFingerprints.get(userId) || [];
    let fingerprint = devices.find((d) => d.deviceId === deviceId);

    if (!fingerprint) {
      fingerprint = {
        id: `device-${Date.now()}-${Math.random()}`,
        userId,
        deviceId,
        userAgent: "unknown",
        ipAddress: "unknown",
        trusted: true,
        trustedAt: new Date(),
        lastUsedAt: new Date(),
        createdAt: new Date(),
      };
      devices.push(fingerprint);
    } else {
      fingerprint.trusted = true;
      fingerprint.trustedAt = new Date();
      fingerprint.lastUsedAt = new Date();
    }

    this.deviceFingerprints.set(userId, devices);

    await this.logAudit(userId, "device_trusted", "success");
  }

  /**
   * Check if device is trusted
   */
  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    const devices = this.deviceFingerprints.get(userId) || [];
    const device = devices.find((d) => d.deviceId === deviceId && d.trusted);

    return !!device && (!device.expiresAt || device.expiresAt > new Date());
  }

  /**
   * Get recovery codes count
   */
  async getRecoveryCodesCount(userId: string): Promise<number> {
    const codes = this.recoveryCodes.get(userId) || [];
    return codes.filter((c) => c.status === "active").length;
  }

  /**
   * Regenerate recovery codes
   */
  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = this.generateBackupCodes(RECOVERY_CODES_COUNT);

    const newCodes: RecoveryCode[] = codes.map((code) => ({
      id: `code-${Date.now()}-${Math.random()}`,
      userId,
      code: this.hashCode(code),
      status: "active",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }));

    this.recoveryCodes.set(userId, newCodes);

    await this.logAudit(
      userId,
      "setup",
      "success",
      undefined,
      "Recovery codes regenerated",
    );

    return codes;
  }

  /**
   * Log audit event
   */
  private async logAudit(
    userId: string,
    action: string,
    status: "success" | "failure",
    method?: TwoFAMethod,
    reason?: string,
  ): Promise<void> {
    const log: TwoFAAuditLog = {
      id: `audit-${Date.now()}-${Math.random()}`,
      userId,
      action: action as any,
      method,
      status,
      reason,
      timestamp: new Date(),
    };

    const logs = this.auditLogs.get(userId) || [];
    logs.push(log);
    this.auditLogs.set(userId, logs);
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(
    userId: string,
    limit: number = 100,
  ): Promise<TwoFAAuditLog[]> {
    const logs = this.auditLogs.get(userId) || [];
    return logs.slice(-limit);
  }

  /**
   * Helper: Generate backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(
        crypto
          .randomBytes(RECOVERY_CODE_LENGTH / 2)
          .toString("hex")
          .toUpperCase(),
      );
    }
    return codes;
  }

  /**
   * Helper: Hash recovery code
   */
  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  /**
   * Helper: Compare recovery code
   */
  private compareCode(plainCode: string, hashedCode: string): boolean {
    const hash = crypto.createHash("sha256").update(plainCode).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedCode));
  }

  /**
   * Helper: Encrypt secret
   */
  private encrypt(secret: string): string {
    // In production, use proper encryption with a key
    return Buffer.from(secret).toString("base64");
  }

  /**
   * Helper: Decrypt secret
   */
  private decrypt(encrypted: string): string {
    return Buffer.from(encrypted, "base64").toString();
  }
}

export const twoFAService = new TwoFAService();
