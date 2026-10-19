import { DataRetentionService } from "../../src/services/DataRetentionService";
import { AppDataSource, initDataSource } from "../../src/db/dataSource";

jest.mock("../../src/db/dataSource", () => {
  const actual = jest.requireActual("../../src/db/dataSource");
  return { ...actual, initDataSource: jest.fn().mockResolvedValue(undefined) };
});

const MS_DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * MS_DAY);
}

describe("DataRetentionService retention schedules (issue #600)", () => {
  let securityRepo: any;
  let adminRepo: any;
  let approvalRepo: any;
  let deletionRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const makeRepo = () => ({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    });

    securityRepo = makeRepo();
    adminRepo = makeRepo();
    approvalRepo = makeRepo();
    deletionRepo = makeRepo();

    jest.spyOn(AppDataSource, "getRepository").mockImplementation((entity: any) => {
      switch (entity.name) {
        case "SecurityAuditLog":
          return securityRepo;
        case "AdminAuditLog":
          return adminRepo;
        case "SensitiveOperationApproval":
          return approvalRepo;
        case "AccountDeletionRequest":
          return deletionRepo;
        default:
          throw new Error(`Unexpected entity ${entity.name}`);
      }
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("documented audit-log windows (archive 2y / delete 7y)", () => {
    it.each(["security", "admin", "approvals"])(
      "archives %s logs older than 2 years only",
      async (logType) => {
        const svc = new DataRetentionService();
        const repo =
          logType === "security"
            ? securityRepo
            : logType === "admin"
              ? adminRepo
              : approvalRepo;

        repo.find.mockResolvedValue([
          { id: "old-1", isArchived: false },
          { id: "old-2", isArchived: false },
        ]);

        await svc.archiveOldLogs();

        const call = repo.find.mock.calls.find(
          (c: any[]) => c[0]?.where?.isArchived === false
        );
        expect(call).toBeDefined();
        const threshold = new Date(call![0].where.createdAt.value);
        const ageYears = (Date.now() - threshold.getTime()) / (365 * MS_DAY);
        expect(ageYears).toBeCloseTo(2, 0);

        // Both stale records archived
        expect(repo.save).toHaveBeenCalledTimes(2);
        expect(repo.save.mock.calls.every((c: any[]) => c[0].isArchived === true)).toBe(true);
      }
    );

    it.each(["security", "admin", "approvals"])(
      "deletes %s logs older than 7 years only",
      async (logType) => {
        const svc = new DataRetentionService();
        const repo =
          logType === "security"
            ? securityRepo
            : logType === "admin"
              ? adminRepo
              : approvalRepo;

        repo.find.mockResolvedValue([{ id: "expired-1" }, { id: "expired-2" }]);

        await svc.deleteExpiredLogs();

        const call = repo.find.mock.calls[0];
        const threshold = new Date(call[0].where.createdAt.value);
        const ageYears = (Date.now() - threshold.getTime()) / (365 * MS_DAY);
        expect(ageYears).toBeCloseTo(7, 0);

        // Irreversible deletion for every expired record
        expect(repo.remove).toHaveBeenCalledTimes(2);
      }
    );

    it("exposes the documented policies", () => {
      const svc = new DataRetentionService();
      for (const logType of ["security", "admin", "approvals"] as const) {
        const policy = svc.getPolicy(logType);
        expect(policy).toEqual({ logType, retentionYears: 7, archiveAfterYears: 2 });
      }
    });
  });

  describe("right-to-erasure workflow windows (30d verification / 90d audit retention)", () => {
    function deletionRow(id: string, requestedAt: Date, status: string) {
      return { id, userId: `user-${id}`, status, requestedAt, save: undefined };
    }

    it("completes pending requests past the 30-day verification window", async () => {
      const svc = new DataRetentionService();

      const verified = deletionRow("verified", daysAgo(31), "pending");
      const fresh = deletionRow("fresh", daysAgo(5), "pending");
      deletionRepo.find.mockImplementation(({ where }: any) =>
        Promise.resolve(
          String(where.status) === "pending"
            ? [verified, fresh].filter(
                (r) => r.requestedAt.getTime() < where.requestedAt.value.getTime()
              )
            : []
        )
      );
      deletionRepo.save.mockImplementation(async (row: any) => row);

      const result = await svc.processDeletionRequests();

      expect(result.completedRequests).toBe(1);
      // Only the verified request transitions to completed
      const savedRows = deletionRepo.save.mock.calls.map((c: any[]) => c[0]);
      expect(savedRows).toHaveLength(1);
      expect(savedRows[0]).toMatchObject({ id: "verified", status: "completed" });
    });

    it("uses a 30-day cutoff when selecting pending requests", async () => {
      const svc = new DataRetentionService();
      deletionRepo.find.mockResolvedValue([]);

      await svc.processDeletionRequests(new Date("2026-06-15T00:00:00Z"));

      const pendingCall = deletionRepo.find.mock.calls.find(
        (c: any[]) => String(c[0]?.where?.status) === "pending"
      );
      expect(pendingCall).toBeDefined();
      const cutoff = new Date(pendingCall![0].where.requestedAt.value);
      const diffDays =
        (new Date("2026-06-15T00:00:00Z").getTime() - cutoff.getTime()) / MS_DAY;
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it("deletes request records older than 120 days (30 + 90)", async () => {
      const svc = new DataRetentionService();

      const expired = deletionRow("expired", daysAgo(121), "completed");
      deletionRepo.find.mockImplementation(({ where }: any) =>
        Promise.resolve(where.status === undefined ? [expired] : [])
      );
      deletionRepo.remove.mockResolvedValue(undefined);

      const result = await svc.processDeletionRequests();

      expect(result.deletedRequests).toBe(1);
      const removalCall = deletionRepo.find.mock.calls.find(
        (c: any[]) => c[0]?.where?.status === undefined
      );
      const cutoff = new Date(removalCall![0].where.requestedAt.value);
      const diffDays = (Date.now() - cutoff.getTime()) / MS_DAY;
      expect(diffDays).toBeCloseTo(120, 0);
      expect(deletionRepo.remove).toHaveBeenCalledWith(expired);
    });

    it("keeps recent and mid-life records untouched", async () => {
      const svc = new DataRetentionService();

      deletionRepo.find.mockResolvedValue([]);

      const result = await svc.processDeletionRequests();

      expect(result).toEqual({ completedRequests: 0, deletedRequests: 0 });
      expect(deletionRepo.save).not.toHaveBeenCalled();
      expect(deletionRepo.remove).not.toHaveBeenCalled();
    });

    it("continues processing when a single record fails to save", async () => {
      const svc = new DataRetentionService();

      const failing = deletionRow("failing", daysAgo(40), "pending");
      const working = deletionRow("working", daysAgo(35), "pending");
      deletionRepo.find.mockImplementation(({ where }: any) =>
        Promise.resolve(
          String(where.status) === "pending"
            ? [failing, working].filter(
                (r) => r.requestedAt.getTime() < where.requestedAt.value.getTime()
              )
            : []
        )
      );
      deletionRepo.save.mockRejectedValueOnce(new Error("db down"));

      const result = await svc.processDeletionRequests();

      expect(result.completedRequests).toBe(1);
      expect(deletionRepo.save).toHaveBeenCalledTimes(2);
    });
  });
});
