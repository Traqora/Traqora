/**
 * Two-Factor Authentication Types
 */

export type TwoFAMethod = "totp" | "sms" | "email";
export type TwoFAStatus = "enabled" | "disabled" | "pending_confirmation";
export type RecoveryCodeStatus = "active" | "used" | "expired";

export interface TwoFASettings {
  id: string;
  userId: string;
  method: TwoFAMethod;
  status: TwoFAStatus;
  secret?: string; // Encrypted TOTP secret
  backupEmail?: string;
  backupPhone?: string;
  enabledAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecoveryCode {
  id: string;
  userId: string;
  code: string; // Hashed
  status: RecoveryCodeStatus;
  usedAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

export interface TwoFAChallenge {
  id: string;
  userId: string;
  method: TwoFAMethod;
  code?: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface DeviceFingerprint {
  id: string;
  userId: string;
  deviceId: string;
  userAgent: string;
  ipAddress: string;
  trusted: boolean;
  trustedAt?: Date;
  lastUsedAt: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface TwoFASetupSession {
  id: string;
  userId: string;
  method: TwoFAMethod;
  secret: string;
  qrCode?: string;
  backupCodes: string[];
  status: "pending" | "confirmed";
  expiresAt: Date;
  createdAt: Date;
}

export interface TwoFAVerificationRequest {
  userId: string;
  code: string;
  method: TwoFAMethod;
  deviceId?: string;
  rememberDevice?: boolean;
  recoveryCode?: boolean;
}

export interface TwoFAAuditLog {
  id: string;
  userId: string;
  action:
    | "setup"
    | "verify"
    | "disable"
    | "recovery_used"
    | "device_trusted"
    | "failed_attempt";
  method?: TwoFAMethod;
  status: "success" | "failure";
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface TwoFAStats {
  userId: string;
  enabled: boolean;
  method?: TwoFAMethod;
  enabledAt?: Date;
  lastVerification?: Date;
  totalVerifications: number;
  failedAttempts: number;
  recoveryCodesRemaining: number;
  trustedDevices: number;
}
