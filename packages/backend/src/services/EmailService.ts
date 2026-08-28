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

// ---------------------------------------------------------------------------
// Notification-specific data interfaces (issue #317)
// ---------------------------------------------------------------------------

export interface BookingConfirmationData {
  to: string;
  recipientName: string;
  bookingReference: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  passengerCount: number;
  totalAmount: string;
  bookingUrl: string;
}

export interface FlightDelayData {
  to: string;
  recipientName: string;
  flightNumber: string;
  origin: string;
  destination: string;
  delayMinutes: number;
  newDepartureTime?: string;
  bookingReference: string;
}

export interface FlightCancelledData {
  to: string;
  recipientName: string;
  flightNumber: string;
  origin: string;
  destination: string;
  bookingReference: string;
  cancellationReason?: string;
  refundAmount?: string;
}

export interface RefundNotificationData {
  to: string;
  recipientName: string;
  bookingReference: string;
  refundAmount: string;
  originalAmount: string;
  refundMethod: string;
  processingDays: number;
}

export interface GateChangeData {
  to: string;
  recipientName: string;
  flightNumber: string;
  previousGate: string;
  newGate: string;
  terminal: string;
  boardingTime: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Generic send
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Itinerary collaboration emails (pre-existing)
  // -------------------------------------------------------------------------

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
          This invitation expires in 7 days.
        </p>
      </div>`;

    return this.send({
      to: recipientEmail,
      subject: `${senderName} shared a travel itinerary with you`,
      html,
      text: `${senderName} has shared "${itineraryTitle}" with you. Visit ${invitationLink} to view it.`,
    });
  }

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
      </div>`;

    return this.send({
      to: ownerEmail,
      subject: `${collaboratorName} accepted your itinerary share`,
      html,
    });
  }

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
        <ul style="background-color: #f5f5f5; padding: 15px 30px; border-radius: 4px;">${changesList}</ul>
        <p>
          <a href="${itineraryLink}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Review Changes
          </a>
        </p>
      </div>`;

    return this.send({
      to: email,
      subject: `${updaterName} updated "${itineraryTitle}"`,
      html,
    });
  }

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
      </div>`;

    return this.send({
      to: collaboratorEmail,
      subject: `Your access to "${itineraryTitle}" has been revoked`,
      html,
    });
  }

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
      </div>`;

    return this.send({
      to: email,
      subject: `Edit conflict resolved in "${itineraryTitle}"`,
      html,
    });
  }

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

  // -------------------------------------------------------------------------
  // Notification-specific email templates (issue #317)
  // -------------------------------------------------------------------------

  async sendBookingConfirmation(data: BookingConfirmationData): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <h2 style="background:#0066cc;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;margin:0;">Booking Confirmed ✈️</h2>
        <div style="border:1px solid #ddd;border-top:0;padding:24px;border-radius:0 0 6px 6px;">
          <p>Hi <strong>${data.recipientName}</strong>, your booking is confirmed!</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#f5f8ff;"><td style="padding:8px 12px;font-weight:bold;">Booking Ref</td><td style="padding:8px 12px;">${data.bookingReference}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Flight</td><td style="padding:8px 12px;">${data.flightNumber}</td></tr>
            <tr style="background:#f5f8ff;"><td style="padding:8px 12px;font-weight:bold;">Route</td><td style="padding:8px 12px;">${data.origin} → ${data.destination}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Departure</td><td style="padding:8px 12px;">${data.departureDate}</td></tr>
            <tr style="background:#f5f8ff;"><td style="padding:8px 12px;font-weight:bold;">Passengers</td><td style="padding:8px 12px;">${data.passengerCount}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Total</td><td style="padding:8px 12px;color:#0066cc;font-weight:bold;">${data.totalAmount}</td></tr>
          </table>
          <p style="text-align:center;margin-top:24px;">
            <a href="${data.bookingUrl}" style="background:#0066cc;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;font-weight:bold;">View Booking</a>
          </p>
        </div>
      </div>`;

    return this.send({
      to: data.to,
      subject: `Booking Confirmed – ${data.flightNumber} (Ref: ${data.bookingReference})`,
      html,
      text: `Your booking is confirmed. Flight: ${data.flightNumber}, ${data.origin} → ${data.destination} on ${data.departureDate}. Ref: ${data.bookingReference}. Total: ${data.totalAmount}.`,
    });
  }

  async sendFlightDelay(data: FlightDelayData): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <h2 style="background:#ff9800;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;margin:0;">Flight Delay Notice ⚠️</h2>
        <div style="border:1px solid #ddd;border-top:0;padding:24px;border-radius:0 0 6px 6px;">
          <p>Hi <strong>${data.recipientName}</strong>, we are sorry to inform you of a delay.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#fff8e1;"><td style="padding:8px 12px;font-weight:bold;">Flight</td><td style="padding:8px 12px;">${data.flightNumber}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Route</td><td style="padding:8px 12px;">${data.origin} → ${data.destination}</td></tr>
            <tr style="background:#fff8e1;"><td style="padding:8px 12px;font-weight:bold;">Delay</td><td style="padding:8px 12px;color:#e65100;font-weight:bold;">${data.delayMinutes} minutes</td></tr>
            ${data.newDepartureTime ? `<tr><td style="padding:8px 12px;font-weight:bold;">New Departure</td><td style="padding:8px 12px;">${data.newDepartureTime}</td></tr>` : ""}
            <tr style="background:#fff8e1;"><td style="padding:8px 12px;font-weight:bold;">Booking Ref</td><td style="padding:8px 12px;">${data.bookingReference}</td></tr>
          </table>
          <p>We apologise for any inconvenience. Please check the Traqora app for the latest updates.</p>
        </div>
      </div>`;

    return this.send({
      to: data.to,
      subject: `Flight ${data.flightNumber} Delayed by ${data.delayMinutes} Minutes`,
      html,
      text: `Flight ${data.flightNumber} (${data.origin} → ${data.destination}) is delayed by ${data.delayMinutes} minutes. Booking ref: ${data.bookingReference}.`,
    });
  }

  async sendFlightCancelled(data: FlightCancelledData): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <h2 style="background:#d32f2f;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;margin:0;">Flight Cancelled ❌</h2>
        <div style="border:1px solid #ddd;border-top:0;padding:24px;border-radius:0 0 6px 6px;">
          <p>Hi <strong>${data.recipientName}</strong>, unfortunately your flight has been cancelled.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#ffebee;"><td style="padding:8px 12px;font-weight:bold;">Flight</td><td style="padding:8px 12px;">${data.flightNumber}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Route</td><td style="padding:8px 12px;">${data.origin} → ${data.destination}</td></tr>
            <tr style="background:#ffebee;"><td style="padding:8px 12px;font-weight:bold;">Booking Ref</td><td style="padding:8px 12px;">${data.bookingReference}</td></tr>
            ${data.cancellationReason ? `<tr><td style="padding:8px 12px;font-weight:bold;">Reason</td><td style="padding:8px 12px;">${data.cancellationReason}</td></tr>` : ""}
            ${data.refundAmount ? `<tr style="background:#ffebee;"><td style="padding:8px 12px;font-weight:bold;">Refund</td><td style="padding:8px 12px;color:#1b5e20;font-weight:bold;">${data.refundAmount}</td></tr>` : ""}
          </table>
          ${data.refundAmount ? "<p>A refund has been automatically initiated. Please allow 3–5 business days.</p>" : "<p>Please contact our support team for rebooking options.</p>"}
        </div>
      </div>`;

    return this.send({
      to: data.to,
      subject: `Important: Flight ${data.flightNumber} Cancelled`,
      html,
      text: `Flight ${data.flightNumber} (${data.origin} → ${data.destination}) has been cancelled. Booking ref: ${data.bookingReference}.${data.refundAmount ? ` Refund of ${data.refundAmount} initiated.` : ""}`,
    });
  }

  async sendRefundNotification(data: RefundNotificationData): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <h2 style="background:#2e7d32;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;margin:0;">Refund Processed 💸</h2>
        <div style="border:1px solid #ddd;border-top:0;padding:24px;border-radius:0 0 6px 6px;">
          <p>Hi <strong>${data.recipientName}</strong>, your refund has been processed.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#e8f5e9;"><td style="padding:8px 12px;font-weight:bold;">Booking Ref</td><td style="padding:8px 12px;">${data.bookingReference}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Original Amount</td><td style="padding:8px 12px;">${data.originalAmount}</td></tr>
            <tr style="background:#e8f5e9;"><td style="padding:8px 12px;font-weight:bold;">Refund Amount</td><td style="padding:8px 12px;color:#1b5e20;font-weight:bold;">${data.refundAmount}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Refund To</td><td style="padding:8px 12px;">${data.refundMethod}</td></tr>
            <tr style="background:#e8f5e9;"><td style="padding:8px 12px;font-weight:bold;">Processing Time</td><td style="padding:8px 12px;">${data.processingDays} business days</td></tr>
          </table>
        </div>
      </div>`;

    return this.send({
      to: data.to,
      subject: `Refund of ${data.refundAmount} Processed – Ref: ${data.bookingReference}`,
      html,
      text: `Refund of ${data.refundAmount} for booking ${data.bookingReference} has been processed. Expected within ${data.processingDays} business days to ${data.refundMethod}.`,
    });
  }

  async sendGateChange(data: GateChangeData): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <h2 style="background:#1565c0;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;margin:0;">Gate Change Notice 🚪</h2>
        <div style="border:1px solid #ddd;border-top:0;padding:24px;border-radius:0 0 6px 6px;">
          <p>Hi <strong>${data.recipientName}</strong>, your departure gate has changed.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr style="background:#e3f2fd;"><td style="padding:8px 12px;font-weight:bold;">Flight</td><td style="padding:8px 12px;">${data.flightNumber}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Previous Gate</td><td style="padding:8px 12px;text-decoration:line-through;color:#b71c1c;">${data.previousGate}</td></tr>
            <tr style="background:#e3f2fd;"><td style="padding:8px 12px;font-weight:bold;">New Gate</td><td style="padding:8px 12px;color:#0d47a1;font-weight:bold;">${data.newGate}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Terminal</td><td style="padding:8px 12px;">${data.terminal}</td></tr>
            <tr style="background:#e3f2fd;"><td style="padding:8px 12px;font-weight:bold;">Boarding Time</td><td style="padding:8px 12px;">${data.boardingTime}</td></tr>
          </table>
          <p>Please proceed to the new gate. Boarding begins at ${data.boardingTime}.</p>
        </div>
      </div>`;

    return this.send({
      to: data.to,
      subject: `Gate Change: Flight ${data.flightNumber} now at Gate ${data.newGate}`,
      html,
      text: `Gate change for flight ${data.flightNumber}. New gate: ${data.newGate}, terminal ${data.terminal}. Boarding at ${data.boardingTime}.`,
    });
  }
}

export const emailService = new EmailService();
