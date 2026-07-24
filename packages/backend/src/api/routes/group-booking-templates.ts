import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { GroupBookingTemplateService } from '../../services/groupBookingTemplateService';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();
const templateService = GroupBookingTemplateService.getInstance();

// Create template schema
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  visibility: z.enum(['private', 'organization', 'public']).optional(),
  templateConfig: z.object({
    flights: z.array(z.object({
      origin: z.string().min(1),
      destination: z.string().min(1),
      cabinClass: z.string().min(1),
      preferredAirline: z.string().optional(),
    })).min(1),
    splitMethod: z.enum(['equal', 'custom', 'percentage']),
    defaultNotes: z.string().optional(),
  }),
  organizationId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Update template schema
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(1000).optional(),
  visibility: z.enum(['private', 'organization', 'public']).optional(),
  templateConfig: z.object({
    flights: z.array(z.object({
      origin: z.string().min(1),
      destination: z.string().min(1),
      cabinClass: z.string().min(1),
      preferredAirline: z.string().optional(),
    })).min(1),
    splitMethod: z.enum(['equal', 'custom', 'percentage']),
    defaultNotes: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * POST /api/v1/group-booking-templates
 * Create a new group booking template
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const template = await templateService.createTemplate({
        ...parsed.data,
        createdById: req.user?.id,
      });

      logger.info(`Group booking template created: ${template.id}`);

      return res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error: any) {
      logger.error('Failed to create template', error);
      throw new BadRequestError(error.message || 'Failed to create template');
    }
  })
);

/**
 * GET /api/v1/group-booking-templates/:id
 * Get template by ID
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const template = await templateService.getTemplate(req.params.id);

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    return res.json({
      success: true,
      data: template,
    });
  })
);

/**
 * GET /api/v1/group-booking-templates
 * Get templates with filters
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, organizationId, visibility, tags } = req.query;

    let templates;

    if (userId) {
      templates = await templateService.getTemplatesByUser(userId as string);
    } else if (organizationId) {
      templates = await templateService.getTemplatesByOrganization(organizationId as string);
    } else if (visibility === 'public') {
      templates = await templateService.getPublicTemplates();
    } else {
      throw new BadRequestError('Must provide userId, organizationId, or visibility=public');
    }

    // Apply tag filter if provided
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      templates = templates.filter(t => {
        const templateTags = t.tags || [];
        return tagArray.some((tag: string) => templateTags.includes(tag));
      });
    }

    return res.json({
      success: true,
      data: templates,
    });
  })
);

/**
 * GET /api/v1/group-booking-templates/public/popular
 * Get popular public templates
 */
router.get(
  '/public/popular',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const templates = await templateService.getPopularTemplates(limit);

    return res.json({
      success: true,
      data: templates,
    });
  })
);

/**
 * PUT /api/v1/group-booking-templates/:id
 * Update template
 */
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const template = await templateService.updateTemplate(req.params.id, parsed.data);

      logger.info(`Group booking template updated: ${req.params.id}`);

      return res.json({
        success: true,
        data: template,
      });
    } catch (error: any) {
      logger.error('Failed to update template', error);
      throw new BadRequestError(error.message || 'Failed to update template');
    }
  })
);

/**
 * DELETE /api/v1/group-booking-templates/:id
 * Delete template
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await templateService.deleteTemplate(req.params.id);

      logger.info(`Group booking template deleted: ${req.params.id}`);

      return res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error: any) {
      logger.error('Failed to delete template', error);
      throw new BadRequestError(error.message || 'Failed to delete template');
    }
  })
);

/**
 * POST /api/v1/group-booking-templates/:id/use
 * Increment template usage count
 */
router.post(
  '/:id/use',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await templateService.incrementUsage(req.params.id);

      return res.json({
        success: true,
        message: 'Usage count incremented',
      });
    } catch (error: any) {
      logger.error('Failed to increment usage', error);
      throw new BadRequestError(error.message || 'Failed to increment usage');
    }
  })
);

/**
 * GET /api/v1/group-booking-templates/search
 * Search templates by tags
 */
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { tags } = req.query;

    if (!tags) {
      throw new BadRequestError('Must provide tags parameter');
    }

    const tagArray = Array.isArray(tags) ? tags : [tags];
    const templates = await templateService.searchTemplatesByTags(tagArray);

    return res.json({
      success: true,
      data: templates,
    });
  })
);

export const groupBookingTemplateRoutes = router;
