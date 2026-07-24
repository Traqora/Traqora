import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { ContractEventLog } from '../../db/entities/ContractEventLog';

const router = Router();

const querySchema = z.object({
  contractId: z.string().optional(),
  eventType: z.string().optional(),
  walletAddress: z.string().optional(),
  fromLedger: z.coerce.number().int().nonnegative().optional(),
  toLedger: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

/**
 * GET /api/contract-events
 * Query indexed contract events with optional filters and pagination.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { contractId, eventType, walletAddress, fromLedger, toLedger, page, limit } =
      parsed.data;

    const repo = AppDataSource.getRepository(ContractEventLog);
    const qb = repo.createQueryBuilder('e').orderBy('e.ledger', 'DESC');

    if (contractId) qb.andWhere('e.contractId = :contractId', { contractId });
    if (eventType) qb.andWhere('e.eventType = :eventType', { eventType });
    if (walletAddress) qb.andWhere('e.walletAddress = :walletAddress', { walletAddress });
    if (fromLedger !== undefined) qb.andWhere('e.ledger >= :fromLedger', { fromLedger });
    if (toLedger !== undefined) qb.andWhere('e.ledger <= :toLedger', { toLedger });

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

/**
 * GET /api/contract-events/replay
 * Return all events since a given ledger for client reconnect catch-up.
 */
router.get(
  '/replay',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      sinceLedger: z.coerce.number().int().nonnegative(),
      walletAddress: z.string().optional(),
      limit: z.coerce.number().int().positive().max(500).default(200),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { sinceLedger, walletAddress, limit } = parsed.data;
    const repo = AppDataSource.getRepository(ContractEventLog);
    const qb = repo
      .createQueryBuilder('e')
      .where('e.ledger > :sinceLedger', { sinceLedger })
      .orderBy('e.ledger', 'ASC')
      .take(limit);

    if (walletAddress) qb.andWhere('e.walletAddress = :walletAddress', { walletAddress });

    const events = await qb.getMany();
    return res.json({ events, sinceLedger });
  }),
);

export default router;
