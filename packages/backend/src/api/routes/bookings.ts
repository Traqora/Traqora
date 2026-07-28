import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { AppDataSource } from "../../db/dataSource";
import { Booking } from "../../db/entities/Booking";
import { Passenger } from "../../db/entities/Passenger";
import { IdempotencyKey } from "../../db/entities/IdempotencyKey";
import {
  getOrCreateIdempotencyKey,
  hashObject,
} from "../../services/idempotency";
import { BookingOrchestrationService } from "../../services/bookingOrchestrationService";
import { stripe, stripeWebhookSecret } from "../../services/stripe";
import {
  submitSignedSorobanXdr,
  getTransactionStatus,
} from "../../services/soroban";
import { withRetries } from "../../services/retry";
import { getWebSocketServer } from "../../websockets/server";
import { logger } from "../../utils/logger";
import { baggageService, RESTRICTION_NOTES } from "../../services/baggageService";

const router = Router();

// IATA name format: letters, spaces, hyphens, and apostrophes only
const iatanameRegex = /^[A-Za-z\s'\-]+$/;
const nameField = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .max(100, `${label} must be 100 characters or fewer`)
    .trim()
    .regex(iatanameRegex, `${label} may only contain letters, spaces, hyphens, and apostrophes`);

const passengerSchema = z.object({
  email: z.string().email(),
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
  middleName: z.string().optional(),
  title: z.string().optional(),
  suffix: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  phone: z.string().min(4).optional(),
  sorobanAddress: z.string().min(1),
});

const passengerUpdateSchema = z.object({
  email: z.string().email().optional(),
  firstName: nameField("First name").optional(),
  lastName: nameField("Last name").optional(),
  middleName: z.string().optional(),
  title: z.string().optional(),
  suffix: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  phone: z.string().min(4).optional(),
  sorobanAddress: z.string().min(1).optional(),
});

const nameCorrectionSchema = z.object({
  correctedName: z.object({
    title: z.string().optional(),
    firstName: nameField("First name"),
    middleName: z.string().optional(),
    lastName: nameField("Last name"),
    suffix: z.string().optional(),
  }),
  reason: z.string().min(10),
});

const documentVerificationSchema = z.object({
  documentType: z.enum(['passport', 'national_id', 'drivers_license', 'visa', 'residence_permit', 'other']),
  documentNumber: z.string().min(1),
});

const correctionApprovalSchema = z.object({
  reviewedBy: z.string().min(1),
});

const correctionRejectionSchema = z.object({
  reason: z.string().min(5),
});

const createBookingSchema = z.object({
  flightId: z.string().uuid(),
  passenger: passengerSchema,
});

import { BadRequestError, NotFoundError, ConflictError, InternalServerError } from "../../utils/errors";

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const idempotencyKeyHeader = req.header("Idempotency-Key");
    if (!idempotencyKeyHeader) {
      throw new BadRequestError("Missing Idempotency-Key header");
    }

    const requestHash = hashObject(parsed.data);

    const bookingRepo = AppDataSource.getRepository(Booking);
    const idempotencyRepo = AppDataSource.getRepository(IdempotencyKey);

    const idem = await getOrCreateIdempotencyKey({
      key: idempotencyKeyHeader,
      method: req.method,
      path: req.baseUrl + req.path,
      requestHash,
    });

    if (idem.requestHash !== requestHash) {
      throw new ConflictError("Idempotency key reuse with different payload");
    }

    if (idem.resourceId) {
      const existing = await bookingRepo.findOne({
        where: { id: idem.resourceId },
      });
      if (existing) {
        return res
          .status(200)
          .json({ success: true, data: existing, idempotent: true });
      }
    }

    try {
      const orchestrationService = new BookingOrchestrationService();
      const booking = await orchestrationService.createBooking({
        flightId: parsed.data.flightId,
        passenger: parsed.data.passenger,
        idempotencyKey: idempotencyKeyHeader,
      });

      // Update idempotency key with resource ID
      idem.resourceId = booking.id;
      await idempotencyRepo.save(idem);

      return res.status(201).json({
        success: true,
        data: booking,
      });
    } catch (error: any) {
      logger.error("Booking creation failed", { error: error.message });
      
      if (error.message === "Flight not found") {
        throw new NotFoundError(error.message);
      }
      throw new ConflictError(error.message || "Booking failed");
    }
  }),
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }
    return res.json({ success: true, data: booking });
  }),
);

router.post(
  "/:id/submit-onchain",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({ signedXdr: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error");
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    if (booking.status !== "paid" && booking.status !== "onchain_pending") {
      throw new ConflictError("Booking not ready for on-chain submission");
    }

    booking.status = "onchain_pending";
    await bookingRepo.save(booking);

    const result = await withRetries(
      async () => {
        const r = await submitSignedSorobanXdr(parsed.data.signedXdr);
        return r;
      },
      { retries: 3, baseDelayMs: 300 },
    );

    booking.sorobanTxHash = result.txHash;
    booking.status = "onchain_submitted";
    booking.contractSubmitAttempts = (booking.contractSubmitAttempts || 0) + 1;
    await bookingRepo.save(booking);

    return res
      .status(202)
      .json({ success: true, data: booking, soroban: result });
  }),
);

// req.body is a raw Buffer here because app.ts registers express.raw() for this path before express.json()
router.post(
  "/webhook/stripe",
  asyncHandler(async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    if (!stripeWebhookSecret) {
      throw new InternalServerError("Stripe webhook secret not configured");
    }
    if (!sig || typeof sig !== "string") {
      throw new BadRequestError("Missing stripe-signature header");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        stripeWebhookSecret,
      );
    } catch (err: any) {
      throw new BadRequestError(err.message || "Invalid signature");
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as any;
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = await bookingRepo.findOne({
        where: { stripePaymentIntentId: intent.id },
      });
      if (booking) {
        booking.status = "paid";
        await bookingRepo.save(booking);
        try {
          const ws = getWebSocketServer();
          ws.broadcastBookingStatus(booking.id, booking.status);
        } catch (e) {
          logger.warn(
            "WebSocket server not ready - skipping booking status broadcast",
          );
        }
      }
    }

    return res.json({ received: true });
  }),
);

router.get(
  "/:id/transaction-status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id } });

    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    if (!booking.sorobanTxHash) {
      return res.json({
        success: true,
        data: {
          bookingStatus: booking.status,
          transactionStatus: null,
        },
      });
    }

    const txStatus = await getTransactionStatus(booking.sorobanTxHash);

    if (txStatus.status === "success" && booking.status !== "confirmed") {
      booking.status = "confirmed";
      if (txStatus.result) {
        booking.sorobanBookingId = txStatus.result.bookingId || null;
      }
      await bookingRepo.save(booking);
      try {
        const ws = getWebSocketServer();
        ws.broadcastBookingStatus(booking.id, booking.status);
      } catch (e) {
        logger.warn(
          "WebSocket server not ready - skipping booking status broadcast",
        );
      }
    } else if (txStatus.status === "failed" && booking.status !== "failed") {
      booking.status = "failed";
      booking.lastError = txStatus.error || "Transaction failed";
      await bookingRepo.save(booking);
      try {
        const ws = getWebSocketServer();
        ws.broadcastBookingStatus(booking.id, booking.status);
      } catch (e) {
        logger.warn(
          "WebSocket server not ready - skipping booking status broadcast",
        );
      }
    }

    return res.json({
      success: true,
      data: {
        bookingStatus: booking.status,
        transactionStatus: txStatus,
      },
    });
  }),
);

router.patch(
  "/:id/passengers/:passengerId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = passengerUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passenger = await passengerRepo.findOne({ where: { id: req.params.passengerId } });
    if (!passenger) {
      throw new NotFoundError("Passenger not found");
    }

    Object.assign(passenger, parsed.data);
    await passengerRepo.save(passenger);

    return res.json({ success: true, data: passenger });
  }),
);

router.post(
  "/:id/passengers/:passengerId/correct-name",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = nameCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passenger = await passengerRepo.findOne({ where: { id: req.params.passengerId } });
    if (!passenger) {
      throw new NotFoundError("Passenger not found");
    }

    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.requestNameCorrection(
      req.params.id,
      req.params.passengerId,
      parsed.data.correctedName,
      parsed.data.reason,
    );

    return res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/correct-name/:correctionId/approve",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = correctionApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.approveNameCorrection(
      req.params.correctionId,
      parsed.data.reviewedBy,
    );

    return res.json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/correct-name/:correctionId/reject",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = correctionRejectionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.rejectNameCorrection(
      req.params.correctionId,
      parsed.data.reason,
    );

    return res.json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/verify-document",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = documentVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.verifyAgainstDocument(
      req.params.passengerId,
      parsed.data.documentType,
      parsed.data.documentNumber,
    );

    return res.json({ success: true, data: result });
  }),
);

router.get(
  "/:id/passengers/:passengerId/name-history",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const history = orchestrationService.getPassengerNameHistory(
      req.params.id,
      req.params.passengerId,
    );

    return res.json({ success: true, data: history });
  }),
);

router.get(
  "/:id/passengers/:passengerId/name-change-fee",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const isMinor = req.query.minor === "true";
    const orchestrationService = new BookingOrchestrationService();
    const fee = orchestrationService.calculateNameChangeFee(req.params.id, isMinor);

    return res.json({ success: true, data: fee });
  }),
);

router.get(
  "/:id/fare-rules",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const rules = await orchestrationService.getBookingFareRules(req.params.id);
    return res.json({ success: true, data: rules });
  }),
);

const changeFeeQuerySchema = z.object({
  newDate: z.string().min(1, "newDate query parameter is required"),
});

router.get(
  "/:id/change-fee",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = changeFeeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }
    const orchestrationService = new BookingOrchestrationService();
    const quote = await orchestrationService.calculateBookingChangeFee(
      req.params.id,
      parsed.data.newDate,
    );
    return res.json({ success: true, data: quote });
  }),
);

router.get(
  "/:id/cancellation-refund",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const refund = await orchestrationService.calculateBookingCancellationRefund(req.params.id);
    return res.json({ success: true, data: refund });
  }),
);

router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.processCancellation(req.params.id);
    return res.json({ success: true, data: result });
  }),
);

const upgradeQuerySchema = z.object({
  targetClass: z.enum(["economy", "premium_economy", "business", "first"]),
});

router.get(
  "/:id/upgrade-price",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = upgradeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }
    const orchestrationService = new BookingOrchestrationService();
    const quote = await orchestrationService.calculateUpgradePrice(
      req.params.id,
      parsed.data.targetClass,
    );
    return res.json({ success: true, data: quote });
  }),
);

router.post(
  "/:id/upgrade",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = upgradeQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.processUpgrade(
      req.params.id,
      parsed.data.targetClass,
    );
    return res.json({ success: true, data: result });
  }),
);

const baggageQuerySchema = z.object({
  class: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  bags: z.coerce.number().int().min(0).max(10).optional(),
  heaviestBagKg: z.coerce.number().min(0).max(100).optional(),
});

/**
 * GET /bookings/:id/baggage-allowance (issue #387)
 * Returns the checked/carry-on baggage allowance for a booking, based on
 * its flight's airline and a cabin class (the booking record itself has
 * no stored cabin class, so it defaults to economy — pass ?class= to
 * preview the allowance for a different class, e.g. before upgrading).
 * When bags/heaviestBagKg are supplied, also returns the excess fee.
 */
router.get(
  "/:id/baggage-allowance",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = baggageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Invalid query parameters", parsed.error.flatten());
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    const cabinClass = parsed.data.class ?? "economy";
    const airlineCode = booking.flight?.airlineCode ?? "";

    if (parsed.data.bags !== undefined && parsed.data.heaviestBagKg !== undefined) {
      const result = baggageService.calculateExcessFee(
        airlineCode,
        cabinClass,
        parsed.data.bags,
        parsed.data.heaviestBagKg,
      );
      return res.json({
        success: true,
        data: { ...result, cabinClass, restrictions: RESTRICTION_NOTES },
      });
    }

    const allowance = baggageService.getAllowance(airlineCode, cabinClass);
    return res.json({
      success: true,
      data: { allowance, cabinClass, restrictions: RESTRICTION_NOTES },
    });
  }),
);

export const bookingRoutes = router;
