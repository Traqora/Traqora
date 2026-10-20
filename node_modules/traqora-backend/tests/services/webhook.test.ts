import { WebhookService } from "../../src/services/WebhookService";
import { AppDataSource } from "../../src/db/dataSource";
import axios from "axios";

// Mock dependencies
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock("../../src/services/retry", () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
  withRetries: jest.fn().mockImplementation(async (fn) => fn()),
}));

describe("WebhookService", () => {
  let webhookService: WebhookService;
  let userPrefRepo: any;
  let notifLogRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();

    webhookService = new WebhookService();

    userPrefRepo = {
      findOne: jest.fn(),
    };

    notifLogRepo = {
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest
      .spyOn(AppDataSource, "getRepository")
      .mockImplementation((entity: any) => {
        if (entity.name === "UserPreference") return userPrefRepo;
        if (entity.name === "NotificationLog") return notifLogRepo;
        return userPrefRepo;
      });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should skip webhook if user has no preferences", async () => {
    userPrefRepo.findOne.mockResolvedValue(null);

    await webhookService.sendWebhook("user-1", "booking_created", {
      bookingId: "123",
    });

    expect(userPrefRepo.findOne).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(notifLogRepo.create).not.toHaveBeenCalled();
  });

  it("should skip webhook if webhookEnabled is false", async () => {
    userPrefRepo.findOne.mockResolvedValue({
      userId: "user-1",
      webhookEnabled: false,
      webhookUrl: "https://example.com/hook",
    });

    await webhookService.sendWebhook("user-1", "booking_created", {
      bookingId: "123",
    });

    expect(notifLogRepo.create).not.toHaveBeenCalled();
  });

  it("should skip webhook if webhookUrl is missing", async () => {
    userPrefRepo.findOne.mockResolvedValue({
      userId: "user-1",
      webhookEnabled: true,
      webhookUrl: null,
    });

    await webhookService.sendWebhook("user-1", "booking_created", {
      bookingId: "123",
    });

    expect(notifLogRepo.create).not.toHaveBeenCalled();
  });

  it("should send webhook and log success", async () => {
    userPrefRepo.findOne.mockResolvedValue({
      userId: "user-1",
      webhookEnabled: true,
      webhookUrl: "https://example.com/hook",
    });

    mockedAxios.post.mockResolvedValue({ status: 200 });

    // Override withRetries to actually call axios
    const { withRetries } = require("../../src/services/retry");
    (withRetries as jest.Mock).mockImplementation(async (fn: Function) => fn());

    await webhookService.sendWebhook("user-1", "booking_created", {
      bookingId: "123",
    });

    expect(notifLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        channel: "webhook",
        type: "booking_created",
        status: "pending",
      })
    );

    // Log entry should be saved with "sent" status
    expect(notifLogRepo.save).toHaveBeenCalled();
    const savedLog = notifLogRepo.save.mock.calls.find(
      (call: any) => call[0].status === "sent"
    );
    expect(savedLog).toBeTruthy();
  });

  it("should log failure when webhook delivery fails after retries", async () => {
    userPrefRepo.findOne.mockResolvedValue({
      userId: "user-1",
      webhookEnabled: true,
      webhookUrl: "https://example.com/hook",
    });

    const { withRetries } = require("../../src/services/retry");
    (withRetries as jest.Mock).mockRejectedValue(new Error("Connection refused"));

    await webhookService.sendWebhook("user-1", "booking_refunded", {
      bookingId: "456",
    });

    expect(notifLogRepo.save).toHaveBeenCalled();
    const failedLog = notifLogRepo.save.mock.calls.find(
      (call: any) => call[0].status === "failed"
    );
    expect(failedLog).toBeTruthy();
    expect(failedLog[0].errorMessage).toBe("Connection refused");
  });

  it("should include correct payload structure", async () => {
    userPrefRepo.findOne.mockResolvedValue({
      userId: "user-1",
      webhookEnabled: true,
      webhookUrl: "https://example.com/hook",
    });

    const { withRetries } = require("../../src/services/retry");
    (withRetries as jest.Mock).mockImplementation(async (fn: Function) => fn());
    mockedAxios.post.mockResolvedValue({ status: 200 });

    await webhookService.sendWebhook("user-1", "booking_paid", {
      bookingId: "789",
      amount: "100",
    });

    const createdLog = notifLogRepo.create.mock.calls[0][0];
    expect(createdLog.payload).toEqual(
      expect.objectContaining({
        event: "booking_paid",
        data: { bookingId: "789", amount: "100" },
      })
    );
    expect(createdLog.payload.timestamp).toBeDefined();
  });
});
