import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { AppDataSource } from '../../db/dataSource';
import { UserPreference } from '../../db/entities/UserPreference';
import { logger } from '../../utils/logger';

const router = Router();

router.get('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: req.user });
}));

// GET /api/v1/users/preferences - Get user notification preferences
router.get('/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const userPrefRepo = AppDataSource.getRepository(UserPreference);
  const userId = req.user?.walletAddress;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let preferences = await userPrefRepo.findOne({ where: { userId } });

  // Create default preferences if not exist
  if (!preferences) {
    preferences = userPrefRepo.create({
      userId,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      pushBookingEnabled: true,
      pushReminderEnabled: true,
      pushRefundEnabled: true,
      pushPromoEnabled: true,
      pushOptedIn: false,
      pushDeviceTokens: [],
    });
    await userPrefRepo.save(preferences);
  }

  return res.json({
    success: true,
    data: {
      emailEnabled: preferences.emailEnabled,
      smsEnabled: preferences.smsEnabled,
      pushEnabled: preferences.pushEnabled,
      pushBookingEnabled: preferences.pushBookingEnabled,
      pushReminderEnabled: preferences.pushReminderEnabled,
      pushRefundEnabled: preferences.pushRefundEnabled,
      pushPromoEnabled: preferences.pushPromoEnabled,
      pushOptedIn: preferences.pushOptedIn,
      pushOptInAt: preferences.pushOptInAt,
      email: preferences.email,
      phoneNumber: preferences.phoneNumber,
    },
  });
}));

// PUT /api/v1/users/preferences - Update user notification preferences
const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  pushBookingEnabled: z.boolean().optional(),
  pushReminderEnabled: z.boolean().optional(),
  pushRefundEnabled: z.boolean().optional(),
  pushPromoEnabled: z.boolean().optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
});

router.put('/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: parsed.error.flatten(),
      },
    });
  }

  const userPrefRepo = AppDataSource.getRepository(UserPreference);
  const userId = req.user?.walletAddress;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let preferences = await userPrefRepo.findOne({ where: { userId } });

  if (!preferences) {
    preferences = userPrefRepo.create({
      userId,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      pushBookingEnabled: true,
      pushReminderEnabled: true,
      pushRefundEnabled: true,
      pushPromoEnabled: true,
      pushOptedIn: false,
      pushDeviceTokens: [],
    });
  }

  // Update provided fields
  Object.assign(preferences, parsed.data);

  await userPrefRepo.save(preferences);

  logger.info('User preferences updated', { userId, changes: parsed.data });

  return res.json({
    success: true,
    data: {
      emailEnabled: preferences.emailEnabled,
      smsEnabled: preferences.smsEnabled,
      pushEnabled: preferences.pushEnabled,
      pushBookingEnabled: preferences.pushBookingEnabled,
      pushReminderEnabled: preferences.pushReminderEnabled,
      pushRefundEnabled: preferences.pushRefundEnabled,
      pushPromoEnabled: preferences.pushPromoEnabled,
      pushOptedIn: preferences.pushOptedIn,
      pushOptInAt: preferences.pushOptInAt,
    },
  });
}));

// POST /api/v1/users/push/opt-in - Opt-in to push notifications
const pushOptInSchema = z.object({
  token: z.string().min(1, 'FCM token is required'),
  platform: z.enum(['web', 'ios', 'android']).default('web'),
  enabledTypes: z.array(z.enum(['booking', 'reminder', 'refund', 'promo'])).default(['booking', 'reminder', 'refund']),
});

router.post('/push/opt-in', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const parsed = pushOptInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: parsed.error.flatten(),
      },
    });
  }

  const { token, platform, enabledTypes } = parsed.data;
  const userPrefRepo = AppDataSource.getRepository(UserPreference);
  const userId = req.user?.walletAddress;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let preferences = await userPrefRepo.findOne({ where: { userId } });

  if (!preferences) {
    preferences = userPrefRepo.create({
      userId,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      pushBookingEnabled: true,
      pushReminderEnabled: true,
      pushRefundEnabled: true,
      pushPromoEnabled: true,
      pushOptedIn: false,
      pushDeviceTokens: [],
    });
  }

  // Update device tokens
  const deviceTokens = preferences.pushDeviceTokens || [];
  const existingTokenIndex = deviceTokens.findIndex(t => t.token === token);

  if (existingTokenIndex >= 0) {
    // Update existing token
    deviceTokens[existingTokenIndex] = {
      token,
      platform,
      lastUsed: new Date(),
    };
  } else {
    // Add new token
    deviceTokens.push({
      token,
      platform,
      lastUsed: new Date(),
    });
  }

  preferences.pushDeviceTokens = deviceTokens;
  preferences.pushOptedIn = true;
  preferences.pushOptInAt = new Date();
  preferences.fcmToken = token; // Keep for backward compatibility

  // Update type-specific preferences
  preferences.pushBookingEnabled = enabledTypes.includes('booking');
  preferences.pushReminderEnabled = enabledTypes.includes('reminder');
  preferences.pushRefundEnabled = enabledTypes.includes('refund');
  preferences.pushPromoEnabled = enabledTypes.includes('promo');

  await userPrefRepo.save(preferences);

  logger.info('User opted in to push notifications', { userId, platform, enabledTypes });

  return res.json({
    success: true,
    data: {
      pushOptedIn: true,
      pushOptInAt: preferences.pushOptInAt,
      enabledTypes,
    },
  });
}));

// POST /api/v1/users/push/opt-out - Opt-out of push notifications
router.post('/push/opt-out', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const userPrefRepo = AppDataSource.getRepository(UserPreference);
  const userId = req.user?.walletAddress;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const preferences = await userPrefRepo.findOne({ where: { userId } });

  if (!preferences) {
    return res.status(404).json({
      error: {
        code: 'PREFERENCES_NOT_FOUND',
        message: 'User preferences not found',
      },
    });
  }

  preferences.pushOptedIn = false;
  preferences.pushEnabled = false;
  preferences.pushDeviceTokens = [];
  preferences.fcmToken = null;

  await userPrefRepo.save(preferences);

  logger.info('User opted out of push notifications', { userId });

  return res.json({
    success: true,
    data: {
      pushOptedIn: false,
    },
  });
}));

// POST /api/v1/users/push/register-token - Register/update FCM token
const registerTokenSchema = z.object({
  token: z.string().min(1, 'FCM token is required'),
  platform: z.enum(['web', 'ios', 'android']).default('web'),
});

router.post('/push/register-token', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const parsed = registerTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: parsed.error.flatten(),
      },
    });
  }

  const { token, platform } = parsed.data;
  const userPrefRepo = AppDataSource.getRepository(UserPreference);
  const userId = req.user?.walletAddress;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let preferences = await userPrefRepo.findOne({ where: { userId } });

  if (!preferences) {
    preferences = userPrefRepo.create({
      userId,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      pushBookingEnabled: true,
      pushReminderEnabled: true,
      pushRefundEnabled: true,
      pushPromoEnabled: true,
      pushOptedIn: false,
      pushDeviceTokens: [],
    });
  }

  // Update device tokens
  const deviceTokens = preferences.pushDeviceTokens || [];
  const existingTokenIndex = deviceTokens.findIndex(t => t.token === token);

  if (existingTokenIndex >= 0) {
    // Update existing token
    deviceTokens[existingTokenIndex] = {
      token,
      platform,
      lastUsed: new Date(),
    };
  } else {
    // Add new token
    deviceTokens.push({
      token,
      platform,
      lastUsed: new Date(),
    });
  }

  preferences.pushDeviceTokens = deviceTokens;
  preferences.fcmToken = token; // Keep for backward compatibility

  await userPrefRepo.save(preferences);

  logger.info('FCM token registered', { userId, platform });

  return res.json({
    success: true,
    data: {
      tokenRegistered: true,
      platform,
    },
  });
}));

export const userRoutes = router;
