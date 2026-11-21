/**
 * Notification Template Service
 * Manages notification templates for different channels and categories
 */

import { logger } from '../utils/logger';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationTemplate,
} from '../types/notification';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  description: string;
}

export interface RenderedTemplate {
  subject?: string;
  body: string;
  variables: Record<string, any>;
}

export class NotificationTemplateService {
  private templates: Map<string, NotificationTemplate> = new Map();
  private defaultTemplates: NotificationTemplate[] = [];

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default notification templates
   */
  private initializeDefaultTemplates(): void {
    this.defaultTemplates = [
      // Booking templates
      {
        id: 'booking-confirmed-email',
        category: 'booking',
        channel: 'email',
        subject: 'Booking Confirmed: {{flightNumber}}',
        template: `
          <h1>Your booking is confirmed!</h1>
          <p>Dear {{userName}},</p>
          <p>Your flight {{flightNumber}} from {{origin}} to {{destination}} on {{departureDate}} has been confirmed.</p>
          <p><strong>Booking Reference:</strong> {{bookingReference}}</p>
          <p><strong>Departure:</strong> {{departureTime}}</p>
          <p><strong>Arrival:</strong> {{arrivalTime}}</p>
          <p><strong>Price:</strong> {{price}}</p>
          <a href="{{actionUrl}}">View Booking Details</a>
        `,
        variables: ['userName', 'flightNumber', 'origin', 'destination', 'departureDate', 'departureTime', 'arrivalTime', 'bookingReference', 'price', 'actionUrl'],
        createdAt: new Date(),
      },
      {
        id: 'booking-confirmed-sms',
        category: 'booking',
        channel: 'sms',
        template: 'Booking confirmed! Flight {{flightNumber}} {{origin}}->{{destination}} on {{departureDate}}. Ref: {{bookingReference}}',
        variables: ['flightNumber', 'origin', 'destination', 'departureDate', 'bookingReference'],
        createdAt: new Date(),
      },
      {
        id: 'booking-confirmed-push',
        category: 'booking',
        channel: 'push',
        template: 'Your flight {{flightNumber}} booking is confirmed!',
        variables: ['flightNumber'],
        createdAt: new Date(),
      },
      {
        id: 'booking-confirmed-inapp',
        category: 'booking',
        channel: 'inapp',
        template: 'Your flight {{flightNumber}} from {{origin}} to {{destination}} has been confirmed.',
        variables: ['flightNumber', 'origin', 'destination'],
        createdAt: new Date(),
      },

      // Payment templates
      {
        id: 'payment-success-email',
        category: 'payment',
        channel: 'email',
        subject: 'Payment Successful: {{amount}}',
        template: `
          <h1>Payment Successful</h1>
          <p>Dear {{userName}},</p>
          <p>Your payment of {{amount}} for booking {{bookingReference}} has been processed successfully.</p>
          <p><strong>Transaction ID:</strong> {{transactionId}}</p>
          <p><strong>Date:</strong> {{date}}</p>
          <a href="{{actionUrl}}">View Receipt</a>
        `,
        variables: ['userName', 'amount', 'bookingReference', 'transactionId', 'date', 'actionUrl'],
        createdAt: new Date(),
      },
      {
        id: 'payment-success-sms',
        category: 'payment',
        channel: 'sms',
        template: 'Payment successful! {{amount}} for booking {{bookingReference}}. Transaction ID: {{transactionId}}',
        variables: ['amount', 'bookingReference', 'transactionId'],
        createdAt: new Date(),
      },
      {
        id: 'payment-success-push',
        category: 'payment',
        channel: 'push',
        template: 'Payment of {{amount}} processed successfully',
        variables: ['amount'],
        createdAt: new Date(),
      },

      // Itinerary templates
      {
        id: 'itinerary-change-email',
        category: 'itinerary',
        channel: 'email',
        subject: 'Itinerary Change: Flight {{flightNumber}}',
        template: `
          <h1>Flight Itinerary Change</h1>
          <p>Dear {{userName}},</p>
          <p>Your flight {{flightNumber}} itinerary has been changed.</p>
          <p><strong>Old Departure:</strong> {{oldDepartureTime}}</p>
          <p><strong>New Departure:</strong> {{newDepartureTime}}</p>
          <p><strong>Reason:</strong> {{reason}}</p>
          <a href="{{actionUrl}}">View Updated Itinerary</a>
        `,
        variables: ['userName', 'flightNumber', 'oldDepartureTime', 'newDepartureTime', 'reason', 'actionUrl'],
        createdAt: new Date(),
      },
      {
        id: 'itinerary-change-sms',
        category: 'itinerary',
        channel: 'sms',
        template: 'Flight {{flightNumber}} schedule changed. New departure: {{newDepartureTime}}. Reason: {{reason}}',
        variables: ['flightNumber', 'newDepartureTime', 'reason'],
        createdAt: new Date(),
      },

      // Collaboration templates
      {
        id: 'collaboration-invite-email',
        category: 'collaboration',
        channel: 'email',
        subject: 'Trip Invitation: {{tripName}}',
        template: `
          <h1>You're Invited to a Trip!</h1>
          <p>Dear {{userName}},</p>
          <p>{{inviterName}} has invited you to join the trip "{{tripName}}".</p>
          <p><strong>Trip Dates:</strong> {{startDate}} to {{endDate}}</p>
          <p><strong>Destination:</strong> {{destination}}</p>
          <a href="{{actionUrl}}">Accept Invitation</a>
        `,
        variables: ['userName', 'inviterName', 'tripName', 'startDate', 'endDate', 'destination', 'actionUrl'],
        createdAt: new Date(),
      },
      {
        id: 'collaboration-invite-sms',
        category: 'collaboration',
        channel: 'sms',
        template: '{{inviterName}} invited you to join trip "{{tripName}}" ({{startDate}}-{{endDate}}). {{actionUrl}}',
        variables: ['inviterName', 'tripName', 'startDate', 'endDate', 'actionUrl'],
        createdAt: new Date(),
      },

      // Marketing templates
      {
        id: 'marketing-promo-email',
        category: 'marketing',
        channel: 'email',
        subject: 'Special Offer: {{offerTitle}}',
        template: `
          <h1>{{offerTitle}}</h1>
          <p>Dear {{userName}},</p>
          <p>{{offerDescription}}</p>
          <p><strong>Discount:</strong> {{discount}}</p>
          <p><strong>Valid Until:</strong> {{expiryDate}}</p>
          <a href="{{actionUrl}}">Claim Offer</a>
        `,
        variables: ['userName', 'offerTitle', 'offerDescription', 'discount', 'expiryDate', 'actionUrl'],
        createdAt: new Date(),
      },
      {
        id: 'marketing-promo-sms',
        category: 'marketing',
        channel: 'sms',
        template: 'Special offer: {{offerTitle}}! {{discount}} off. Valid until {{expiryDate}}. {{actionUrl}}',
        variables: ['offerTitle', 'discount', 'expiryDate', 'actionUrl'],
        createdAt: new Date(),
      },

      // System templates
      {
        id: 'system-maintenance-email',
        category: 'system',
        channel: 'email',
        subject: 'Scheduled Maintenance: {{maintenanceType}}',
        template: `
          <h1>Scheduled Maintenance Notice</h1>
          <p>Dear {{userName}},</p>
          <p>We will be performing scheduled maintenance on {{maintenanceType}}.</p>
          <p><strong>Start Time:</strong> {{startTime}}</p>
          <p><strong>Expected Duration:</strong> {{duration}}</p>
          <p><strong>Impact:</strong> {{impact}}</p>
        `,
        variables: ['userName', 'maintenanceType', 'startTime', 'duration', 'impact'],
        createdAt: new Date(),
      },
      {
        id: 'system-maintenance-sms',
        category: 'system',
        channel: 'sms',
        template: 'Maintenance scheduled for {{maintenanceType}} from {{startTime}} for {{duration}}. {{impact}}',
        variables: ['maintenanceType', 'startTime', 'duration', 'impact'],
        createdAt: new Date(),
      },
    ];

    // Load default templates
    for (const template of this.defaultTemplates) {
      this.templates.set(template.id, template);
    }

    logger.info('Default notification templates initialized', {
      count: this.defaultTemplates.length,
    });
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): NotificationTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get template by category and channel
   */
  getTemplateByCategoryAndChannel(
    category: NotificationCategory,
    channel: NotificationChannel,
  ): NotificationTemplate | undefined {
    for (const template of this.templates.values()) {
      if (template.category === category && template.channel === channel) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * Register custom template
   */
  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
    logger.info('Custom template registered', { id: template.id });
  }

  /**
   * Update template
   */
  updateTemplate(id: string, updates: Partial<NotificationTemplate>): boolean {
    const template = this.templates.get(id);
    if (!template) return false;

    const updated = { ...template, ...updates };
    this.templates.set(id, updated);
    logger.info('Template updated', { id });

    return true;
  }

  /**
   * Delete template
   */
  deleteTemplate(id: string): boolean {
    const deleted = this.templates.delete(id);
    if (deleted) {
      logger.info('Template deleted', { id });
    }
    return deleted;
  }

  /**
   * Render template with variables
   */
  renderTemplate(
    templateId: string,
    variables: Record<string, any>,
  ): RenderedTemplate {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const rendered = this.renderString(template.template, variables);
    const result: RenderedTemplate = {
      body: rendered,
      variables,
    };

    if (template.subject) {
      result.subject = this.renderString(template.subject, variables);
    }

    return result;
  }

  /**
   * Render template string with variables
   */
  private renderString(template: string, variables: Record<string, any>): string {
    let rendered = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }

    return rendered;
  }

  /**
   * Validate template variables
   */
  validateTemplateVariables(
    templateId: string,
    variables: Record<string, any>,
  ): { valid: boolean; missing: string[] } {
    const template = this.templates.get(templateId);
    if (!template) {
      return { valid: false, missing: [`Template not found: ${templateId}`] };
    }

    const missing: string[] = [];

    for (const variable of template.variables) {
      if (!(variable in variables)) {
        missing.push(variable);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get all templates
   */
  getAllTemplates(): NotificationTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: NotificationCategory): NotificationTemplate[] {
    return Array.from(this.templates.values()).filter(
      t => t.category === category,
    );
  }

  /**
   * Get templates by channel
   */
  getTemplatesByChannel(channel: NotificationChannel): NotificationTemplate[] {
    return Array.from(this.templates.values()).filter(
      t => t.channel === channel,
    );
  }

  /**
   * Get template variables
   */
  getTemplateVariables(templateId: string): TemplateVariable[] {
    const template = this.templates.get(templateId);
    if (!template) return [];

    return template.variables.map(name => ({
      name,
      type: 'string',
      required: true,
      description: `Variable ${name}`,
    }));
  }

  /**
   * Clone template
   */
  cloneTemplate(templateId: string, newId: string): NotificationTemplate | undefined {
    const template = this.templates.get(templateId);
    if (!template) return undefined;

    const cloned: NotificationTemplate = {
      ...template,
      id: newId,
      createdAt: new Date(),
    };

    this.templates.set(newId, cloned);
    logger.info('Template cloned', { from: templateId, to: newId });

    return cloned;
  }

  /**
   * Reset to default templates
   */
  resetToDefaults(): void {
    this.templates.clear();
    this.initializeDefaultTemplates();
    logger.info('Templates reset to defaults');
  }

  /**
   * Export templates
   */
  exportTemplates(): NotificationTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Import templates
   */
  importTemplates(templates: NotificationTemplate[]): void {
    for (const template of templates) {
      this.templates.set(template.id, template);
    }
    logger.info('Templates imported', { count: templates.length });
  }

  /**
   * Get template statistics
   */
  getStatistics(): {
    total: number;
    byCategory: Record<NotificationCategory, number>;
    byChannel: Record<NotificationChannel, number>;
    custom: number;
    default: number;
  } {
    const templates = Array.from(this.templates.values());
    const defaultIds = new Set(this.defaultTemplates.map(t => t.id));

    const byCategory: Record<NotificationCategory, number> = {
      booking: 0,
      payment: 0,
      itinerary: 0,
      collaboration: 0,
      marketing: 0,
      system: 0,
    };

    const byChannel: Record<NotificationChannel, number> = {
      email: 0,
      sms: 0,
      push: 0,
      inapp: 0,
    };

    let custom = 0;

    for (const template of templates) {
      byCategory[template.category]++;
      byChannel[template.channel]++;
      if (!defaultIds.has(template.id)) {
        custom++;
      }
    }

    return {
      total: templates.length,
      byCategory,
      byChannel,
      custom,
      default: templates.length - custom,
    };
  }
}
