import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { abuseListManager } from '../../utils/rateLimiter';

const router = Router();

const adminAuth = (req: any, res: any, next: any) => {
  const apiKey = req.header('x-admin-api-key');
  if (!apiKey || apiKey !== config.adminApiKey) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid admin API key',
      },
    });
  }
  return next();
};

const ipPayloadSchema = z.object({
  ip: z.string().min(3),
});

const blacklistPayloadSchema = ipPayloadSchema.extend({
  ttlSeconds: z.coerce.number().int().min(1).max(60 * 60 * 24 * 30).default(3600),
});

router.use(adminAuth);

router.get('/rate-limits/lists', async (_req, res) => {
  const lists = await abuseListManager.getLists(config.redisUrl || undefined);
  return res.json({ success: true, data: lists });
});

router.post('/rate-limits/whitelist', async (req, res) => {
  const parsed = ipPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      },
    });
  }

  await abuseListManager.addWhitelist(parsed.data.ip, config.redisUrl || undefined);
  return res.status(201).json({ success: true, data: { ip: parsed.data.ip, list: 'whitelist' } });
});

router.delete('/rate-limits/whitelist/:ip', async (req, res) => {
  await abuseListManager.removeWhitelist(req.params.ip, config.redisUrl || undefined);
  return res.json({ success: true, data: { ip: req.params.ip, removed: true } });
});

router.post('/rate-limits/blacklist', async (req, res) => {
  const parsed = blacklistPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      },
    });
  }

  await abuseListManager.addBlacklist(
    parsed.data.ip,
    parsed.data.ttlSeconds,
    config.redisUrl || undefined
  );
  return res.status(201).json({
    success: true,
    data: {
      ip: parsed.data.ip,
      list: 'blacklist',
      ttlSeconds: parsed.data.ttlSeconds,
    },
  });
});

router.delete('/rate-limits/blacklist/:ip', async (req, res) => {
  await abuseListManager.removeBlacklist(req.params.ip, config.redisUrl || undefined);
  return res.json({ success: true, data: { ip: req.params.ip, removed: true } });
});

router.get('/rate-limits/status/:ip', async (req, res) => {
  const ip = req.params.ip;
  const [isWhitelisted, isBlacklisted, blockedStatus, violations] = await Promise.all([
    abuseListManager.isWhitelisted(ip, config.redisUrl || undefined),
    abuseListManager.isBlacklisted(ip, config.redisUrl || undefined),
    abuseListManager.isBlocked(ip, config.redisUrl || undefined),
    abuseListManager.getViolationCount(ip, config.redisUrl || undefined),
  ]);

  return res.json({
    success: true,
    data: {
      ip,
      isWhitelisted,
      isBlacklisted,
      blocked: blockedStatus.blocked,
      blockMsRemaining: blockedStatus.msRemaining,
      violations,
    },
  });
});

export const securityRoutes = router;
