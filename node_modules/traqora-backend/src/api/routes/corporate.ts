import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { GroupBookingService } from '../../services/groupBooking';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const router = Router();
const groupBookingService = GroupBookingService.getInstance();

const createAccountSchema = z.object({
  companyName: z.string().min(1).max(255),
  email: z.string().email(),
  registrationNumber: z.string().optional(),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  industry: z.string().optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
});

const updateAccountSchema = createAccountSchema.partial();

const addUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'booking_manager', 'traveler', 'approver']),
  department: z.string().optional(),
  costCenter: z.string().optional(),
  permissions: z.record(z.boolean()).optional(),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'booking_manager', 'traveler', 'approver']),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  maxBookingAmountCents: z.number().int().min(0).optional(),
  allowedFareClasses: z
    .array(z.enum(['economy', 'premium_economy', 'business', 'first']))
    .optional(),
  maxAdvanceBookingDays: z.number().int().min(0).optional(),
  requiresApproval: z.boolean().optional(),
  approvalThresholdCents: z.number().int().min(0).optional(),
  preferredAirlines: z.array(z.string()).optional(),
  blacklistedAirlines: z.array(z.string()).optional(),
});

const approvalSchema = z.object({
  note: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
});

const listQuerySchema = z.object({
  status: z.enum(['active', 'pending', 'suspended', 'closed']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Corporate Account CRUD

router.post(
  '/accounts',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const account = await groupBookingService.createCorporateAccount(parsed.data);
    return res.status(201).json({ success: true, data: account });
  }),
);

router.get(
  '/accounts',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const result = await groupBookingService.listCorporateAccounts(parsed.data);
    return res.json({ success: true, data: result });
  }),
);

router.get(
  '/accounts/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const account = await groupBookingService.getCorporateAccount(req.params.id);
    if (!account) throw new NotFoundError('Corporate account not found');

    return res.json({ success: true, data: account });
  }),
);

router.patch(
  '/accounts/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const account = await groupBookingService.updateCorporateAccount(
      req.params.id,
      parsed.data,
    );
    return res.json({ success: true, data: account });
  }),
);

router.post(
  '/accounts/:id/suspend',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({ reason: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const account = await groupBookingService.suspendCorporateAccount(
      req.params.id,
      parsed.data.reason,
    );
    return res.json({ success: true, data: account });
  }),
);

// Corporate Users

router.post(
  '/accounts/:id/users',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = addUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const corporateUser = await groupBookingService.addCorporateUser({
      corporateAccountId: req.params.id,
      ...parsed.data,
    });
    return res.status(201).json({ success: true, data: corporateUser });
  }),
);

router.get(
  '/accounts/:id/users',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const users = await groupBookingService.listCorporateUsers(req.params.id);
    return res.json({ success: true, data: users });
  }),
);

router.patch(
  '/accounts/:id/users/:userId/role',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateUserRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const corporateUser = await groupBookingService.updateCorporateUserRole(
      req.params.id,
      req.params.userId,
      parsed.data.role,
    );
    return res.json({ success: true, data: corporateUser });
  }),
);

router.delete(
  '/accounts/:id/users/:userId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await groupBookingService.removeCorporateUser(req.params.id, req.params.userId);
    return res.json({ success: true });
  }),
);

// Booking Policies

router.post(
  '/accounts/:id/policies',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const policy = await groupBookingService.createBookingPolicy({
      corporateAccountId: req.params.id,
      ...parsed.data,
    });
    return res.status(201).json({ success: true, data: policy });
  }),
);

router.get(
  '/accounts/:id/policies',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const policies = await groupBookingService.listBookingPolicies(req.params.id);
    return res.json({ success: true, data: policies });
  }),
);

// Group Check-In

router.post(
  '/group-bookings/:id/checkin',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const seatSchema = z.object({
      seatAllocations: z.record(z.string()).optional(),
    });

    const parsed = seatSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const result = await groupBookingService.checkInAllMembers(
      req.params.id,
      parsed.data.seatAllocations,
    );
    return res.json({ success: true, data: result });
  }),
);

// Billing

router.post(
  '/group-bookings/:id/invoice',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await groupBookingService.generateInvoice(req.params.id);
    return res.status(201).json({ success: true, data: invoice });
  }),
);

router.get(
  '/group-bookings/:id/invoice',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const invoice = await groupBookingService.getInvoice(req.params.id);
    if (!invoice) {
      return res.json({ success: true, data: null });
    }
    return res.json({ success: true, data: invoice });
  }),
);

router.get(
  '/accounts/:id/invoices',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const invoices = await groupBookingService.listInvoicesByCorporateAccount(
      req.params.id,
    );
    return res.json({ success: true, data: invoices });
  }),
);

// Policy Validation

router.get(
  '/group-bookings/:id/policy-validation',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await groupBookingService.validateBookingAgainstPolicy(
      req.params.id,
    );
    return res.json({ success: true, data: result });
  }),
);

// Approvals

router.post(
  '/approvals/:id/approve',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = approvalSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.walletAddress || req.user?.id || 'unknown';
    const approval = await groupBookingService.approveBooking(
      req.params.id,
      userId,
      parsed.data.note,
    );
    return res.json({ success: true, data: approval });
  }),
);

router.post(
  '/approvals/:id/reject',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.walletAddress || req.user?.id || 'unknown';
    const approval = await groupBookingService.rejectBooking(
      req.params.id,
      userId,
      parsed.data.reason,
    );
    return res.json({ success: true, data: approval });
  }),
);

router.get(
  '/accounts/:id/approvals/pending',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const approvals = await groupBookingService.listPendingApprovals(req.params.id);
    return res.json({ success: true, data: approvals });
  }),
);

router.get(
  '/group-bookings/:id/approvals',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const approvals = await groupBookingService.getApprovalsForGroup(req.params.id);
    return res.json({ success: true, data: approvals });
  }),
);

export const corporateRoutes = router;
