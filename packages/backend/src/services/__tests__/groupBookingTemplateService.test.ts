import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GroupBookingTemplateService } from '../groupBookingTemplateService';
import { AppDataSource } from '../../db/dataSource';
import { GroupBookingTemplate } from '../../db/entities/GroupBookingTemplate';

describe('GroupBookingTemplateService', () => {
  let templateService: GroupBookingTemplateService;

  beforeEach(() => {
    templateService = GroupBookingTemplateService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTemplate', () => {
    it('should create a new group booking template', async () => {
      const request = {
        name: 'Corporate Travel Template',
        description: 'Standard corporate travel configuration',
        visibility: 'organization' as const,
        templateConfig: {
          flights: [
            {
              origin: 'JFK',
              destination: 'LAX',
              cabinClass: 'business',
              preferredAirline: 'Delta',
            },
          ],
          splitMethod: 'equal' as const,
          defaultNotes: 'Corporate policy applies',
        },
        organizationId: 'org-1',
        createdById: 'user-1',
        tags: ['corporate', 'business'],
      };

      const mockTemplate = {
        id: 'template-1',
        ...request,
        usageCount: 0,
        isActive: true,
      } as GroupBookingTemplate;

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'create').mockReturnValue(mockTemplate);
      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'save').mockResolvedValue(mockTemplate);

      const result = await templateService.createTemplate(request);

      expect(result).toBeDefined();
      expect(result.name).toBe(request.name);
      expect(result.visibility).toBe(request.visibility);
    });
  });

  describe('getTemplate', () => {
    it('should return template by id', async () => {
      const mockTemplate = {
        id: 'template-1',
        name: 'Test Template',
        description: 'Test description',
        visibility: 'public',
        templateConfig: {
          flights: [],
          splitMethod: 'equal',
        },
        usageCount: 10,
        isActive: true,
      } as GroupBookingTemplate;

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'findOne').mockResolvedValue(mockTemplate);

      const result = await templateService.getTemplate('template-1');

      expect(result).toEqual(mockTemplate);
    });

    it('should return null if template not found', async () => {
      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'findOne').mockResolvedValue(null);

      const result = await templateService.getTemplate('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getTemplatesByUser', () => {
    it('should return templates for a user', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Template 1',
          createdById: 'user-1',
          isActive: true,
        },
        {
          id: 'template-2',
          name: 'Template 2',
          createdById: 'user-1',
          isActive: true,
        },
      ] as GroupBookingTemplate[];

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'find').mockResolvedValue(mockTemplates);

      const result = await templateService.getTemplatesByUser('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].createdById).toBe('user-1');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      const existingTemplate = {
        id: 'template-1',
        name: 'Old Name',
        description: 'Old description',
        visibility: 'private',
        templateConfig: {
          flights: [],
          splitMethod: 'equal',
        },
        usageCount: 5,
        isActive: true,
      } as GroupBookingTemplate;

      const updatedTemplate = {
        ...existingTemplate,
        name: 'New Name',
        description: 'New description',
      } as GroupBookingTemplate;

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'findOne').mockResolvedValue(existingTemplate);
      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'save').mockResolvedValue(updatedTemplate);

      const result = await templateService.updateTemplate('template-1', {
        name: 'New Name',
        description: 'New description',
      });

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('New description');
    });

    it('should throw error if template not found', async () => {
      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'findOne').mockResolvedValue(null);

      await expect(templateService.updateTemplate('non-existent', { name: 'New Name' })).rejects.toThrow(
        'Template not found'
      );
    });
  });

  describe('deleteTemplate', () => {
    it('should soft delete a template', async () => {
      const mockTemplate = {
        id: 'template-1',
        name: 'Test Template',
        isActive: true,
      } as GroupBookingTemplate;

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'findOne').mockResolvedValue(mockTemplate);
      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'save').mockResolvedValue({
        ...mockTemplate,
        isActive: false,
      } as GroupBookingTemplate);

      await templateService.deleteTemplate('template-1');

      expect(AppDataSource.getRepository(GroupBookingTemplate).save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false })
      );
    });
  });

  describe('incrementUsage', () => {
    it('should increment template usage count', async () => {
      const mockTemplate = {
        id: 'template-1',
        name: 'Test Template',
        usageCount: 5,
        isActive: true,
      } as GroupBookingTemplate;

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'findOne').mockResolvedValue(mockTemplate);
      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'save').mockResolvedValue({
        ...mockTemplate,
        usageCount: 6,
      } as GroupBookingTemplate);

      await templateService.incrementUsage('template-1');

      expect(AppDataSource.getRepository(GroupBookingTemplate).save).toHaveBeenCalledWith(
        expect.objectContaining({ usageCount: 6 })
      );
    });
  });

  describe('getPopularTemplates', () => {
    it('should return popular templates sorted by usage count', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Popular Template',
          visibility: 'public',
          usageCount: 100,
          isActive: true,
        },
        {
          id: 'template-2',
          name: 'Less Popular Template',
          visibility: 'public',
          usageCount: 50,
          isActive: true,
        },
      ] as GroupBookingTemplate[];

      jest.spyOn(AppDataSource.getRepository(GroupBookingTemplate), 'find').mockResolvedValue(mockTemplates);

      const result = await templateService.getPopularTemplates(10);

      expect(result).toHaveLength(2);
      expect(result[0].usageCount).toBeGreaterThanOrEqual(result[1].usageCount);
    });
  });
});
