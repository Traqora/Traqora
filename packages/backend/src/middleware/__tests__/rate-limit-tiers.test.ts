import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

import {
  BOOKING_LIMITS,
  bookingRateLimit,
  excludingPaths,
  SEARCH_LIMITS,
  searchRateLimit,
} from "../rate-limit-tiers";

// Each `describe` block spins up its own app with fresh middleware imports
// via `jest.resetModules()` — the module-level `limiterCache` in
// rate-limit-tiers.ts is a singleton keyed by (tier, points, duration), so
// two tests hitting the same tier without a reset would share consumed
// points and see each other's state.
function freshLimiters() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../rate-limit-tiers") as typeof import("../rate-limit-tiers");
}

function buildApp(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  userMiddleware?: (req: Request, res: Response, next: NextFunction) => void,
) {
  const app = express();
  if (userMiddleware) app.use(userMiddleware);
  app.use(middleware);
  app.get("/", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("rate-limit-tiers", () => {
  describe("anonymous tier", () => {
    it("allows requests within the anonymous search limit", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh);
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe(String(SEARCH_LIMITS.anonymous.points));
    });

    it("returns 429 with Retry-After once the anonymous search limit is exhausted", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh);

      // Exhaust every point for this IP.
      for (let i = 0; i < SEARCH_LIMITS.anonymous.points; i++) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await request(app).get("/");
        expect(ok.status).toBe(200);
      }

      const throttled = await request(app).get("/");
      expect(throttled.status).toBe(429);
      expect(throttled.headers["retry-after"]).toBeDefined();
      expect(Number(throttled.headers["retry-after"])).toBeGreaterThan(0);
      expect(throttled.body).toMatchObject({ error: "Too many requests", tier: "anonymous" });
    });

    it("uses the tighter booking limit, not the search limit, for bookingRateLimit", async () => {
      const { bookingRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh);

      for (let i = 0; i < BOOKING_LIMITS.anonymous.points; i++) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await request(app).get("/");
        expect(ok.status).toBe(200);
      }
      const throttled = await request(app).get("/");
      expect(throttled.status).toBe(429);
      // Booking's anonymous limit (5/min) is much tighter than search's (30/min) —
      // confirms the two middlewares track independent state, not a shared bucket.
      expect(BOOKING_LIMITS.anonymous.points).toBeLessThan(SEARCH_LIMITS.anonymous.points);
    });
  });

  describe("authenticated vs. premium tiers", () => {
    function withUser(tier: "authenticated" | "premium") {
      return (req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as { user: { id: string; tier?: string } }).user = {
          id: "user-1",
          tier: tier === "premium" ? "premium" : undefined,
        };
        next();
      };
    }

    it("grants a higher point budget to an authenticated user than an anonymous one", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh, withUser("authenticated"));

      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe(String(SEARCH_LIMITS.authenticated.points));
      expect(SEARCH_LIMITS.authenticated.points).toBeGreaterThan(SEARCH_LIMITS.anonymous.points);
    });

    it("grants a higher point budget to a premium user than an authenticated one", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh, withUser("premium"));

      const res = await request(app).get("/");
      expect(res.headers["x-ratelimit-limit"]).toBe(String(SEARCH_LIMITS.premium.points));
      expect(SEARCH_LIMITS.premium.points).toBeGreaterThan(SEARCH_LIMITS.authenticated.points);
    });

    it("keys authenticated users by user id, not IP, so two users behind the same IP get independent budgets", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = express();
      app.use((req: Request, _res: Response, next: NextFunction) => {
        const userId = req.header("x-test-user-id");
        (req as unknown as { user?: { id: string } }).user = userId ? { id: userId } : undefined;
        next();
      });
      app.use(fresh);
      app.get("/", (_req, res) => res.status(200).json({ ok: true }));

      // Exhaust user-a's authenticated budget.
      for (let i = 0; i < SEARCH_LIMITS.authenticated.points; i++) {
        // eslint-disable-next-line no-await-in-loop
        await request(app).get("/").set("x-test-user-id", "user-a");
      }
      const userAThrottled = await request(app).get("/").set("x-test-user-id", "user-a");
      expect(userAThrottled.status).toBe(429);

      // user-b, same process/IP, is unaffected.
      const userB = await request(app).get("/").set("x-test-user-id", "user-b");
      expect(userB.status).toBe(200);
    });
  });

  describe("headers", () => {
    it("sets X-RateLimit-Remaining decreasing on each successful request", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh);

      const first = await request(app).get("/");
      const second = await request(app).get("/");
      expect(Number(first.headers["x-ratelimit-remaining"])).toBeGreaterThan(
        Number(second.headers["x-ratelimit-remaining"]),
      );
    });

    it("does not set Retry-After on a successful (non-429) response", async () => {
      const { searchRateLimit: fresh } = freshLimiters();
      const app = buildApp(fresh);
      const res = await request(app).get("/");
      expect(res.headers["retry-after"]).toBeUndefined();
    });
  });

  describe("excludingPaths", () => {
    it("skips the wrapped middleware for an excluded path, bypassing rate limiting entirely", async () => {
      const { bookingRateLimit: fresh, excludingPaths: freshExcludingPaths } = freshLimiters();
      const app = express();
      app.use(freshExcludingPaths(fresh, ["/webhook/stripe"]));
      app.post("/webhook/stripe", (_req, res) => res.status(200).json({ ok: true }));
      app.post("/", (_req, res) => res.status(200).json({ ok: true }));

      // Exhaust the booking limiter's IP-level budget via the non-excluded route.
      for (let i = 0; i < BOOKING_LIMITS.anonymous.points; i++) {
        // eslint-disable-next-line no-await-in-loop
        await request(app).post("/");
      }
      const throttled = await request(app).post("/");
      expect(throttled.status).toBe(429);

      // The excluded webhook path is unaffected, even though the same IP
      // just exhausted its non-webhook budget.
      const webhook = await request(app).post("/webhook/stripe");
      expect(webhook.status).toBe(200);
    });

    it("still applies the wrapped middleware to a non-excluded path", async () => {
      const { bookingRateLimit: fresh, excludingPaths: freshExcludingPaths } = freshLimiters();
      const app = express();
      app.use(freshExcludingPaths(fresh, ["/webhook/stripe"]));
      app.get("/", (_req, res) => res.status(200).json({ ok: true }));

      const res = await request(app).get("/");
      expect(res.headers["x-ratelimit-limit"]).toBe(String(BOOKING_LIMITS.anonymous.points));
    });

    it("matches the excluded path exactly, not as a prefix", async () => {
      const { bookingRateLimit: fresh, excludingPaths: freshExcludingPaths } = freshLimiters();
      const app = express();
      app.use(freshExcludingPaths(fresh, ["/webhook/stripe"]));
      app.get("/webhook/stripe/extra", (_req, res) => res.status(200).json({ ok: true }));

      // "/webhook/stripe/extra" is NOT "/webhook/stripe" — it should still
      // be rate-limited, guarding against an overly broad exclusion that
      // could be exploited to bypass the limiter via a crafted subpath.
      const res = await request(app).get("/webhook/stripe/extra");
      expect(res.headers["x-ratelimit-limit"]).toBe(String(BOOKING_LIMITS.anonymous.points));
    });
  });
});
