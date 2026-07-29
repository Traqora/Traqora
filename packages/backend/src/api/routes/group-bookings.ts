import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { GroupBookingService } from '../../services/group-booking';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();
const groupBookingService = GroupBookingService.getInstance();

// Create group booking schema
const createGroupBookingSchema = z.object({
  groupName: z.string().min(1).max(255),
  flightId: z.string().uuid(),
  organizerEmail: z.string().email(),
  organizerWalletAddress: z.string().optional(),
  memberEmails: z.array(z.string().email()).min(1),
  splitMethod: z.enum(['equal', 'custom', 'percentage']).default('equal'),
  splitConfig: z.record(z.number()).optional(),
  notes: z.string().optional(),
});

// Invite members schema
const inviteMembersSchema = z.object({
  memberEmails: z.array(z.string().email()).min(1),
  customMessage: z.string().optional(),
});

// Update split method schema
const updateSplitSchema = z.object({
  splitMethod: z.enum(['equal', 'custom', 'percentage']),
  splitConfig: z.record(z.number()).optional(),
});

// Accept invitation schema
const acceptInvitationSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  stellarAddress: z.string().optional(),
});

// Process payment schema
const processPaymentSchema = z.object({
  memberId: z.string().uuid(),
  paymentAmountCents: z.number().int().positive(),
});

/**
 * POST /api/v1/group-bookings
 * Create a new group booking
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createGroupBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const groupBooking = await groupBookingService.createGroupBooking(parsed.data);

      logger.info(`Group booking created: ${groupBooking.id}`);

      return res.status(201).json({
        success: true,
        data: groupBooking,
      });
    } catch (error: any) {
      logger.error('Failed to create group booking', error);
      throw new BadRequestError(error.message || 'Failed to create group booking');
    }
  })
);

/**
 * GET /api/v1/group-bookings/:id
 * Get group booking by ID
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const groupBooking = await groupBookingService.getGroupBooking(req.params.id);

    if (!groupBooking) {
      throw new NotFoundError('Group booking not found');
    }

    return res.json({
      success: true,
      data: groupBooking,
    });
  })
);

/**
 * GET /api/v1/group-bookings/invite/:token
 * Get group booking by invite token
 */
router.get(
  '/invite/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await groupBookingService.getGroupBookingByToken(req.params.token);

    if (!result) {
      throw new NotFoundError('Invalid or expired invitation token');
    }

    return res.json({
      success: true,
      data: {
        group: result.group,
        member: result.member,
      },
    });
  })
);

/**
 * POST /api/v1/group-bookings/:id/invite
 * Invite members to a group booking
 */
router.post(
  '/:id/invite',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = inviteMembersSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const groupBooking = await groupBookingService.inviteMembers({
        groupBookingId: req.params.id,
        memberEmails: parsed.data.memberEmails,
        customMessage: parsed.data.customMessage,
      });

      return res.json({
        success: true,
        data: groupBooking,
      });
    } catch (error: any) {
      logger.error('Failed to invite members', error);
      throw new BadRequestError(error.message || 'Failed to invite members');
    }
  })
);

/**
 * POST /api/v1/group-bookings/invite/:token/accept
 * Accept a group booking invitation
 */
router.post(
  '/invite/:token/accept',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = acceptInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const member = await groupBookingService.acceptInvitation(
        req.params.token,
        parsed.data
      );

      return res.json({
        success: true,
        data: member,
      });
    } catch (error: any) {
      logger.error('Failed to accept invitation', error);
      throw new BadRequestError(error.message || 'Failed to accept invitation');
    }
  })
);

/**
 * PUT /api/v1/group-bookings/:id/split
 * Update split method for a group booking
 */
router.put(
  '/:id/split',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const groupBooking = await groupBookingService.updateSplitMethod(
        req.params.id,
        parsed.data
      );

      return res.json({
        success: true,
        data: groupBooking,
      });
    } catch (error: any) {
      logger.error('Failed to update split method', error);
      throw new BadRequestError(error.message || 'Failed to update split method');
    }
  })
);

/**
 * POST /api/v1/group-bookings/:id/payment
 * Process payment for a group member
 */
router.post(
  '/:id/payment',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = processPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const groupBooking = await groupBookingService.processMemberPayment(
        req.params.id,
        parsed.data.memberId,
        parsed.data.paymentAmountCents
      );

      return res.json({
        success: true,
        data: groupBooking,
      });
    } catch (error: any) {
      logger.error('Failed to process payment', error);
      throw new BadRequestError(error.message || 'Failed to process payment');
    }
  })
);

/**
 * PUT /api/v1/group-bookings/:id/itinerary
 * Update shared itinerary
 */
router.put(
  '/:id/itinerary',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const itinerarySchema = z.object({
      itinerary: z.string().min(1),
    });

    const parsed = itinerarySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const groupBooking = await groupBookingService.updateSharedItinerary(
        req.params.id,
        parsed.data.itinerary
      );

      return res.json({
        success: true,
        data: groupBooking,
      });
    } catch (error: any) {
      logger.error('Failed to update itinerary', error);
      throw new BadRequestError(error.message || 'Failed to update itinerary');
    }
  })
);

/**
 * POST /api/v1/group-bookings/:id/cancel
 * Cancel a group booking
 */
router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const cancelSchema = z.object({
      reason: z.string().min(1),
    });

    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const groupBooking = await groupBookingService.cancelGroupBooking(
        req.params.id,
        parsed.data.reason
      );

      return res.json({
        success: true,
        data: groupBooking,
      });
    } catch (error: any) {
      logger.error('Failed to cancel group booking', error);
      throw new BadRequestError(error.message || 'Failed to cancel group booking');
    }
  })
);

/**
 * GET /api/v1/group-bookings/user/:email
 * Get all group bookings for a user
 */
router.get(
  '/user/:email',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const groupBookings = await groupBookingService.getGroupBookingsByEmail(
      req.params.email
    );

    return res.json({
      success: true,
      data: groupBookings,
    });
  })
);

export const groupBookingRoutes = router;