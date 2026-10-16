/**
 * Client-side 2FA types
 */

export type TwoFAMethod = "totp" | "sms" | "email";
export type TwoFAStatus = "enabled" | "disabled" | "pending_confirmation";

export interface TwoFASettings {
  id: string;
  userId: string;
  method: TwoFAMethod;
  status: TwoFAStatus;
  enabledAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  timestamp: Date;
}
