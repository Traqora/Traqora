/**
 * Unit tests for multi-channel de-duplication in notificationWorker.
 *
 * The worker is not instantiated here; instead we test the isDuplicateDelivery
 * helper logic through its observable side-effects on the mocked repository.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Minimal mock of the TypeORM repository used inside the worker
// ---------------------------------------------------------------------------

interface LogEntry {
  userId: string;
  type: string;
  channel: string;
  idempotencyKey: string;
  status: string;
}

function makeLogRepo(existingEntries: LogEntry[] = []) {
  const saved: LogEntry[] = [...existingEntries];

  return {
    findOne: jest.fn(async ({ where }: { where: Partial<LogEntry> }) => {
      const match = saved.find((e) =>
        Object.entries(where).every(
          ([k, v]) => (e as Record<string, string>)[k] === v,
        ),
      );
      return match ?? null;
    }),
    create: jest.fn((data: Partial<LogEntry>) => ({ ...data } as LogEntry)),
    save: jest.fn(async (entry: LogEntry) => {
      saved.push(entry);
      return entry;
    }),
    _saved: saved,
  };
}

// ---------------------------------------------------------------------------
// Inline re-implementation of isDuplicateDelivery so the unit test does not
// depend on TypeORM / Bull being importable in the test environment.
// ---------------------------------------------------------------------------

async function isDuplicateDelivery(
  logRepo: ReturnType<typeof makeLogRepo>,
  userId: string,
  type: string,
  channel: string,
  idempotencyKey: string,
): Promise<boolean> {
  const existing = await logRepo.findOne({
    where: { userId, type, channel, idempotencyKey, status: "sent" },
  });
  return existing !== null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isDuplicateDelivery", () => {
  it("returns false when no matching log entry exists", async () => {
    const repo = makeLogRepo();
    expect(
      await isDuplicateDelivery(repo, "u1", "booking", "email", "key-1"),
    ).toBe(false);
  });

  it("returns true when a sent log entry already exists for the same key/channel", async () => {
    const repo = makeLogRepo([
      {
        userId: "u1",
        type: "booking",
        channel: "email",
        idempotencyKey: "key-1",
        status: "sent",
      },
    ]);
    expect(
      await isDuplicateDelivery(repo, "u1", "booking", "email", "key-1"),
    ).toBe(true);
  });

  it("returns false when the existing entry has status=failed (retry is allowed)", async () => {
    const repo = makeLogRepo([
      {
        userId: "u1",
        type: "booking",
        channel: "email",
        idempotencyKey: "key-1",
        status: "failed",
      },
    ]);
    expect(
      await isDuplicateDelivery(repo, "u1", "booking", "email", "key-1"),
    ).toBe(false);
  });

  it("is channel-specific: a sent email does not block an sms delivery", async () => {
    const repo = makeLogRepo([
      {
        userId: "u1",
        type: "booking",
        channel: "email",
        idempotencyKey: "key-1",
        status: "sent",
      },
    ]);
    expect(
      await isDuplicateDelivery(repo, "u1", "booking", "sms", "key-1"),
    ).toBe(false);
  });

  it("is user-specific: a sent log for u1 does not block u2", async () => {
    const repo = makeLogRepo([
      {
        userId: "u1",
        type: "booking",
        channel: "email",
        idempotencyKey: "key-1",
        status: "sent",
      },
    ]);
    expect(
      await isDuplicateDelivery(repo, "u2", "booking", "email", "key-1"),
    ).toBe(false);
  });

  it("is idempotency-key-specific: different key for same user/channel is not a dup", async () => {
    const repo = makeLogRepo([
      {
        userId: "u1",
        type: "booking",
        channel: "email",
        idempotencyKey: "key-1",
        status: "sent",
      },
    ]);
    expect(
      await isDuplicateDelivery(repo, "u1", "booking", "email", "key-2"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration-style simulation: worker processes same job twice
// ---------------------------------------------------------------------------

describe("Worker retry de-duplication simulation", () => {
  let repo: ReturnType<typeof makeLogRepo>;

  const USER = "user-retry";
  const TYPE = "booking";
  const IKEY = "job:42";

  type ChannelResult = { channel: string; status: string; error?: string };

  /**
   * Simulates one pass of the worker's per-channel loop for the three channels.
   * Uses the real isDuplicateDelivery logic against the shared repo.
   */
  async function simulateWorkerPass(
    sendEmail: () => Promise<void>,
    sendSms: () => Promise<void>,
    sendPush: () => Promise<void>,
  ): Promise<ChannelResult[]> {
    const results: ChannelResult[] = [];

    for (const [channel, send] of [
      ["email", sendEmail],
      ["sms", sendSms],
      ["push", sendPush],
    ] as [string, () => Promise<void>][]) {
      if (await isDuplicateDelivery(repo, USER, TYPE, channel, IKEY)) {
        results.push({ channel, status: "skipped_duplicate" });
      } else {
        try {
          await send();
          const entry = repo.create({
            userId: USER,
            type: TYPE,
            channel,
            idempotencyKey: IKEY,
            status: "sent",
          });
          await repo.save(entry);
          results.push({ channel, status: "success" });
        } catch (err: any) {
          results.push({ channel, status: "error", error: err.message });
        }
      }
    }

    return results;
  }

  beforeEach(() => {
    repo = makeLogRepo();
  });

  it("sends to all three channels on the first attempt", async () => {
    const results = await simulateWorkerPass(
      async () => {},
      async () => {},
      async () => {},
    );
    expect(results).toEqual([
      { channel: "email", status: "success" },
      { channel: "sms", status: "success" },
      { channel: "push", status: "success" },
    ]);
  });

  it("skips all channels on a second attempt when all succeeded on the first", async () => {
    await simulateWorkerPass(async () => {}, async () => {}, async () => {});
    const results = await simulateWorkerPass(
      async () => {
        throw new Error("should not be called");
      },
      async () => {
        throw new Error("should not be called");
      },
      async () => {
        throw new Error("should not be called");
      },
    );
    expect(results.every((r) => r.status === "skipped_duplicate")).toBe(true);
  });

  it("retries only the failed channel when email succeeded but sms failed on the first attempt", async () => {
    let smsFailed = true;

    // First pass: email ok, sms fails, push ok
    await simulateWorkerPass(
      async () => {},
      async () => {
        if (smsFailed) throw new Error("SMS timeout");
      },
      async () => {},
    );

    // Second pass: sms now recovers
    smsFailed = false;
    const results = await simulateWorkerPass(
      async () => {
        throw new Error("email should be skipped");
      },
      async () => {},
      async () => {
        throw new Error("push should be skipped");
      },
    );

    expect(results.find((r) => r.channel === "email")?.status).toBe("skipped_duplicate");
    expect(results.find((r) => r.channel === "sms")?.status).toBe("success");
    expect(results.find((r) => r.channel === "push")?.status).toBe("skipped_duplicate");
  });
});
