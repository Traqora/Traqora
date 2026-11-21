import { notificationService } from "../../src/services/NotificationService";
import { scheduleNotification } from "../../src/jobs/notificationQueue";
import { AppDataSource } from "../../src/db/dataSource";

// Mock dependencies
jest.mock("../../src/jobs/notificationQueue", () => ({
  scheduleNotification: jest.fn(),
  notificationQueue: {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  },
}));

describe("NotificationService", () => {
  let userPrefRepo: any;

  beforeAll(async () => {
    // Initialize standard mock db or test db
    if (!AppDataSource.isInitialized) {
      // Avoid real initialize, or mock repo entirely
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Mock Repository
    userPrefRepo = {
      findOne: jest.fn(),
    };
    jest.spyOn(AppDataSource, "getRepository").mockReturnValue(userPrefRepo);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should skip booking confirmation if user preferences are not found", async () => {
    userPrefRepo.findOne.mockResolvedValue(null);

    await notificationService.sendBookingConfirmation(
      "user-123",
      "REF123",
      "FL123",
      "2026-05-01",
    );

    expect(userPrefRepo.findOne).toHaveBeenCalledWith({
      where: { userId: "user-123" },
    });
    expect(scheduleNotification).not.toHaveBeenCalled();
  });

  it("should schedule booking confirmation if user preferences exist", async () => {
    userPrefRepo.findOne.mockResolvedValue({
      userId: "user-123",
      emailEnabled: true,
    });

    await notificationService.sendBookingConfirmation(
      "user-123",
      "REF123",
      "FL123",
      "2026-05-01",
    );

    expect(userPrefRepo.findOne).toHaveBeenCalledWith({
      where: { userId: "user-123" },
    });
    expect(scheduleNotification).toHaveBeenCalledWith(
      {
        userId: "user-123",
        type: "booking",
        data: {
          bookingReference: "REF123",
          flightNumber: "FL123",
          departureDate: "2026-05-01",
        },
      },
      0,
      1,
    );
  });

  it("should schedule flight reminder exactly 24 hours before departure", async () => {
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

    await notificationService.scheduleFlightReminder(
      "user-123",
      "FL123",
      futureDate,
    );

    // Should delay by ~24 hours
    expect(scheduleNotification).toHaveBeenCalledTimes(1);
    const callArgs = (scheduleNotification as jest.Mock).mock.calls[0];

    expect(callArgs[0].type).toBe("reminder");
    expect(callArgs[0].userId).toBe("user-123");
    expect(callArgs[1]).toBeGreaterThan(23 * 60 * 60 * 1000); // ~24h in ms
    expect(callArgs[2]).toBe(2); // Priority 2
  });

  it("should schedule immediate flight reminder if less than 24 hours remaining", async () => {
    const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now

    await notificationService.scheduleFlightReminder(
      "user-123",
      "FL123",
      futureDate,
    );

    expect(scheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "reminder", userId: "user-123" }),
      0, // Immediate
      2,
    );
  });

  it("should schedule refund update immediately", async () => {
    await notificationService.sendRefundUpdate(
      "user-123",
      "REF123",
      "150.00 USD",
    );

    expect(scheduleNotification).toHaveBeenCalledWith(
      {
        userId: "user-123",
        type: "refund",
        data: { bookingReference: "REF123", refundAmount: "150.00 USD" },
      },
      0,
      2,
    );
  });
});
