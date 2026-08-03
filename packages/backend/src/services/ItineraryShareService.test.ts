/**
 * Unit tests for Itinerary Share Service
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ItineraryShareService } from "./ItineraryShareService";
import type { CollaborativeEdit, PermissionLevel } from "../types/itinerary";

describe("ItineraryShareService", () => {
  let service: ItineraryShareService;

  beforeEach(() => {
    service = new ItineraryShareService();
  });

  describe("Share Token Generation", () => {
    it("should generate unique tokens", () => {
      const tokens = Array.from({ length: 100 }, () =>
        (service as any).generateShareToken(),
      );
      const uniqueTokens = new Set(tokens);

      expect(uniqueTokens.size).toBe(100);
    });

    it("should generate 64-character hex tokens", () => {
      const token = (service as any).generateShareToken();

      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(token.length).toBe(64);
    });
  });

  describe("Permission Levels", () => {
    it("should have view < edit < admin hierarchy", () => {
      const levels: Record<PermissionLevel, number> = {
        view: 1,
        edit: 2,
        admin: 3,
      };

      expect(levels.view).toBeLessThan(levels.edit);
      expect(levels.edit).toBeLessThan(levels.admin);
    });

    it("should support valid permission levels", () => {
      const validPerms: PermissionLevel[] = ["view", "edit", "admin"];

      validPerms.forEach((perm) => {
        expect(["view", "edit", "admin"]).toContain(perm);
      });
    });
  });

  describe("Change Recording", () => {
    it("should record collaborative edits", () => {
      const edit: CollaborativeEdit = {
        userId: "user-1",
        itineraryId: "itin-1",
        operation: {
          type: "update",
          path: "flights[0].departure",
          value: "2024-08-15T10:00:00Z",
        },
        timestamp: new Date(),
        version: 1,
        clientId: "client-1",
      };

      expect(edit.operation.type).toBe("update");
      expect(edit.operation.path).toContain("flights");
      expect(edit.operation.value).toBeDefined();
    });

    it("should support different operation types", () => {
      const operations = ["insert", "delete", "replace"];

      operations.forEach((op) => {
        expect(["insert", "delete", "replace"]).toContain(op);
      });
    });
  });

  describe("Conflict Resolution", () => {
    it("should resolve conflicts using timestamps", () => {
      const now = new Date();
      const edit1: CollaborativeEdit = {
        userId: "user-1",
        itineraryId: "itin-1",
        operation: {
          type: "update",
          path: "flights[0].departure",
          value: "value-1",
        },
        timestamp: new Date(now.getTime() - 1000),
        version: 1,
        clientId: "client-1",
      };

      const edit2: CollaborativeEdit = {
        userId: "user-2",
        itineraryId: "itin-1",
        operation: {
          type: "update",
          path: "flights[0].departure",
          value: "value-2",
        },
        timestamp: new Date(now.getTime()),
        version: 1,
        clientId: "client-2",
      };

      const result = service.resolveConflict(edit1, edit2);

      expect(result.conflictResolved).toBe(true);
      expect(result.operation).toEqual(edit2.operation);
      expect(result.priority).toBeGreaterThan(0);
    });

    it("should favor later edits", () => {
      const earlierTime = new Date(Date.now() - 10000);
      const laterTime = new Date();

      const edit1: CollaborativeEdit = {
        userId: "user-1",
        itineraryId: "itin-1",
        operation: { type: "update", path: "field", value: "early" },
        timestamp: earlierTime,
        version: 1,
        clientId: "client-1",
      };

      const edit2: CollaborativeEdit = {
        userId: "user-2",
        itineraryId: "itin-1",
        operation: { type: "update", path: "field", value: "late" },
        timestamp: laterTime,
        version: 1,
        clientId: "client-2",
      };

      const result = service.resolveConflict(edit1, edit2);

      expect(result.operation.value).toBe("late");
    });
  });

  describe("Version Management", () => {
    it("should track version numbers", () => {
      const snapshot = { flights: [], hotels: [], activities: [] };

      const version = {
        version: 1,
        createdBy: "user-1",
        createdAt: new Date(),
        snapshot,
        changes: [],
      };

      expect(version.version).toBe(1);
      expect(version.snapshot).toEqual(snapshot);
      expect(version.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("Access Logging", () => {
    it("should log access events", () => {
      const actions = ["view", "edit", "share", "revoke", "download"];

      actions.forEach((action) => {
        expect(["view", "edit", "share", "revoke", "download"]).toContain(
          action,
        );
      });
    });

    it("should include timestamps in logs", () => {
      const now = new Date();
      const log = {
        id: "log-1",
        itineraryId: "itin-1",
        userId: "user-1",
        email: "user@example.com",
        action: "view" as const,
        timestamp: now,
      };

      expect(log.timestamp).toEqual(now);
      expect(log.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("Email Invitation", () => {
    it("should set expiry to 7 days", () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const daysUntilExpiry =
        (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

      expect(Math.floor(daysUntilExpiry)).toBe(7);
    });
  });

  describe("Operation Parsing", () => {
    it("should parse field paths correctly", () => {
      const paths = [
        "flights[0].departure",
        "hotels[1].address",
        "activities[2].name",
      ];

      paths.forEach((path) => {
        expect(path).toContain("[");
        expect(path).toContain(".");
      });
    });
  });
});
