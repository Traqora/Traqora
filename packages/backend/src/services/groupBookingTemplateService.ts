import { AppDataSource } from '../db/dataSource';
import { GroupBookingTemplate, TemplateVisibility } from '../db/entities/GroupBookingTemplate';
import { logger } from '../utils/logger';

export interface CreateTemplateRequest {
  name: string;
  description: string;
  visibility?: TemplateVisibility;
  templateConfig: {
    flights: Array<{
      origin: string;
      destination: string;
      cabinClass: string;
      preferredAirline?: string;
    }>;
    splitMethod: 'equal' | 'custom' | 'percentage';
    defaultNotes?: string;
  };
  organizationId?: string;
  createdById?: string;
  tags?: string[];
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  visibility?: TemplateVisibility;
  templateConfig?: {
    flights: Array<{
      origin: string;
      destination: string;
      cabinClass: string;
      preferredAirline?: string;
    }>;
    splitMethod: 'equal' | 'custom' | 'percentage';
    defaultNotes?: string;
  };
  tags?: string[];
  isActive?: boolean;
}

export class GroupBookingTemplateService {
  private static instance: GroupBookingTemplateService;

  private constructor() {}

  public static getInstance(): GroupBookingTemplateService {
    if (!GroupBookingTemplateService.instance) {
      GroupBookingTemplateService.instance = new GroupBookingTemplateService();
    }
    return GroupBookingTemplateService.instance;
  }

  /**
   * Create a new group booking template
   */
  async createTemplate(request: CreateTemplateRequest): Promise<GroupBookingTemplate> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);

    const template = templateRepo.create({
      name: request.name,
      description: request.description,
      visibility: request.visibility || 'private',
      templateConfig: request.templateConfig,
      organizationId: request.organizationId,
      createdById: request.createdById,
      tags: request.tags,
      isActive: true,
    });

    const savedTemplate = await templateRepo.save(template);

    logger.info(`Group booking template created: ${savedTemplate.id}`);

    return savedTemplate;
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<GroupBookingTemplate | null> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);
    return await templateRepo.findOne({ where: { id: templateId } });
  }

  /**
   * Get templates by user
   */
  async getTemplatesByUser(userId: string): Promise<GroupBookingTemplate[]> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);
    return await templateRepo.find({
      where: { createdById: userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get templates by organization
   */
  async getTemplatesByOrganization(organizationId: string): Promise<GroupBookingTemplate[]> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);
    return await templateRepo.find({
      where: { organizationId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get public templates
   */
  async getPublicTemplates(): Promise<GroupBookingTemplate[]> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);
    return await templateRepo.find({
      where: { visibility: 'public', isActive: true },
      order: { usageCount: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Update template
   */
  async updateTemplate(templateId: string, request: UpdateTemplateRequest): Promise<GroupBookingTemplate> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);

    const template = await templateRepo.findOne({ where: { id: templateId } });
    if (!template) {
      throw new Error('Template not found');
    }

    if (request.name !== undefined) template.name = request.name;
    if (request.description !== undefined) template.description = request.description;
    if (request.visibility !== undefined) template.visibility = request.visibility;
    if (request.templateConfig !== undefined) template.templateConfig = request.templateConfig;
    if (request.tags !== undefined) template.tags = request.tags;
    if (request.isActive !== undefined) template.isActive = request.isActive;

    const updatedTemplate = await templateRepo.save(template);

    logger.info(`Group booking template updated: ${templateId}`);

    return updatedTemplate;
  }

  /**
   * Delete template (soft delete)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);

    const template = await templateRepo.findOne({ where: { id: templateId } });
    if (!template) {
      throw new Error('Template not found');
    }

    template.isActive = false;
    await templateRepo.save(template);

    logger.info(`Group booking template deleted: ${templateId}`);
  }

  /**
   * Increment usage count for a template
   */
  async incrementUsage(templateId: string): Promise<void> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);

    const template = await templateRepo.findOne({ where: { id: templateId } });
    if (!template) {
      throw new Error('Template not found');
    }

    template.usageCount = (template.usageCount || 0) + 1;
    await templateRepo.save(template);
  }

  /**
   * Search templates by tags
   */
  async searchTemplatesByTags(tags: string[]): Promise<GroupBookingTemplate[]> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);

    const templates = await templateRepo.find({
      where: { isActive: true },
    });

    return templates.filter(template => {
      const templateTags = template.tags || [];
      return tags.some(tag => templateTags.includes(tag));
    });
  }

  /**
   * Get popular templates
   */
  async getPopularTemplates(limit: number = 10): Promise<GroupBookingTemplate[]> {
    const templateRepo = AppDataSource.getRepository(GroupBookingTemplate);

    return await templateRepo.find({
      where: { visibility: 'public', isActive: true },
      order: { usageCount: 'DESC' },
      take: limit,
    });
  }
}
