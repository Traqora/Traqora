import { Router, Request, Response } from "express";
import { z } from "zod";
import { passengerNameField as nameField, passengerSchema } from "../schemas";
import { requireAuth } from "../../middleware/authMiddleware";
import { requireAdmin } from "../../middleware/adminAuth";
import { validateBody, validateParams, validateQuery } from "../../middleware/requestValidation";
import { getBookingForRequester, assertPassengerBelongsToBooking } from "../../middleware/bookingAccess";
import { asyncHandler } from "../../utils/errorHandler";
import { AppDataSource } from "../../db/dataSource";
import { Booking } from "../../db/entities/Booking";
import { Passenger } from "../../db/entities/Passenger";
import { IdempotencyKey } from "../../db/entities/IdempotencyKey";
import {
  getOrCreateIdempotencyKey,
  hashObject,
} from "../../services/idempotency";
import {
  assertCancellationConfirmation,
  CANCELLATION_TERMS_VERSION,
} from "../../services/cancellationConfirmation";
import { runOnceByIdempotencyKey } from "../../services/cancellationIdempotency";
import { checkoutRateLimiter } from "../../middleware/highRiskRateLimit";
import { BookingOrchestrationService } from "../../services/bookingOrchestrationService";
import { getStripe, stripeWebhookSecret } from "../../services/stripe";
import { submitSignedSorobanXdr } from "../../services/soroban";
import { confirmBookingTx } from "../../services/bookingConfirmRetry";
import { withRetries } from "../../services/retry";
import { getWebSocketServer } from "../../websockets/server";
import { logger } from "../../utils/logger";
import { baggageService, RESTRICTION_NOTES } from "../../services/baggageService";
import {
  specialAssistanceService,
  mapPassengerToRequest,
} from "../../services/specialAssistanceService";
import type { SpecialAssistanceRequest } from "../../types/specialAssistance";
import { bookingRateLimit, excludingPaths } from "../../middleware/rate-limit-tiers";
import { buildItineraryCalendar } from "../../services/itineraryCalendar";
import { BadRequestError, NotFoundError, ConflictError, InternalServerError } from "../../utils/errors";

const router = Router();

// Per-tier booking rate limiting (#550), applied to every route on this
// router except the Stripe webhook.
router.use(asyncHandler(excludingPaths(bookingRateLimit, ["/webhook/stripe"])));

const passengerUpdateSchema = z
  .object({
    email: z.string().email().max(256).optional(),
    firstName: nameField("First name").optional(),
    lastName: nameField("Last name").optional(),
    middleName: z.string().max(100).optional(),
    title: z.string().max(32).optional(),
    suffix: z.string().max(32).optional(),
    dateOfBirth: z.string().max(32).optional(),
    nationality: z.string().max(64).optional(),
    phone: z.string().min(4).max(32).optional(),
    sorobanAddress: z.string().min(1).max(128).optional(),
  })
  .strict();

const correctedNameSchema = z
  .object({
    title: z.string().max(32).optional(),
    firstName: nameField("First name"),
    middleName: z.string().max(100).optional(),
    lastName: nameField("Last name"),
    suffix: z.string().max(32).optional(),
  })
  .strict();

const nameCorrectionSchema = z
  .object({
    correctedName: correctedNameSchema,
    reason: z.string().min(10).max(1000),
  })
  .strict();

const documentVerificationSchema = z
  .object({
    documentType: z.enum(["passport", "national_id", "drivers_license", "visa", "residence_permit", "other"]),
    documentNumber: z.string().min(1).max(128),
  })
  .strict();

const correctionApprovalSchema = z
  .object({
    reviewedBy: z.string().min(1).max(256),
  })
  .strict();

const correctionRejectionSchema = z
  .object({
    reason: z.string().min(5).max(1000),
  })
  .strict();

const createBookingSchema = z
  .object({
    flightId: z.string().uuid(),
    passenger: passengerSchema.strict(),
    passengers: z
      .array(
        z
          .object({
            id: z.string().max(128).optional(),
            dateOfBirth: z.string().min(1).max(32),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    sessionExpiresAt: z.string().min(1).max(64).optional(),
    offerExpiresAt: z.string().min(1).max(64).optional(),
    refreshPath: z.string().min(1).max(512).optional(),
    lastTicketingDate: z.string().min(1).max(64).optional(),
    lastTicketingDateTime: z.string().min(1).max(64).optional(),
    providerOfferId: z.string().min(1).max(256).optional(),
    // Checkout reprice gate (#1189): the confirmed provider total and the
    // traveler's explicit acceptance are passed through to the orchestrator so
    // a changed price stops before payment capture.
    confirmedProviderPriceCents: z.number().int().positive().optional(),
    repriceAccepted: z.boolean().optional(),
  })
  .strict();

const bookingIdParamSchema = z.object({ id: z.string().uuid() }).strict();
const bookingPassengerParamsSchema = z.object({ id: z.string().uuid(), passengerId: z.string().uuid() }).strict();
const bookingPassengerCorrectionParamsSchema = z
  .object({ id: z.string().uuid(), passengerId: z.string().uuid(), correctionId: z.string().uuid() })
  .strict();
const groupIdParamSchema = z.object({ id: z.string().uuid() }).strict();
const submitOnchainBodySchema = z.object({ signedXdr: z.string().min(1).max(200000) }).strict();
const emptyBodySchema = z.object({}).strict();

router.post(
  "/",
  checkoutRateLimiter,
  requireAuth,
  validateBody(createBookingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createBookingSchema>;

    const idempotencyKeyHeader = req.header("Idempotency-Key");
    if (!idempotencyKeyHeader || idempotencyKeyHeader.length > 128) {
      throw new BadRequestError("Idempotency-Key header is required and must be at most 128 characters");
    }

    const requestHash = hashObject({
      flightId: body.flightId,
      passenger: body.passenger,
      walletAddress: req.user?.walletAddress,
      ...(body.passengers ? { passengers: body.passengers } : {}),
      ...(body.sessionExpiresAt ? { sessionExpiresAt: body.sessionExpiresAt } : {}),
      ...(body.offerExpiresAt ? { offerExpiresAt: body.offerExpiresAt } : {}),
      ...(body.refreshPath ? { refreshPath: body.refreshPath } : {}),
      ...(body.lastTicketingDate ? { lastTicketingDate: body.lastTicketingDate } : {}),
      ...(body.lastTicketingDateTime ? { lastTicketingDateTime: body.lastTicketingDateTime } : {}),
      providerOfferId: body.providerOfferId,
      ...(body.confirmedProviderPriceCents !== undefined
        ? { confirmedProviderPriceCents: body.confirmedProviderPriceCents }
        : {}),
      ...(body.repriceAccepted !== undefined
        ? { repriceAccepted: body.repriceAccepted }
        : {}),
    });

    const bookingRepo = AppDataSource.getRepository(Booking);
    const idempotencyRepo = AppDataSource.getRepository(IdempotencyKey);

    const idem = await getOrCreateIdempotencyKey({
      key: idempotencyKeyHeader,
      method: "POST",
      path: "/api/v1/bookings",
      requestHash,
    });

    if (
      idem.method !== "POST" ||
      idem.path !== "/api/v1/bookings" ||
      idem.requestHash !== requestHash
    ) {
      throw new ConflictError("Idempotency key reuse with different request");
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

    if (
      req.user?.walletAddress &&
      body.passenger.sorobanAddress !== req.user.walletAddress
    ) {
      throw new BadRequestError(
        "passenger.sorobanAddress must match authenticated wallet",
      );
    }

    try {
      const orchestrationService = new BookingOrchestrationService();
      const booking = await orchestrationService.createBooking({
        flightId: body.flightId,
        passenger: body.passenger,
        idempotencyKey: idempotencyKeyHeader,
        walletAddress: req.user?.walletAddress,
        passengers: body.passengers,
        sessionExpiresAt: body.sessionExpiresAt,
        offerExpiresAt: body.offerExpiresAt,
        refreshPath: body.refreshPath,
        lastTicketingDate: body.lastTicketingDate,
        lastTicketingDateTime: body.lastTicketingDateTime,
        providerOfferId: body.providerOfferId,
        confirmedProviderPriceCents: body.confirmedProviderPriceCents,
        repriceAccepted: body.repriceAccepted,
      });

      idem.resourceId = booking.id;
      await idempotencyRepo.save(idem);

      return res.status(201).json({
        success: true,
        data: booking,
        payment: {
          paymentIntentId: (booking as any).stripePaymentIntentId ?? null,
          clientSecret: (booking as any).stripeClientSecret ?? null,
        },
        soroban: {
          unsignedXdr: (booking as any).sorobanUnsignedXdr ?? null,
        },
      });
    } catch (error: any) {
      logger.error("Booking creation failed", { error: error.message });

      if (typeof error?.statusCode === "number" && typeof error?.code === "string") {
        throw error;
      }
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
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    return res.json({ success: true, data: booking });
  }),
);

router.get(
  "/:id/itinerary.ics",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const calendar = buildItineraryCalendar(booking);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="traqora-${booking.id}.ics"`);
    return res.status(200).send(calendar);
  }),
);

router.post(
  "/:id/submit-onchain",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateBody(submitOnchainBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id }, relations: ["passenger", "flight"] });
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    if (booking.status !== "paid" && booking.status !== "onchain_pending") {
      throw new ConflictError("Booking not ready for on-chain submission");
    }

    booking.status = "onchain_pending";
    await bookingRepo.save(booking);

    const result = await withRetries(
      async () => submitSignedSorobanXdr((req.body as { signedXdr: string }).signedXdr),
      { retries: 3, baseDelayMs: 300 },
    );

    booking.sorobanTxHash = result.txHash;
    booking.sorobanInnerTxHash = result.innerTxHash;
    booking.sorobanFeeBumpTxHash = result.feeBumpTxHash ?? null;
    booking.sorobanIsFeeBump = result.isFeeBump;
    booking.status = "onchain_submitted";
    booking.contractSubmitAttempts = (booking.contractSubmitAttempts || 0) + 1;
    booking.confirmationAttempts = 0;
    booking.confirmationNextAttemptAt = null;
    await bookingRepo.save(booking);

    return res.status(202).json({ success: true, data: booking, soroban: result });
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
      event = getStripe().webhooks.constructEvent(
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
          logger.warn("WebSocket server not ready - skipping booking status broadcast");
        }
      }
    }

    return res.json({ received: true });
  }),
);

router.get(
  "/:id/transaction-status",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.id }, relations: ["passenger", "flight"] });

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

    const { outcome, changed, booking: updated, transactionStatus: txStatus } =
      await confirmBookingTx(booking.id);

    if (changed) {
      try {
        const ws = getWebSocketServer();
        ws.broadcastBookingStatus(updated.id, updated.status);
      } catch (e) {
        logger.warn("WebSocket server not ready - skipping booking status broadcast");
      }
    }

    return res.json({
      success: true,
      data: {
        bookingStatus: updated.status,
        transactionStatus: txStatus,
        confirmOutcome: outcome,
      },
    });
  }),
);

router.patch(
  "/:id/passengers/:passengerId",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  validateBody(passengerUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new BadRequestError("Validation error");
    }
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passenger = await passengerRepo.findOne({ where: { id: req.params.passengerId } });
    if (!passenger) {
      throw new NotFoundError("Passenger not found");
    }

    Object.assign(passenger, req.body);
    await passengerRepo.save(passenger);

    return res.json({ success: true, data: passenger });
  }),
);

router.post(
  "/:id/passengers/:passengerId/correct-name",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  validateBody(nameCorrectionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const body = req.body as z.infer<typeof nameCorrectionSchema>;
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.requestNameCorrection(
      req.params.id,
      req.params.passengerId,
      body.correctedName,
      body.reason,
    );
    return res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/correct-name/:correctionId/approve",
  requireAdmin,
  validateParams(bookingPassengerCorrectionParamsSchema),
  validateBody(correctionApprovalSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.approveNameCorrection(
      req.params.correctionId,
      (req.body as { reviewedBy: string }).reviewedBy,
    );
    return res.json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/correct-name/:correctionId/reject",
  requireAdmin,
  validateParams(bookingPassengerCorrectionParamsSchema),
  validateBody(correctionRejectionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.rejectNameCorrection(
      req.params.correctionId,
      (req.body as { reason: string }).reason,
    );
    return res.json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/verify-document",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  validateBody(documentVerificationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const orchestrationService = new BookingOrchestrationService();
    const body = req.body as z.infer<typeof documentVerificationSchema>;
    const result = await orchestrationService.verifyAgainstDocument(
      req.params.passengerId,
      body.documentType,
      body.documentNumber,
    );
    return res.json({ success: true, data: result });
  }),
);

router.get(
  "/:id/passengers/:passengerId/name-history",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const orchestrationService = new BookingOrchestrationService();
    const history = orchestrationService.getPassengerNameHistory(
      req.params.id,
      req.params.passengerId,
    );
    return res.json({ success: true, data: history });
  }),
);

const nameChangeFeeQuerySchema = z.object({ minor: z.enum(["true", "false"]).optional() }).strict();

router.get(
  "/:id/passengers/:passengerId/name-change-fee",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  validateQuery(nameChangeFeeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const isMinor = req.query.minor === "true";
    const orchestrationService = new BookingOrchestrationService();
    const fee = orchestrationService.calculateNameChangeFee(req.params.id, isMinor);
    return res.json({ success: true, data: fee });
  }),
);

router.get(
  "/:id/fare-rules",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const rules = await orchestrationService.getBookingFareRules(req.params.id);
    return res.json({ success: true, data: rules });
  }),
);

router.get(
  "/:id/fare-rules/parsed",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.getBookingFareRulesWithParsing(req.params.id);
    return res.json({ success: true, data: result });
  }),
);

router.get(
  "/:id/change-fee-tiers",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const tiers = await orchestrationService.getChangeFeeTiers(req.params.id);
    return res.json({ success: true, data: tiers });
  }),
);

router.get(
  "/:id/cancellation-tiers",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const tiers = await orchestrationService.getCancellationTiers(req.params.id);
    return res.json({ success: true, data: tiers });
  }),
);

const changeFlightSchema = z
  .object({
    newFlightId: z.string().uuid("Must be a valid flight UUID"),
  })
  .strict();

router.post(
  "/:id/change-quote",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateBody(changeFlightSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const quote = await orchestrationService.calculateBookingChangeFeeWithFlight(
      req.params.id,
      (req.body as { newFlightId: string }).newFlightId,
    );
    return res.json({ success: true, data: quote });
  }),
);

const changeFeeQuerySchema = z
  .object({
    newDate: z.string().min(1).max(64),
  })
  .strict();

router.get(
  "/:id/change-fee",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateQuery(changeFeeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const quote = await orchestrationService.calculateBookingChangeFee(
      req.params.id,
      String(req.query.newDate),
    );
    return res.json({ success: true, data: quote });
  }),
);

router.get(
  "/:id/cancellation-refund",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const refund = await orchestrationService.calculateBookingCancellationRefund(req.params.id);
    return res.json({ success: true, data: refund });
  }),
);

const cancelBookingSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: "Explicit cancellation confirmation is required" }),
  }),
  termsVersion: z.literal(CANCELLATION_TERMS_VERSION),
  expectedNetRefundCents: z.number().int().nonnegative(),
});

router.post(
  "/:id/cancel",
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const parsed = cancelBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      throw new BadRequestError("Missing Idempotency-Key header");
    }

    const orchestrationService = new BookingOrchestrationService();
    const quote = await orchestrationService.calculateBookingCancellationRefund(
      req.params.id,
    );
    assertCancellationConfirmation(quote, parsed.data);

    const requestHash = hashObject({ bookingId: req.params.id, ...parsed.data });
    const idempotencyRepo = AppDataSource.getRepository(IdempotencyKey);
    const { result, idempotent } = await runOnceByIdempotencyKey(
      idempotencyRepo,
      {
        key: idempotencyKey,
        method: req.method,
        path: req.baseUrl + req.path,
        requestHash,
      },
      () => orchestrationService.processCancellation(req.params.id),
    );

    return res.json({ success: true, data: result, idempotent });
  }),
);

const upgradeQuerySchema = z
  .object({
    targetClass: z.enum(["economy", "premium_economy", "business", "first"]),
  })
  .strict();

router.get(
  "/:id/upgrade-price",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateQuery(upgradeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const quote = await orchestrationService.calculateUpgradePrice(
      req.params.id,
      String(req.query.targetClass) as any,
    );
    return res.json({ success: true, data: quote });
  }),
);

router.post(
  "/:id/upgrade",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateBody(upgradeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.processUpgrade(
      req.params.id,
      (req.body as { targetClass: string }).targetClass as any,
    );
    return res.json({ success: true, data: result });
  }),
);

// Group booking endpoints (authenticated, validated; organizer-scoped access)
const createGroupBookingSchema = z
  .object({
    groupName: z.string().min(1).max(255),
    flightId: z.string().uuid(),
    organizerEmail: z.string().email().max(256),
    memberEmails: z.array(z.string().email().max(256)).min(1).max(50),
    splitMethod: z.enum(["equal", "custom", "percentage"]).default("equal"),
    splitConfig: z.record(z.number().finite().min(0).max(1_000_000_000)).optional(),
    corporateAccountId: z.string().uuid().optional(),
    costCenter: z.string().max(128).optional(),
    department: z.string().max(128).optional(),
    bookingPolicyId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const groupCheckInSchema = z
  .object({
    seatAllocations: z.record(z.string().max(32)).optional(),
  })
  .strict();

async function getGroupBookingForRequester(groupBookingId: string, req: Request) {
  const walletAddress = req.user?.walletAddress;
  if (!walletAddress) {
    throw new NotFoundError("Group booking not found");
  }
  const orchestrationService = new BookingOrchestrationService();
  const groupBooking = await orchestrationService.getGroupBooking(groupBookingId);
  if (!groupBooking) {
    throw new NotFoundError("Group booking not found");
  }
  const organizer = (groupBooking as any).organizerWalletAddress;
  if (!organizer || organizer !== walletAddress) {
    throw new NotFoundError("Group booking not found");
  }
  return groupBooking;
}

router.post(
  "/group",
  requireAuth,
  validateBody(createGroupBookingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrationService = new BookingOrchestrationService();
    const body = req.body as z.infer<typeof createGroupBookingSchema> & {
      organizerWalletAddress?: string;
    };
    const groupBooking = await orchestrationService.createGroupBooking({
      ...body,
      organizerWalletAddress: req.user!.walletAddress,
    });
    return res.status(201).json({ success: true, data: groupBooking });
  }),
);

router.post(
  "/:id/group-checkin",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateBody(groupCheckInSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getGroupBookingForRequester(req.params.id, req);
    const orchestrationService = new BookingOrchestrationService();
    const result = await orchestrationService.groupCheckIn(
      req.params.id,
      (req.body as { seatAllocations?: Record<string, string> }).seatAllocations,
    );
    return res.json({ success: true, data: result });
  }),
);

router.get(
  "/group/:id",
  requireAuth,
  validateParams(groupIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const groupBooking = await getGroupBookingForRequester(req.params.id, req);
    return res.json({ success: true, data: groupBooking });
  }),
);

const baggageQuerySchema = z
  .object({
    class: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
    bags: z.coerce.number().int().min(0).max(10).optional(),
    heaviestBagKg: z.coerce.number().min(0).max(100).optional(),
  })
  .strict();

router.get(
  "/:id/baggage-allowance",
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateQuery(baggageQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await getBookingForRequester(req.params.id, req, ["passenger", "flight"]);
    const cabinClass = (req.query.class as string | undefined) ?? "economy";
    const airlineCode = booking.flight?.airlineCode ?? "";
    const bags = req.query.bags !== undefined ? Number(req.query.bags) : undefined;
    const heaviestBagKg = req.query.heaviestBagKg !== undefined ? Number(req.query.heaviestBagKg) : undefined;

    if (bags !== undefined && heaviestBagKg !== undefined) {
      const result = baggageService.calculateExcessFee(airlineCode, cabinClass as any, bags, heaviestBagKg);
      return res.json({ success: true, data: { ...result, cabinClass, restrictions: RESTRICTION_NOTES } });
    }

    const allowance = baggageService.getAllowance(airlineCode, cabinClass as any);
    return res.json({ success: true, data: { allowance, cabinClass, restrictions: RESTRICTION_NOTES } });
  }),
);

const wheelchairSchema = z
  .object({
    type: z.enum(["ramp", "boarding", "cabin", "stretcher"]),
    notes: z.string().max(500).optional(),
  })
  .strict();

const medicalOxygenSchema = z
  .object({
    type: z.enum(["portable_concentrator", "cylinder"]),
    flowRateLpm: z.number().int().positive().max(15).optional(),
    quantity: z.number().int().positive().max(10).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

const specialMealSchema = z
  .object({
    mealType: z.string().min(2).max(10),
    notes: z.string().max(500).optional(),
  })
  .strict();

const serviceAnimalSchema = z
  .object({
    animalType: z.enum(["guide_dog", "hearing_dog", "emotional_support", "psychiatric", "other"]),
    breed: z.string().max(100).optional(),
    weightKg: z.number().int().positive().max(200).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

const accessibilityPreferenceSchema = z
  .object({
    priorityBoarding: z.boolean().default(false),
    extraLegroomPreferred: z.boolean().default(false),
    bulkheadSeatRequired: z.boolean().default(false),
    aisleChairRequired: z.boolean().default(false),
    deafOrHardOfHearing: z.boolean().default(false),
    blindOrLowVision: z.boolean().default(false),
    cognitiveAssistance: z.boolean().default(false),
    notes: z.string().max(1000).optional(),
  })
  .strict();

const specialAssistanceSchema = z
  .object({
    requiresWheelchair: z.boolean().default(false),
    wheelchair: wheelchairSchema.optional(),
    requiresMedicalOxygen: z.boolean().default(false),
    medicalOxygen: medicalOxygenSchema.optional(),
    specialMeal: z.boolean().default(false),
    meal: specialMealSchema.optional(),
    hasServiceAnimal: z.boolean().default(false),
    serviceAnimal: serviceAnimalSchema.optional(),
    accessibilityNeeds: accessibilityPreferenceSchema.optional(),
    otherNeeds: z.string().max(2000).optional(),
  })
  .strict();

router.put(
  "/:id/passengers/:passengerId/special-assistance",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  validateBody(specialAssistanceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const request = req.body as SpecialAssistanceRequest;
    const validationErrors = specialAssistanceService.validateAssistanceRequest(request);
    if (validationErrors.length > 0) {
      throw new BadRequestError("Invalid assistance request", validationErrors);
    }

    const result = await specialAssistanceService.updateAssistance(
      req.params.id,
      req.params.passengerId,
      request,
    );

    res.json({
      success: true,
      data: {
        assistance: mapPassengerToRequest(result.passenger),
        notification: result.notification,
      },
    });
  }),
);

router.get(
  "/:id/passengers/:passengerId/special-assistance",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { booking } = await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passenger = await passengerRepo.findOne({ where: { id: req.params.passengerId } });
    if (!passenger || booking.passenger.id !== passenger.id) throw new NotFoundError("Passenger not found");

    const result = await specialAssistanceService.getAssistance(passenger);
    res.json({ success: true, data: result });
  }),
);

router.post(
  "/:id/passengers/:passengerId/special-assistance/validate",
  requireAuth,
  validateParams(bookingPassengerParamsSchema),
  validateBody(specialAssistanceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertPassengerBelongsToBooking(req.params.id, req.params.passengerId, req);
    const errors = specialAssistanceService.validateAssistanceRequest(req.body as SpecialAssistanceRequest);
    res.json({ success: true, data: { valid: errors.length === 0, errors } });
  }),
);

export const bookingRoutes = router;
