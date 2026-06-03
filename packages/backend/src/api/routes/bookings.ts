import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { AppDataSource } from "../../db/dataSource";
import { Booking } from "../../db/entities/Booking";
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

const router = Router();

const passengerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(4).optional(),
  sorobanAddress: z.string().min(1),
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

export const bookingRoutes = router;
