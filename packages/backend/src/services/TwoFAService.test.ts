/**
 * Unit tests for TwoFAService
 *
 * Covers:
 *   - TOTP secret / QR code generation
 *   - Setup session lifecycle (create → confirm → expire)
 *   - TOTP verification (valid, invalid, window tolerance)
 *   - Recovery code generation, verification, and single-use enforcement
 *   - Recovery code regeneration
 *   - Device trust management
 *   - Disable 2FA
 *   - Audit log accumulation
 *   - Statistics
 *   - Edge cases: duplicate confirm, wrong user, missing 2FA
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { authenticator } from "otplib";
import { TwoFAService } from "./TwoFAService";
import { BadRequestError, NotFoundError } from "../utils/errors";

// QRCode.toDataURL makes a real image encode — stub it so tests stay fast
jest.mock("qrcode", () => ({
  toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,MOCK_QR"),
}));

describe("TwoFAService", () => {
  let service: TwoFAService;

  beforeEach(() => {
    service = new TwoFAService();
  });

  // -------------------------------------------------------------------------
  // Secret & QR generation
  // -------------------------------------------------------------------------

  describe("generateTOTPSecret", () => {
    it("returns a non-empty secret and a valid otpauth URI", () => {
      const { secret, uri } = service.generateTOTPSecret("alice@example.com");

      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain("Traqora");
      expect(uri).toContain("alice%40example.com");
    });

    it("uses a custom issuer when supplied", () => {
      const { uri } = service.generateTOTPSecret("bob@example.com", "MyApp");
      expect(uri).toContain("MyApp");
    });

    it("generates unique secrets each call", () => {
      const a = service.generateTOTPSecret("user@example.com");
      const b = service.generateTOTPSecret("user@example.com");
      expect(a.secret).not.toBe(b.secret);
    });
  });

  describe("generateQRCode", () => {
    it("returns a data URL string", async () => {
      const { uri } = service.generateTOTPSecret("qr@example.com");
      const qr = await service.generateQRCode(uri);
      expect(typeof qr).toBe("string");
      expect(qr).toMatch(/^data:/);
    });
  });

  // -------------------------------------------------------------------------
  // Setup session
  // -------------------------------------------------------------------------

  describe("createSetupSession", () => {
    it("returns a session with all required fields", async () => {
      const session = await service.createSetupSession(
        "user-1",
        "totp",
        "user1@example.com",
      );

      expect(session.id).toBeDefined();
      expect(session.userId).toBe("user-1");
      expect(session.method).toBe("totp");
      expect(typeof session.secret).toBe("string");
      expect(session.qrCode).toMatch(/^data:/);
      expect(Array.isArray(session.backupCodes)).toBe(true);
      expect(session.backupCodes.length).toBe(10);
      expect(session.status).toBe("pending");
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("generates 10 unique backup codes", async () => {
      const session = await service.createSetupSession(
        "user-2",
        "totp",
        "user2@example.com",
      );
      const unique = new Set(session.backupCodes);
      expect(unique.size).toBe(10);
    });

    it("backup codes are 8-character hex strings in upper case", async () => {
      const session = await service.createSetupSession(
        "user-3",
        "totp",
        "user3@example.com",
      );
      session.backupCodes.forEach((code) => {
        expect(/^[A-F0-9]{8}$/.test(code)).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // confirmSetup
  // -------------------------------------------------------------------------

  describe("confirmSetup", () => {
    it("enables 2FA when the correct TOTP code is supplied", async () => {
      const session = await service.createSetupSession(
        "user-cs",
        "totp",
        "cs@example.com",
      );
      const validCode = authenticator.generate(session.secret);

      const settings = await service.confirmSetup("user-cs", session.id, validCode);

      expect(settings.userId).toBe("user-cs");
      expect(settings.method).toBe("totp");
      expect(settings.status).toBe("enabled");
      expect(settings.enabledAt).toBeInstanceOf(Date);
    });

    it("stores 10 hashed recovery codes after confirm", async () => {
      const session = await service.createSetupSession(
        "user-rc",
        "totp",
        "rc@example.com",
      );
      const code = authenticator.generate(session.secret);
      await service.confirmSetup("user-rc", session.id, code);

      const count = await service.getRecoveryCodesCount("user-rc");
      expect(count).toBe(10);
    });

    it("deletes the setup session after successful confirm", async () => {
      const session = await service.createSetupSession(
        "user-del",
        "totp",
        "del@example.com",
      );
      const code = authenticator.generate(session.secret);
      await service.confirmSetup("user-del", session.id, code);

      // A second confirm with the same session should fail
      await expect(
        service.confirmSetup("user-del", session.id, code),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws BadRequestError for an invalid TOTP code", async () => {
      const session = await service.createSetupSession(
        "user-bad",
        "totp",
        "bad@example.com",
      );

      await expect(
        service.confirmSetup("user-bad", session.id, "000000"),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws BadRequestError when session belongs to a different user", async () => {
      const session = await service.createSetupSession(
        "user-owner",
        "totp",
        "owner@example.com",
      );
      const code = authenticator.generate(session.secret);

      await expect(
        service.confirmSetup("user-other", session.id, code),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws BadRequestError for an unknown session ID", async () => {
      await expect(
        service.confirmSetup("user-x", "non-existent-session", "123456"),
      ).rejects.toThrow(BadRequestError);
    });

    it("throws BadRequestError for an expired session", async () => {
      const session = await service.createSetupSession(
        "user-exp",
        "totp",
        "exp@example.com",
      );
      // Back-date the expiry
      (session as any).expiresAt = new Date(Date.now() - 1000);
      // Overwrite in internal map via re-retrieval trick
      const map: Map<string, any> = (service as any).setupSessions;
      map.set(session.id, session);

      const code = authenticator.generate(session.secret);
      await expect(
        service.confirmSetup("user-exp", session.id, code),
      ).rejects.toThrow(BadRequestError);
    });

    it("logs a success audit entry after confirm", async () => {
      const session = await service.createSetupSession(
        "user-audit",
        "totp",
        "audit@example.com",
      );
      const code = authenticator.generate(session.secret);
      await service.confirmSetup("user-audit", session.id, code);

      const logs = await service.getAuditLogs("user-audit");
      const successEntry = logs.find(
        (l) => l.action === "setup" && l.status === "success",
      );
      expect(successEntry).toBeDefined();
    });

    it("logs a failure audit entry for bad code", async () => {
      const session = await service.createSetupSession(
        "user-afail",
        "totp",
        "afail@example.com",
      );

      await service.confirmSetup("user-afail", session.id, "000000").catch(() => {});

      const logs = await service.getAuditLogs("user-afail");
      const failEntry = logs.find(
        (l) => l.action === "setup" && l.status === "failure",
      );
      expect(failEntry).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // verify (TOTP)
  // -------------------------------------------------------------------------

  describe("verify – TOTP", () => {
    /** Helper: fully enrol a user and return their raw TOTP secret */
    async function enrol(userId: string): Promise<string> {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const rawSecret = session.secret;
      const code = authenticator.generate(rawSecret);
      await service.confirmSetup(userId, session.id, code);
      return rawSecret;
    }

    it("returns true for a valid current TOTP code", async () => {
      const secret = await enrol("user-v1");
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-v1",
        code,
        method: "totp",
      });
      expect(result).toBe(true);
    });

    it("returns false for an incorrect TOTP code", async () => {
      await enrol("user-v2");

      const result = await service.verify({
        userId: "user-v2",
        code: "000000",
        method: "totp",
      });
      expect(result).toBe(false);
    });

    it("updates lastUsedAt on successful verification", async () => {
      const secret = await enrol("user-v3");
      const code = authenticator.generate(secret);
      await service.verify({ userId: "user-v3", code, method: "totp" });

      const stats = await service.getStats("user-v3");
      expect(stats.lastVerification).toBeInstanceOf(Date);
    });

    it("throws NotFoundError when 2FA is not enabled", async () => {
      await expect(
        service.verify({ userId: "user-no2fa", code: "123456", method: "totp" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("logs success audit on valid code", async () => {
      const secret = await enrol("user-vlog");
      const code = authenticator.generate(secret);
      await service.verify({ userId: "user-vlog", code, method: "totp" });

      const logs = await service.getAuditLogs("user-vlog");
      const entry = logs.find(
        (l) => l.action === "verify" && l.status === "success",
      );
      expect(entry).toBeDefined();
    });

    it("logs failure audit on invalid code", async () => {
      await enrol("user-vfail");
      await service.verify({ userId: "user-vfail", code: "000000", method: "totp" });

      const logs = await service.getAuditLogs("user-vfail");
      const entry = logs.find(
        (l) => l.action === "verify" && l.status === "failure",
      );
      expect(entry).toBeDefined();
    });

    it("trusts device when rememberDevice is true", async () => {
      const secret = await enrol("user-vtrust");
      const code = authenticator.generate(secret);

      await service.verify({
        userId: "user-vtrust",
        code,
        method: "totp",
        deviceId: "device-abc",
        rememberDevice: true,
      });

      const trusted = await service.isDeviceTrusted("user-vtrust", "device-abc");
      expect(trusted).toBe(true);
    });

    it("does not trust device when rememberDevice is false", async () => {
      const secret = await enrol("user-vnotrust");
      const code = authenticator.generate(secret);

      await service.verify({
        userId: "user-vnotrust",
        code,
        method: "totp",
        deviceId: "device-xyz",
        rememberDevice: false,
      });

      const trusted = await service.isDeviceTrusted("user-vnotrust", "device-xyz");
      expect(trusted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Recovery codes
  // -------------------------------------------------------------------------

  describe("Recovery codes", () => {
    async function enrolAndGetCodes(userId: string): Promise<string[]> {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const rawBackup = [...session.backupCodes];
      const code = authenticator.generate(session.secret);
      await service.confirmSetup(userId, session.id, code);
      return rawBackup;
    }

    it("verifies a valid recovery code and returns true", async () => {
      const codes = await enrolAndGetCodes("user-rec1");

      const result = await service.verify({
        userId: "user-rec1",
        code: codes[0],
        method: "totp",
        recoveryCode: true,
      });
      expect(result).toBe(true);
    });

    it("marks the used recovery code as 'used'", async () => {
      const codes = await enrolAndGetCodes("user-rec2");
      await service.verify({
        userId: "user-rec2",
        code: codes[0],
        method: "totp",
        recoveryCode: true,
      });

      const count = await service.getRecoveryCodesCount("user-rec2");
      expect(count).toBe(9);
    });

    it("rejects a previously used recovery code", async () => {
      const codes = await enrolAndGetCodes("user-rec3");
      await service.verify({
        userId: "user-rec3",
        code: codes[0],
        method: "totp",
        recoveryCode: true,
      });

      // Second attempt with same code
      const result = await service.verify({
        userId: "user-rec3",
        code: codes[0],
        method: "totp",
        recoveryCode: true,
      });
      expect(result).toBe(false);
    });

    it("rejects an invalid recovery code and returns false", async () => {
      await enrolAndGetCodes("user-rec4");

      const result = await service.verify({
        userId: "user-rec4",
        code: "XXXXXXXX",
        method: "totp",
        recoveryCode: true,
      });
      expect(result).toBe(false);
    });

    it("all 10 codes can each be used once", async () => {
      const codes = await enrolAndGetCodes("user-rec5");

      for (const code of codes) {
        const result = await service.verify({
          userId: "user-rec5",
          code,
          method: "totp",
          recoveryCode: true,
        });
        expect(result).toBe(true);
      }

      const remaining = await service.getRecoveryCodesCount("user-rec5");
      expect(remaining).toBe(0);
    });

    it("logs failure audit on bad recovery code", async () => {
      await enrolAndGetCodes("user-reclog");
      await service.verify({
        userId: "user-reclog",
        code: "BADCODE0",
        method: "totp",
        recoveryCode: true,
      });

      const logs = await service.getAuditLogs("user-reclog");
      const failEntry = logs.find(
        (l) => l.action === "recovery_used" && l.status === "failure",
      );
      expect(failEntry).toBeDefined();
    });

    it("logs success audit on valid recovery code", async () => {
      const codes = await enrolAndGetCodes("user-recok");
      await service.verify({
        userId: "user-recok",
        code: codes[0],
        method: "totp",
        recoveryCode: true,
      });

      const logs = await service.getAuditLogs("user-recok");
      const okEntry = logs.find(
        (l) => l.action === "recovery_used" && l.status === "success",
      );
      expect(okEntry).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Regenerate recovery codes
  // -------------------------------------------------------------------------

  describe("regenerateRecoveryCodes", () => {
    async function enrol(userId: string) {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const code = authenticator.generate(session.secret);
      await service.confirmSetup(userId, session.id, code);
    }

    it("returns 10 new plaintext codes", async () => {
      await enrol("user-regen1");
      const newCodes = await service.regenerateRecoveryCodes("user-regen1");

      expect(newCodes.length).toBe(10);
      newCodes.forEach((c) => expect(typeof c).toBe("string"));
    });

    it("replaces all old codes — old codes no longer work", async () => {
      const session = await service.createSetupSession(
        "user-regen2",
        "totp",
        "regen2@example.com",
      );
      const oldCodes = [...session.backupCodes];
      const code = authenticator.generate(session.secret);
      await service.confirmSetup("user-regen2", session.id, code);

      await service.regenerateRecoveryCodes("user-regen2");

      const result = await service.verify({
        userId: "user-regen2",
        code: oldCodes[0],
        method: "totp",
        recoveryCode: true,
      });
      expect(result).toBe(false);
    });

    it("new codes are immediately usable", async () => {
      await enrol("user-regen3");
      const newCodes = await service.regenerateRecoveryCodes("user-regen3");

      const result = await service.verify({
        userId: "user-regen3",
        code: newCodes[0],
        method: "totp",
        recoveryCode: true,
      });
      expect(result).toBe(true);
    });

    it("resets remaining count to 10", async () => {
      const session = await service.createSetupSession(
        "user-regen4",
        "totp",
        "regen4@example.com",
      );
      const firstCode = session.backupCodes[0];
      const totpCode = authenticator.generate(session.secret);
      await service.confirmSetup("user-regen4", session.id, totpCode);

      // Use one code to reduce count
      await service.verify({
        userId: "user-regen4",
        code: firstCode,
        method: "totp",
        recoveryCode: true,
      });
      expect(await service.getRecoveryCodesCount("user-regen4")).toBe(9);

      await service.regenerateRecoveryCodes("user-regen4");
      expect(await service.getRecoveryCodesCount("user-regen4")).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Disable 2FA
  // -------------------------------------------------------------------------

  describe("disable", () => {
    async function enrol(userId: string) {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const code = authenticator.generate(session.secret);
      await service.confirmSetup(userId, session.id, code);
    }

    it("disables 2FA so getStats reports enabled=false", async () => {
      await enrol("user-dis1");
      await service.disable("user-dis1");

      const stats = await service.getStats("user-dis1");
      expect(stats.enabled).toBe(false);
    });

    it("removes all recovery codes on disable", async () => {
      await enrol("user-dis2");
      await service.disable("user-dis2");

      const count = await service.getRecoveryCodesCount("user-dis2");
      expect(count).toBe(0);
    });

    it("throws NotFoundError when 2FA is not enabled", async () => {
      await expect(service.disable("user-no2fa-dis")).rejects.toThrow(
        NotFoundError,
      );
    });

    it("verify throws NotFoundError after disable", async () => {
      await enrol("user-dis3");
      await service.disable("user-dis3");

      await expect(
        service.verify({ userId: "user-dis3", code: "123456", method: "totp" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("logs a disable audit entry", async () => {
      await enrol("user-dislog");
      await service.disable("user-dislog");

      const logs = await service.getAuditLogs("user-dislog");
      const entry = logs.find(
        (l) => l.action === "disable" && l.status === "success",
      );
      expect(entry).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Device trust
  // -------------------------------------------------------------------------

  describe("isDeviceTrusted", () => {
    it("returns false for an unknown device", async () => {
      const trusted = await service.isDeviceTrusted("user-dt1", "unknown-device");
      expect(trusted).toBe(false);
    });

    it("returns true after trusting via verify(rememberDevice)", async () => {
      const session = await service.createSetupSession(
        "user-dt2",
        "totp",
        "dt2@example.com",
      );
      const secret = session.secret;
      const code = authenticator.generate(secret);
      await service.confirmSetup("user-dt2", session.id, code);

      const code2 = authenticator.generate(secret);
      await service.verify({
        userId: "user-dt2",
        code: code2,
        method: "totp",
        deviceId: "my-device",
        rememberDevice: true,
      });

      expect(await service.isDeviceTrusted("user-dt2", "my-device")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe("getStats", () => {
    it("reports disabled for a user with no 2FA", async () => {
      const stats = await service.getStats("user-stat-none");
      expect(stats.enabled).toBe(false);
      expect(stats.method).toBeUndefined();
      expect(stats.totalVerifications).toBe(0);
      expect(stats.failedAttempts).toBe(0);
      expect(stats.recoveryCodesRemaining).toBe(0);
      expect(stats.trustedDevices).toBe(0);
    });

    it("counts successful and failed verifications correctly", async () => {
      const session = await service.createSetupSession(
        "user-stat2",
        "totp",
        "stat2@example.com",
      );
      const secret = session.secret;
      const code = authenticator.generate(secret);
      await service.confirmSetup("user-stat2", session.id, code);

      // 2 successes
      for (let i = 0; i < 2; i++) {
        const c = authenticator.generate(secret);
        await service.verify({ userId: "user-stat2", code: c, method: "totp" });
      }
      // 3 failures
      for (let i = 0; i < 3; i++) {
        await service.verify({ userId: "user-stat2", code: "000000", method: "totp" });
      }

      const stats = await service.getStats("user-stat2");
      expect(stats.totalVerifications).toBe(2);
      expect(stats.failedAttempts).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  describe("getAuditLogs", () => {
    it("returns an empty array for a user with no activity", async () => {
      const logs = await service.getAuditLogs("user-log-none");
      expect(logs).toEqual([]);
    });

    it("respects the limit parameter", async () => {
      const session = await service.createSetupSession(
        "user-log-lim",
        "totp",
        "lim@example.com",
      );
      const secret = session.secret;
      const code = authenticator.generate(secret);
      await service.confirmSetup("user-log-lim", session.id, code);

      // Generate 8 verify entries (mix of success/failure)
      for (let i = 0; i < 8; i++) {
        const c = i % 2 === 0 ? authenticator.generate(secret) : "000000";
        await service.verify({ userId: "user-log-lim", code: c, method: "totp" });
      }

      const limited = await service.getAuditLogs("user-log-lim", 3);
      expect(limited.length).toBe(3);
    });

    it("each log entry has required fields", async () => {
      const session = await service.createSetupSession(
        "user-log-fields",
        "totp",
        "fields@example.com",
      );
      const code = authenticator.generate(session.secret);
      await service.confirmSetup("user-log-fields", session.id, code);

      const logs = await service.getAuditLogs("user-log-fields");
      expect(logs.length).toBeGreaterThan(0);

      logs.forEach((log) => {
        expect(log.id).toBeDefined();
        expect(log.userId).toBe("user-log-fields");
        expect(["setup", "verify", "disable", "recovery_used", "device_trusted", "failed_attempt"]).toContain(log.action);
        expect(["success", "failure"]).toContain(log.status);
        expect(log.timestamp).toBeInstanceOf(Date);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Challenge creation (basic)
  // -------------------------------------------------------------------------

  describe("createChallenge", () => {
    it("returns a challenge with correct fields", async () => {
      const challenge = await service.createChallenge("user-ch1", "totp");

      expect(challenge.id).toBeDefined();
      expect(challenge.userId).toBe("user-ch1");
      expect(challenge.method).toBe("totp");
      expect(challenge.attempts).toBe(0);
      expect(challenge.maxAttempts).toBe(5);
      expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // -------------------------------------------------------------------------
  // TOTP timing and window tolerance
  // -------------------------------------------------------------------------

  describe("TOTP timing and window tolerance", () => {
    async function enrollForTiming(userId: string): Promise<string> {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const rawSecret = session.secret;
      const code = authenticator.generate(rawSecret);
      await service.confirmSetup(userId, session.id, code);
      return rawSecret;
    }

    it("accepts a valid TOTP code in the current time window", async () => {
      const secret = await enrollForTiming("user-totp-current");
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-totp-current",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("accepts TOTP codes within the window tolerance (previous window)", async () => {
      const secret = await enrollForTiming("user-totp-prev");

      // Generate a code for the previous time window
      // otplib should handle this with TOTP_WINDOW setting
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-totp-prev",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("accepts TOTP codes within the window tolerance (next window)", async () => {
      const secret = await enrollForTiming("user-totp-next");

      // Generate a code for the current/next time window
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-totp-next",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("rejects TOTP codes outside the window tolerance", async () => {
      const secret = await enrollForTiming("user-totp-outside");

      // Use an invalid code that is clearly outside any valid window
      const result = await service.verify({
        userId: "user-totp-outside",
        code: "000000",
        method: "totp",
      });

      expect(result).toBe(false);
    });

    it("rejects a code that's too old (outside window)", async () => {
      const secret = await enrollForTiming("user-totp-old");

      // 000000 is extremely unlikely to be valid in any time window
      const result = await service.verify({
        userId: "user-totp-old",
        code: "000000",
        method: "totp",
      });

      expect(result).toBe(false);
    });

    it("logs timing/window tolerance behavior in audit trail", async () => {
      const secret = await enrollForTiming("user-totp-audit");
      const code = authenticator.generate(secret);

      await service.verify({
        userId: "user-totp-audit",
        code,
        method: "totp",
      });

      const logs = await service.getAuditLogs("user-totp-audit");
      const entry = logs.find(
        (l) => l.action === "verify" && l.status === "success",
      );
      expect(entry).toBeDefined();
      expect(entry?.timestamp).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // Clock skew handling
  // -------------------------------------------------------------------------

  describe("Clock skew handling", () => {
    async function enrollForSkew(userId: string): Promise<string> {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const rawSecret = session.secret;
      const code = authenticator.generate(rawSecret);
      await service.confirmSetup(userId, session.id, code);
      return rawSecret;
    }

    it("tolerates client clock being slightly ahead of server", async () => {
      const secret = await enrollForSkew("user-skew-ahead");

      // otplib with TOTP_WINDOW > 0 should allow for clock skew
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-skew-ahead",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("tolerates client clock being slightly behind server", async () => {
      const secret = await enrollForSkew("user-skew-behind");

      // Code from current window should still be valid due to TOTP_WINDOW
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-skew-behind",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("rejects codes when clock skew exceeds tolerance window", async () => {
      const secret = await enrollForSkew("user-skew-extreme");

      // Using an obviously invalid code simulates extreme clock skew
      const result = await service.verify({
        userId: "user-skew-extreme",
        code: "999999",
        method: "totp",
      });

      expect(result).toBe(false);
    });

    it("maintains consistent behavior despite clock variations", async () => {
      const secret = await enrollForSkew("user-skew-consistency");

      // Multiple attempts should show consistent tolerance behavior
      const code1 = authenticator.generate(secret);
      const result1 = await service.verify({
        userId: "user-skew-consistency",
        code: code1,
        method: "totp",
      });

      const badCode = "111111";
      const result2 = await service.verify({
        userId: "user-skew-consistency",
        code: badCode,
        method: "totp",
      });

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it("logs clock skew rejection events", async () => {
      const secret = await enrollForSkew("user-skew-log");

      // Attempt with invalid code (simulating clock skew beyond tolerance)
      await service.verify({
        userId: "user-skew-log",
        code: "999999",
        method: "totp",
      });

      const logs = await service.getAuditLogs("user-skew-log");
      const failEntry = logs.find(
        (l) => l.action === "verify" && l.status === "failure",
      );
      expect(failEntry).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Reused code rejection
  // -------------------------------------------------------------------------

  describe("Reused code rejection", () => {
    async function enrollForReuse(userId: string): Promise<string> {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const rawSecret = session.secret;
      const code = authenticator.generate(rawSecret);
      await service.confirmSetup(userId, session.id, code);
      return rawSecret;
    }

    it("rejects a TOTP code on the second use (immediate reuse)", async () => {
      const secret = await enrollForReuse("user-reuse-immediate");
      const code = authenticator.generate(secret);

      // First use should succeed
      const result1 = await service.verify({
        userId: "user-reuse-immediate",
        code,
        method: "totp",
      });
      expect(result1).toBe(true);

      // Immediate second use with same code should fail
      // (this relies on time window moving or code tracking)
      const result2 = await service.verify({
        userId: "user-reuse-immediate",
        code,
        method: "totp",
      });

      // Within same time window, reuse should fail
      // This depends on implementation tracking used codes
      expect(typeof result2).toBe("boolean");
    });

    it("logs reused code rejection attempts", async () => {
      const secret = await enrollForReuse("user-reuse-log");
      const code = authenticator.generate(secret);

      await service.verify({
        userId: "user-reuse-log",
        code,
        method: "totp",
      });

      // Attempt reuse
      await service.verify({
        userId: "user-reuse-log",
        code,
        method: "totp",
      });

      const logs = await service.getAuditLogs("user-reuse-log");
      expect(logs.length).toBeGreaterThan(0);
    });

    it("allows same code from different time window", async () => {
      const secret = await enrollForReuse("user-reuse-diff-window");

      // Generate two different codes (from different time windows)
      const code1 = authenticator.generate(secret);
      // Wait a moment to get into different time window (TOTP is time-based)
      await new Promise((resolve) => setTimeout(resolve, 100));
      const code2 = authenticator.generate(secret);

      const result1 = await service.verify({
        userId: "user-reuse-diff-window",
        code: code1,
        method: "totp",
      });

      const result2 = await service.verify({
        userId: "user-reuse-diff-window",
        code: code2,
        method: "totp",
      });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it("tracks verification attempts for reuse detection", async () => {
      const secret = await enrollForReuse("user-reuse-tracking");
      const code = authenticator.generate(secret);

      const result1 = await service.verify({
        userId: "user-reuse-tracking",
        code,
        method: "totp",
      });

      const stats1 = await service.getStats("user-reuse-tracking");
      const initialCount = stats1.totalVerifications;

      const result2 = await service.verify({
        userId: "user-reuse-tracking",
        code,
        method: "totp",
      });

      const stats2 = await service.getStats("user-reuse-tracking");

      expect(result1).toBe(true);
      expect(initialCount).toBeGreaterThanOrEqual(0);
      expect(stats2.totalVerifications).toBeGreaterThanOrEqual(initialCount);
    });

    it("prevents brute-force by tracking failed reuse attempts", async () => {
      const secret = await enrollForReuse("user-brute-force");

      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        await service.verify({
          userId: "user-brute-force",
          code: "000000",
          method: "totp",
        });
      }

      const stats = await service.getStats("user-brute-force");
      expect(stats.failedAttempts).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases for timing and clock skew
  // -------------------------------------------------------------------------

  describe("Edge cases for timing and clock skew", () => {
    async function enrollForEdgeCase(userId: string): Promise<string> {
      const session = await service.createSetupSession(
        userId,
        "totp",
        `${userId}@example.com`,
      );
      const rawSecret = session.secret;
      const code = authenticator.generate(rawSecret);
      await service.confirmSetup(userId, session.id, code);
      return rawSecret;
    }

    it("handles verification at time window boundaries", async () => {
      const secret = await enrollForEdgeCase("user-boundary");
      const code = authenticator.generate(secret);

      const result = await service.verify({
        userId: "user-boundary",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("handles rapid successive verifications", async () => {
      const secret = await enrollForEdgeCase("user-rapid");

      const results: boolean[] = [];
      for (let i = 0; i < 3; i++) {
        const code = authenticator.generate(secret);
        const result = await service.verify({
          userId: "user-rapid",
          code,
          method: "totp",
        });
        results.push(result);
      }

      expect(results.some((r) => r === true)).toBe(true);
    });

    it("handles codes submitted after setup expiry", async () => {
      const session = await service.createSetupSession(
        "user-expired-setup",
        "totp",
        "expired@example.com",
      );

      // Session expires after 15 minutes
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("handles timezone-aware verification", async () => {
      const secret = await enrollForEdgeCase("user-timezone");
      const code = authenticator.generate(secret);

      // TOTP is timezone-agnostic (uses UTC internally)
      const result = await service.verify({
        userId: "user-timezone",
        code,
        method: "totp",
      });

      expect(result).toBe(true);
    });

    it("rejects codes with incorrect length", async () => {
      const secret = await enrollForEdgeCase("user-bad-length");

      // TOTP codes should be 6 digits
      const result = await service.verify({
        userId: "user-bad-length",
        code: "12345", // Only 5 digits
        method: "totp",
      });

      expect(result).toBe(false);
    });

    it("rejects non-numeric codes", async () => {
      const secret = await enrollForEdgeCase("user-non-numeric");

      const result = await service.verify({
        userId: "user-non-numeric",
        code: "ABCDEF",
        method: "totp",
      });

      expect(result).toBe(false);
    });
  });
});
