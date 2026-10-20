import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("ioredis", () => require("ioredis-mock"));

describe("cacheResponse middleware", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  const buildApp = async (handlerImpl: jest.Mock) => {
    const { cacheResponse } = await import("./cache");
    const app = express();
    app.get("/items", cacheResponse({ ttlSeconds: 60 }), (req, res) => {
      handlerImpl();
      res.json({ success: true, data: [1, 2, 3] });
    });
    return app;
  };

  it("calls the handler and returns MISS on first request", async () => {
    const handlerImpl = jest.fn();
    const app = await buildApp(handlerImpl);

    const res = await request(app).get("/items");

    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("MISS");
    expect(res.body).toEqual({ success: true, data: [1, 2, 3] });
    expect(handlerImpl).toHaveBeenCalledTimes(1);
  }, 20000);

  it("serves the second request from cache without invoking the handler", async () => {
    const handlerImpl = jest.fn();
    const app = await buildApp(handlerImpl);

    await request(app).get("/items");
    const res = await request(app).get("/items");

    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("HIT");
    expect(res.body).toEqual({ success: true, data: [1, 2, 3] });
    expect(handlerImpl).toHaveBeenCalledTimes(1);
  });

  it("does not cache non-GET requests", async () => {
    const { cacheResponse } = await import("./cache");
    const handlerImpl = jest.fn();
    const app = express();
    app.post("/items", cacheResponse({ ttlSeconds: 60 }), (req, res) => {
      handlerImpl();
      res.json({ success: true });
    });

    await request(app).post("/items");
    await request(app).post("/items");

    expect(handlerImpl).toHaveBeenCalledTimes(2);
  });

  it("invalidateResponseCache clears cached entries under a prefix", async () => {
    const { cacheResponse, invalidateResponseCache } = await import("./cache");
    const handlerImpl = jest.fn();
    const app = express();
    app.get("/items", cacheResponse({ ttlSeconds: 60, keyPrefix: "items" }), (req, res) => {
      handlerImpl();
      res.json({ success: true });
    });

    await request(app).get("/items");
    await invalidateResponseCache("items");
    await request(app).get("/items");

    expect(handlerImpl).toHaveBeenCalledTimes(2);
  });
});
