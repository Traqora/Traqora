/**
 * Email Service for sending transactional emails
 */

import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "../utils/logger";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (config.emailProvider === "smtp") {
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword,
        },
      });
    }
  }

  /**
   * Send generic email
   */
  /**
   * Template-style convenience wrapper used by background workers:
   * renders a minimal HTML body from structured payload data.
   */
  async sendTemplate(
    to: string,
    template: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    return this.send({
      to,
      subject: `[Traqora] ${template.replace(/[_-]/g, ' ')}`,
      html: `<pre>${JSON.stringify({ template, ...data }, null, 2)}</pre>`,
    });
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      logger.warn("Email transporter not configured");
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: config.emailFrom || "noreply@traqora.com",
        ...options,
      });

      logger.info("Email sent", { to: options.to, subject: options.subject });
      return true;
    } catch (error) {
      logger.error("Failed to send email", { to: options.to, error });
      return false;
    }
  }

  /**
   * Send itinerary share invitation
   */
  async sendShareInvitation(
    recipientEmail: string,
    senderName: string,
    itineraryTitle: string,
    invitationLink: string,
    permissionLevel: string,
    message?: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You've been invited to collaborate!</h2>
        <p><strong>${senderName}</strong> has shared their travel itinerary with you.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${itineraryTitle}</h3>
          <p><strong>Permission Level:</strong> ${permissionLevel}</p>
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
        </div>

        <p>
          <a href="${invitationLink}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            View Itinerary
          </a>
        </p>

        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          This invitation expires in 7 days. After that, you'll need a new invitation to access the itinerary.
        </p>
      </div>
    `;

    return this.send({
      to: recipientEmail,
      subject: `${senderName} shared a travel itinerary with you`,
      html,
      text: `${senderName} has shared their travel itinerary "${itineraryTitle}" with you. Visit ${invitationLink} to view it.`,
    });
  }

  /**
   * Send access accepted notification
   */
  async sendAccessAccepted(
    ownerEmail: string,
    collaboratorName: string,
    itineraryTitle: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Access Accepted</h2>
        <p><strong>${collaboratorName}</strong> has accepted your invitation to collaborate on:</p>
        <h3 style="color: #0066cc;">${itineraryTitle}</h3>
        <p>You can now see their updates in real-time. Happy travels!</p>
      </div>
    `;

    return this.send({
      to: ownerEmail,
      subject: `${collaboratorName} accepted your itinerary share`,
      html,
    });
  }

  /**
   * Send itinerary update notification
   */
  async sendItineraryUpdate(
    email: string,
    updaterName: string,
    itineraryTitle: string,
    changes: Array<{ field: string; oldValue: any; newValue: any }>,
    itineraryLink: string,
  ): Promise<boolean> {
    const changesList = changes
      .map(
        (c) =>
          `<li><strong>${c.field}</strong>: "${c.oldValue}" → "${c.newValue}"</li>`,
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Itinerary Updated</h2>
        <p><strong>${updaterName}</strong> made changes to your shared itinerary:</p>
        <h3 style="color: #0066cc;">${itineraryTitle}</h3>
        <h4>Changes:</h4>
        <ul style="background-color: #f5f5f5; padding: 15px 30px; border-radius: 4px;">
          ${changesList}
        </ul>
        <p>
          <a href="${itineraryLink}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Review Changes
          </a>
        </p>
      </div>
    `;

    return this.send({
      to: email,
      subject: `${updaterName} updated "${itineraryTitle}"`,
      html,
    });
  }

  /**
   * Send access revoked notification
   */
  async sendAccessRevoked(
    collaboratorEmail: string,
    itineraryTitle: string,
    revokerName: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d9534f;">Access Revoked</h2>
        <p><strong>${revokerName}</strong> has revoked your access to:</p>
        <h3>${itineraryTitle}</h3>
        <p style="color: #666;">You no longer have access to view or edit this itinerary.</p>
      </div>
    `;

    return this.send({
      to: collaboratorEmail,
      subject: `Your access to "${itineraryTitle}" has been revoked`,
      html,
    });
  }

  /**
   * Send conflict resolution notification
   */
  async sendConflictResolution(
    email: string,
    itineraryTitle: string,
    conflictDescription: string,
    itineraryLink: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff9800;">Edit Conflict Resolved</h2>
        <p>A conflict was detected in your shared itinerary:</p>
        <h3>${itineraryTitle}</h3>
        <p><strong>Conflict:</strong> ${conflictDescription}</p>
        <p style="color: #666; font-size: 14px;">The system automatically resolved the conflict by keeping the most recent change.</p>
        <p>
          <a href="${itineraryLink}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            View Full History
          </a>
        </p>
      </div>
    `;

    return this.send({
      to: email,
      subject: `Edit conflict resolved in "${itineraryTitle}"`,
      html,
    });
  }

  /**
   * Verify transporter is working
   */
  async verify(): Promise<boolean> {
    if (!this.transporter) return false;

    try {
      await this.transporter.verify();
      logger.info("Email transporter verified");
      return true;
    } catch (error) {
      logger.error("Email transporter verification failed", { error });
      return false;
    }
  }
}

export const emailService = new EmailService();
