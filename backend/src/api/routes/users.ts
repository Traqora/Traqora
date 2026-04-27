import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { initDataSource } from '../../db/dataSource';
import { User } from '../../db/entities/User';
import { Passenger } from '../../db/entities/Passenger';
import { UserPreference } from '../../db/entities/UserPreference';
import { DataSource } from 'typeorm';
import { logger } from '../../utils/logger';

const router = Router();

// Validation schemas
const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  firstName: z.string().min(1).max(64).optional(),
  lastName: z.string().min(1).max(64).optional(),
});

const createPassengerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
  phone: z.string().max(32).optional(),
  sorobanAddress: z.string().min(1).max(128),
});

const updatePassengerSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(64).optional(),
  lastName: z.string().min(1).max(64).optional(),
  phone: z.string().max(32).optional(),
  sorobanAddress: z.string().min(1).max(128).optional(),
});

const updatePreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  language: z.string().length(2).optional(),
  timezone: z.string().optional(),
});

// Helper function to get database connection
async function getDataSource(): Promise<DataSource> {
  return await initDataSource();
}

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     description: Retrieve the current user's profile including passengers and preferences
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *                         passengers:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Passenger'
 *                         preferences:
 *                           type: object
 *                           properties:
 *                             emailNotifications:
 *                               type: boolean
 *                             smsNotifications:
 *                               type: boolean
 *                             pushNotifications:
 *                               type: boolean
 *                             marketingEmails:
 *                               type: boolean
 *                             currency:
 *                               type: string
 *                               example: USD
 *                             language:
 *                               type: string
 *                               example: en
 *                             timezone:
 *                               type: string
 *                               example: UTC
 *       401:
 *         $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const passengerRepository = dataSource.getRepository(Passenger);
  const preferenceRepository = dataSource.getRepository(UserPreference);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  // Get user
  const user = await userRepository.findOne({ where: { walletAddress } });
  if (!user) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      },
    });
  }

  // Get associated passengers
  const passengers = await passengerRepository.find({ 
    where: { sorobanAddress: walletAddress },
    order: { createdAt: 'DESC' }
  });

  // Get user preferences
  const preferences = await preferenceRepository.findOne({ 
    where: { walletAddress } 
  });

  return res.json({
    success: true,
    data: {
      user,
      passengers,
      preferences: preferences || {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        marketingEmails: false,
        currency: 'USD',
        language: 'en',
        timezone: 'UTC',
      },
    },
  });
}));

/**
 * PUT /api/v1/users/me
 * Update current user profile
 */
router.put('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  const user = await userRepository.findOne({ where: { walletAddress } });
  if (!user) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      },
    });
  }

  // Note: User entity currently only has wallet fields
  // Profile updates would need to be stored in a separate profile entity
  // For now, we'll just return success
  
  logger.info(`User profile update attempted for ${walletAddress}`);
  
  return res.json({
    success: true,
    data: {
      message: 'Profile update received. Note: User entity schema needs to be extended to store profile data.',
      user,
    },
  });
}));

/**
 * GET /api/v1/users/passengers
 * Get current user's passengers
 */
router.get('/passengers', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const passengerRepository = dataSource.getRepository(Passenger);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const passengers = await passengerRepository.find({ 
    where: { sorobanAddress: walletAddress },
    order: { createdAt: 'DESC' }
  });

  return res.json({
    success: true,
    data: passengers,
  });
}));

/**
 * POST /api/v1/users/passengers
 * Create a new passenger
 */
router.post('/passengers', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const passengerRepository = dataSource.getRepository(Passenger);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const parsed = createPassengerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  // Check if passenger with this email already exists for this user
  const existingPassenger = await passengerRepository.findOne({
    where: { 
      email: parsed.data.email,
      sorobanAddress: walletAddress
    }
  });

  if (existingPassenger) {
    return res.status(409).json({
      success: false,
      error: {
        message: 'Passenger with this email already exists',
        code: 'PASSENGER_EXISTS',
      },
    });
  }

  const passenger = passengerRepository.create({
    ...parsed.data,
    sorobanAddress: walletAddress,
  });

  const savedPassenger = await passengerRepository.save(passenger);

  logger.info(`Created new passenger ${savedPassenger.id} for user ${walletAddress}`);

  return res.status(201).json({
    success: true,
    data: savedPassenger,
  });
}));

/**
 * GET /api/v1/users/passengers/:id
 * Get a specific passenger
 */
router.get('/passengers/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const passengerRepository = dataSource.getRepository(Passenger);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const passenger = await passengerRepository.findOne({
    where: { 
      id: req.params.id,
      sorobanAddress: walletAddress // Ensure user can only access their own passengers
    }
  });

  if (!passenger) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Passenger not found',
        code: 'PASSENGER_NOT_FOUND',
      },
    });
  }

  return res.json({
    success: true,
    data: passenger,
  });
}));

/**
 * PUT /api/v1/users/passengers/:id
 * Update a passenger
 */
router.put('/passengers/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const passengerRepository = dataSource.getRepository(Passenger);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const parsed = updatePassengerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  const passenger = await passengerRepository.findOne({
    where: { 
      id: req.params.id,
      sorobanAddress: walletAddress
    }
  });

  if (!passenger) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Passenger not found',
        code: 'PASSENGER_NOT_FOUND',
      },
    });
  }

  // Update passenger fields
  Object.assign(passenger, parsed.data);

  const updatedPassenger = await passengerRepository.save(passenger);

  logger.info(`Updated passenger ${updatedPassenger.id} for user ${walletAddress}`);

  return res.json({
    success: true,
    data: updatedPassenger,
  });
}));

/**
 * DELETE /api/v1/users/passengers/:id
 * Delete a passenger
 */
router.delete('/passengers/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const passengerRepository = dataSource.getRepository(Passenger);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const passenger = await passengerRepository.findOne({
    where: { 
      id: req.params.id,
      sorobanAddress: walletAddress
    }
  });

  if (!passenger) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Passenger not found',
        code: 'PASSENGER_NOT_FOUND',
      },
    });
  }

  await passengerRepository.remove(passenger);

  logger.info(`Deleted passenger ${req.params.id} for user ${walletAddress}`);

  return res.json({
    success: true,
    data: {
      message: 'Passenger deleted successfully',
    },
  });
}));

/**
 * GET /api/v1/users/preferences
 * Get user preferences
 */
router.get('/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const preferenceRepository = dataSource.getRepository(UserPreference);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  let preferences = await preferenceRepository.findOne({ 
    where: { walletAddress } 
  });

  // Return default preferences if none exist
  if (!preferences) {
    preferences = {
      walletAddress,
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      marketingEmails: false,
      currency: 'USD',
      language: 'en',
      timezone: 'UTC',
    } as UserPreference;
  }

  return res.json({
    success: true,
    data: preferences,
  });
}));

/**
 * PUT /api/v1/users/preferences
 * Update user preferences
 */
router.put('/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const preferenceRepository = dataSource.getRepository(UserPreference);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  let preferences = await preferenceRepository.findOne({ 
    where: { walletAddress } 
  });

  if (!preferences) {
    preferences = preferenceRepository.create({
      walletAddress,
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      marketingEmails: false,
      currency: 'USD',
      language: 'en',
      timezone: 'UTC',
    });
  }

  // Update preferences
  Object.assign(preferences, parsed.data);

  const updatedPreferences = await preferenceRepository.save(preferences);

  logger.info(`Updated preferences for user ${walletAddress}`);

  return res.json({
    success: true,
    data: updatedPreferences,
  });
}));

/**
 * DELETE /api/v1/users/me
 * Delete user account (and all associated data)
 */
router.delete('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);
  const passengerRepository = dataSource.getRepository(Passenger);
  const preferenceRepository = dataSource.getRepository(UserPreference);
  
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
      },
    });
  }

  // Delete user's passengers
  await passengerRepository.delete({ sorobanAddress: walletAddress });
  
  // Delete user's preferences
  await preferenceRepository.delete({ walletAddress });
  
  // Delete user
  const user = await userRepository.findOne({ where: { walletAddress } });
  if (user) {
    await userRepository.remove(user);
  }

  logger.warn(`Deleted user account and all associated data for ${walletAddress}`);

  return res.json({
    success: true,
    data: {
      message: 'Account deleted successfully',
    },
  });
}));

export { router as userRoutes };
