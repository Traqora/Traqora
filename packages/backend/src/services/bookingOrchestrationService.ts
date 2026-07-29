import { AppDataSource } from "../db/dataSource";
import { Booking } from "../db/entities/Booking";
import { Flight } from "../db/entities/Flight";
import { Passenger } from "../db/entities/Passenger";
import { TravelDocument, DocumentType } from "../db/entities/TravelDocument";
import { GroupBooking } from "../db/entities/GroupBooking";
import { CheckIn } from "../db/entities/CheckIn";

import { getTransactionStatus, signAndSubmitCreateBooking } from "./soroban";
import { GroupBookingService } from "./groupBooking";

import { logger } from "../utils/logger";
import { withRetries } from "./retry";
import { config } from "../config";
import { BadRequestError } from "../utils/errors";
import { FareRulesService, FareClass } from "./fareRulesService";
import type {
  ChangeFeeQuote,
  CancellationRefund,
  UpgradeQuote,
} from "./fareRulesService";
import { getWebSocketServer } from "../websockets/server";
import { inflightServicesService } from "./inflightServicesService";
import { seatAvailabilityService } from "./seatAvailabilityService";
import crypto from 'crypto';

export interface StructuredName {
  title?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
}

export interface NameCorrectionRequest {
  id: string;
  bookingId: string;
  passengerId: string;
  originalName: StructuredName;
  correctedName: StructuredName;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
}

export type AirlineFormatKey = keyof typeof AIRLINE_NAME_FORMATS;

export const AIRLINE_NAME_FORMATS: Record<
  string,
  {
    label: string;
    format: string;
    maxLength: number;
    allowedChars: RegExp;
    nameRegex: RegExp;
    middleNameSupport: boolean;
    titleSupport: boolean;
    suffixSupport: boolean;
  }
> = {
  DELTA: {
    label: "Delta Air Lines",
    format: "LAST/FIRST MIDDLE",
    maxLength: 30,
    allowedChars: /^[A-Za-z\s\.\-\'\/]+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,29}$/,
    middleNameSupport: true,
    titleSupport: false,
    suffixSupport: true,
  },
  UNITED: {
    label: "United Airlines",
    format: "LAST/FIRST MIDDLE",
    maxLength: 28,
    allowedChars: /^[A-Za-z\s\.\-\'\/]+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,27}$/,
    middleNameSupport: true,
    titleSupport: false,
    suffixSupport: true,
  },
  AMERICAN: {
    label: "American Airlines",
    format: "LAST/FIRST MIDDLE",
    maxLength: 30,
    allowedChars: /^[A-Za-z\s\.\-\'\/]+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,29}$/,
    middleNameSupport: true,
    titleSupport: true,
    suffixSupport: true,
  },
  SOUTHWEST: {
    label: "Southwest Airlines",
    format: "FIRST LAST",
    maxLength: 40,
    allowedChars: /^[A-Za-z\s\.\-\']+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,39}$/,
    middleNameSupport: false,
    titleSupport: false,
    suffixSupport: false,
  },
  JETBLUE: {
    label: "JetBlue Airways",
    format: "FIRST MIDDLE LAST",
    maxLength: 40,
    allowedChars: /^[A-Za-z\s\.\-\']+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,39}$/,
    middleNameSupport: true,
    titleSupport: false,
    suffixSupport: true,
  },
  EMIRATES: {
    label: "Emirates",
    format: "MR/MRS FIRST MIDDLE LAST",
    maxLength: 50,
    allowedChars: /^[A-Za-z\s\.\-\']+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,49}$/,
    middleNameSupport: true,
    titleSupport: true,
    suffixSupport: false,
  },
  BRITISH_AIRWAYS: {
    label: "British Airways",
    format: "TITLE FIRST MIDDLE LAST SUFFIX",
    maxLength: 50,
    allowedChars: /^[A-Za-z\s\.\-\'\/]+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,49}$/,
    middleNameSupport: true,
    titleSupport: true,
    suffixSupport: true,
  },
  LUFTHANSA: {
    label: "Lufthansa",
    format: "LAST/FIRST",
    maxLength: 30,
    allowedChars: /^[A-Za-z\s\.\-\'\/]+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,29}$/,
    middleNameSupport: true,
    titleSupport: true,
    suffixSupport: false,
  },
  RYANAIR: {
    label: "Ryanair",
    format: "FIRST LAST",
    maxLength: 35,
    allowedChars: /^[A-Za-z\s\.\-\']+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,34}$/,
    middleNameSupport: false,
    titleSupport: false,
    suffixSupport: false,
  },
  EASYJET: {
    label: "easyJet",
    format: "FIRST LAST",
    maxLength: 30,
    allowedChars: /^[A-Za-z\s\.\-\']+$/,
    nameRegex: /^[A-Za-z][A-Za-z\s\.\-\']{0,29}$/,
    middleNameSupport: false,
    titleSupport: false,
    suffixSupport: false,
  },
};

const VALID_TITLES = [
  "Mr",
  "Mrs",
  "Ms",
  "Miss",
  "Dr",
  "Prof",
  "Sir",
  "Lady",
  "Lord",
  "Capt",
  "Col",
  "Maj",
];
const VALID_SUFFIXES = [
  "Jr",
  "Sr",
  "II",
  "III",
  "IV",
  "V",
  "PhD",
  "MD",
  "Esq",
  "CPA",
  "DDS",
  "RN",
];

const correctionRequests: Map<string, NameCorrectionRequest> = new Map();
const nameChangeHistory: Map<string, any[]> = new Map();

export class BookingOrchestrationService {
  private bookingRepo = AppDataSource.getRepository(Booking);
  private flightRepo = AppDataSource.getRepository(Flight);
  private passengerRepo = AppDataSource.getRepository(Passenger);

  async createBooking(params: {
    flightId: string;
    passenger: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      sorobanAddress: string;
    };
    idempotencyKey: string;
    walletAddress?: string;
  }): Promise<Booking> {
    const flight = await this.flightRepo.findOne({
      where: { id: params.flightId },
    });
    if (!flight) throw new Error("Flight not found");
    if (flight.seatsAvailable <= 0) throw new Error("Flight sold out");

    const updated = await this.flightRepo
      .createQueryBuilder()
      .update(Flight)
      .set({ seatsAvailable: () => "seatsAvailable - 1" })
      .where("id = :id", { id: flight.id })
      .andWhere("seatsAvailable > 0")
      .execute();

    if (!updated.affected) throw new Error("Flight sold out");

    const passenger = this.passengerRepo.create(params.passenger);
    await this.passengerRepo.save(passenger);

    try {
      const result = await signAndSubmitCreateBooking({
        passenger: passenger.sorobanAddress,
        airline: flight.airlineSorobanAddress,
        flightNumber: flight.flightNumber,
        fromAirport: flight.fromAirport,
        toAirport: flight.toAirport,
        departureTime: Math.floor(flight.departureTime.getTime() / 1000),
        price: BigInt(flight.priceCents),
        token: config.contracts.token,
      });

      const booking = this.bookingRepo.create({
        idempotencyKey: params.idempotencyKey,
        walletAddress: params.walletAddress ?? null,
        flight,
        passenger,
        status: "onchain_submitted",
        amountCents: flight.priceCents,
        sorobanTxHash: result.txHash,
      });

      const savedBooking = await this.bookingRepo.save(booking);

      this.pollTransactionStatus(savedBooking.id, result.txHash).catch(
        (err) => {
          logger.error("Error polling transaction status", {
            bookingId: savedBooking.id,
            error: err.message,
          });
        },
      );

      return savedBooking;
    } catch (error: any) {
      logger.error("Booking orchestration failed during submission", {
        error: error.message,
      });

      await this.flightRepo.increment({ id: flight.id }, "seatsAvailable", 1);

      throw error;
    }
  }

  private async pollTransactionStatus(bookingId: string, txHash: string) {
    try {
      await withRetries(
        async () => {
          const status = await getTransactionStatus(txHash);

          const booking = await this.bookingRepo.findOne({
            where: { id: bookingId },
            relations: ["flight"],
          });
          if (!booking) return;

          if (status.status === "success") {
            booking.status = "confirmed";
            if (status.result) {
              booking.sorobanBookingId = status.result.toString();
            }
            await this.bookingRepo.save(booking);
            logger.info("Booking confirmed on-chain", { bookingId, txHash });

            // Broadcast booking status update via WebSocket
            try {
              const wsServer = getWebSocketServer();
              wsServer.broadcastBookingStatus(bookingId, "confirmed");
            } catch (wsError) {
              logger.warn("Failed to broadcast booking status via WebSocket", {
                bookingId,
                error: wsError,
              });
            }
          } else if (status.status === "failed") {
            booking.status = "failed";
            booking.lastError = status.error || "Transaction failed";
            await this.bookingRepo.save(booking);

            await this.flightRepo.increment(
              { id: booking.flight.id },
              "seatsAvailable",
              1,
            );
            logger.error("Booking failed on-chain", {
              bookingId,
              txHash,
              error: status.error,
            });

            // Broadcast booking status update via WebSocket
            try {
              const wsServer = getWebSocketServer();
              wsServer.broadcastBookingStatus(bookingId, "failed");
            } catch (wsError) {
              logger.warn("Failed to broadcast booking status via WebSocket", {
                bookingId,
                error: wsError,
              });
            }
          } else if (status.status === "pending") {
            throw new Error("Transaction still pending");
          } else if (status.status === "not_found") {
            throw new Error("Transaction not found yet");
          }
        },
        {
          maxAttempts: 20,
          delayMs: 5000,
          backoff: true,
        },
      );
    } catch (error: any) {
      logger.error("Max retries reached for booking status polling", {
        bookingId,
        txHash,
        error: error.message,
      });
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId },
      });
      if (booking && booking.status === "onchain_submitted") {
        booking.status = "failed";
        booking.lastError = "Transaction status polling timed out";
        await this.bookingRepo.save(booking);

        // Broadcast booking status update via WebSocket
        try {
          const wsServer = getWebSocketServer();
          wsServer.broadcastBookingStatus(bookingId, "failed");
        } catch (wsError) {
          logger.warn("Failed to broadcast booking status via WebSocket", {
            bookingId,
            error: wsError,
          });
        }
      }
    }
  }

  validatePassengerName(
    name: StructuredName,
    airline?: AirlineFormatKey,
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name.firstName || name.firstName.trim().length === 0) {
      errors.push("First name is required");
    }
    if (!name.lastName || name.lastName.trim().length === 0) {
      errors.push("Last name is required");
    }

    if (name.title && !VALID_TITLES.includes(name.title)) {
      warnings.push(
        `Unrecognized title "${name.title}". Valid titles: ${VALID_TITLES.join(", ")}`,
      );
    }
    if (name.suffix && !VALID_SUFFIXES.includes(name.suffix)) {
      warnings.push(
        `Unrecognized suffix "${name.suffix}". Valid suffixes: ${VALID_SUFFIXES.join(", ")}`,
      );
    }

    const fullName = [name.firstName, name.middleName, name.lastName]
      .filter(Boolean)
      .join(" ");
    if (fullName.length > 100) {
      errors.push("Full name exceeds maximum length of 100 characters");
    }

    const allowedGlobal = /^[A-Za-z\s\.\-\']+$/;
    if (!allowedGlobal.test(fullName)) {
      errors.push(
        "Name contains invalid characters. Only letters, spaces, dots, hyphens, and apostrophes are allowed",
      );
    }

    if (airline && AIRLINE_NAME_FORMATS[airline]) {
      const airlineRules = AIRLINE_NAME_FORMATS[airline];
      const formatted = this.formatNameForAirline(name, airline);

      if (!airlineRules.nameRegex.test(name.firstName)) {
        errors.push(
          `First name does not meet ${airlineRules.label} requirements`,
        );
      }
      if (!airlineRules.nameRegex.test(name.lastName)) {
        errors.push(
          `Last name does not meet ${airlineRules.label} requirements`,
        );
      }
      if (name.middleName && !airlineRules.middleNameSupport) {
        warnings.push(
          `${airlineRules.label} does not support middle names. Middle name will be omitted`,
        );
      }
      if (name.title && !airlineRules.titleSupport) {
        warnings.push(
          `${airlineRules.label} does not support titles. Title "${name.title}" will be omitted`,
        );
      }
      if (name.suffix && !airlineRules.suffixSupport) {
        warnings.push(
          `${airlineRules.label} does not support suffixes. Suffix "${name.suffix}" will be omitted`,
        );
      }

      if (formatted.length > airlineRules.maxLength) {
        errors.push(
          `Formatted name "${formatted}" (${formatted.length} chars) exceeds ${airlineRules.label} maximum of ${airlineRules.maxLength} characters`,
        );
      }

      if (!airlineRules.allowedChars.test(formatted.replace(/\//g, ""))) {
        errors.push(
          `Name contains characters not allowed by ${airlineRules.label}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  formatNameForAirline(
    name: StructuredName,
    airline: AirlineFormatKey,
  ): string {
    const rules = AIRLINE_NAME_FORMATS[airline];
    if (!rules) {
      return `${name.lastName}/${name.firstName}${name.middleName ? " " + name.middleName : ""}`;
    }

    const firstName = name.firstName.toUpperCase();
    const lastName = name.lastName.toUpperCase();
    const middleName = name.middleName?.toUpperCase();
    const title = name.title?.toUpperCase();
    const suffix = name.suffix?.toUpperCase();

    switch (airline) {
      case "DELTA":
      case "UNITED":
      case "AMERICAN":
        return `${lastName}/${firstName}${middleName ? " " + middleName : ""}`;
      case "SOUTHWEST":
      case "RYANAIR":
      case "EASYJET":
        return `${firstName} ${lastName}`;
      case "JETBLUE":
        return `${firstName}${middleName ? " " + middleName : ""} ${lastName}`;
      case "EMIRATES":
        return `${title ? title + " " : ""}${firstName}${middleName ? " " + middleName : ""} ${lastName}`;
      case "BRITISH_AIRWAYS":
        return `${title ? title + " " : ""}${firstName}${middleName ? " " + middleName : ""} ${lastName}${suffix ? " " + suffix : ""}`;
      case "LUFTHANSA":
        return `${lastName}/${firstName}`;
      default:
        return `${lastName}/${firstName}${middleName ? " " + middleName : ""}`;
    }
  }

  async requestNameCorrection(
    bookingId: string,
    passengerId: string,
    correctedName: StructuredName,
    reason: string,
  ): Promise<NameCorrectionRequest> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["passenger"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }

    const passenger = await this.passengerRepo.findOne({
      where: { id: passengerId },
    });
    if (!passenger) {
      throw new BadRequestError("Passenger not found");
    }

    if (!isBookingEditable(booking.status)) {
      throw new BadRequestError(
        "Booking is not in an editable state for name correction",
      );
    }

    const originalName: StructuredName = {
      title: passenger.title || undefined,
      firstName: passenger.firstName,
      middleName: passenger.middleName || undefined,
      lastName: passenger.lastName,
      suffix: passenger.suffix || undefined,
    };

    const validation = this.validatePassengerName(correctedName);
    if (!validation.valid) {
      throw new BadRequestError("Invalid corrected name", validation.errors);
    }

    if (reason.trim().length < 10) {
      throw new BadRequestError("Reason must be at least 10 characters");
    }

    const validReasons = [
      "typo_in_first_name",
      "typo_in_last_name",
      "missing_middle_name",
      "incorrect_spelling",
      "name_format_change",
      "marriage_name_change",
      "legal_name_change",
      "passport_name_mismatch",
      "title_correction",
      "suffix_correction",
      "other",
    ];

    if (!validReasons.includes(reason)) {
      throw new BadRequestError(
        `Invalid reason. Valid reasons: ${validReasons.join(", ")}`,
      );
    }

    const correctionId = `CORR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const request: NameCorrectionRequest = {
      id: correctionId,
      bookingId,
      passengerId,
      originalName,
      correctedName,
      reason,
      status: "pending",
      createdAt: new Date(),
    };

    correctionRequests.set(correctionId, request);

    this.recordNameHistory(bookingId, passengerId, {
      action: "correction_requested",
      originalName,
      correctedName,
      reason,
      timestamp: new Date(),
      requestId: correctionId,
    });

    logger.info("Name correction requested", {
      bookingId,
      passengerId,
      correctionId,
      reason,
    });

    return request;
  }

  async approveNameCorrection(
    correctionId: string,
    reviewedBy: string,
  ): Promise<NameCorrectionRequest> {
    const request = correctionRequests.get(correctionId);
    if (!request) {
      throw new BadRequestError("Correction request not found");
    }

    if (request.status !== "pending") {
      throw new BadRequestError(
        `Correction request is already ${request.status}`,
      );
    }

    request.status = "approved";
    request.reviewedBy = reviewedBy;
    request.reviewedAt = new Date();

    const passenger = await this.passengerRepo.findOne({
      where: { id: request.passengerId },
    });
    if (passenger) {
      passenger.firstName = request.correctedName.firstName;
      passenger.lastName = request.correctedName.lastName;
      passenger.middleName = request.correctedName.middleName || null;
      passenger.title = request.correctedName.title || null;
      passenger.suffix = request.correctedName.suffix || null;
      await this.passengerRepo.save(passenger);
    }

    this.recordNameHistory(request.bookingId, request.passengerId, {
      action: "correction_approved",
      correctionId,
      reviewedBy,
      timestamp: new Date(),
    });

    logger.info("Name correction approved", {
      correctionId,
      bookingId: request.bookingId,
      reviewedBy,
    });

    return request;
  }

  async rejectNameCorrection(
    correctionId: string,
    reason: string,
  ): Promise<NameCorrectionRequest> {
    const request = correctionRequests.get(correctionId);
    if (!request) {
      throw new BadRequestError("Correction request not found");
    }

    if (request.status !== "pending") {
      throw new BadRequestError(
        `Correction request is already ${request.status}`,
      );
    }

    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError(
        "Rejection reason must be at least 5 characters",
      );
    }

    request.status = "rejected";
    request.rejectionReason = reason;

    this.recordNameHistory(request.bookingId, request.passengerId, {
      action: "correction_rejected",
      correctionId,
      reason,
      timestamp: new Date(),
    });

    logger.info("Name correction rejected", {
      correctionId,
      bookingId: request.bookingId,
      reason,
    });

    return request;
  }

  async getBookingFareRules(bookingId: string) {
    const fareService = new FareRulesService();
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }
    return fareService.getApplicableFareRules(booking.flight);
  }

  async calculateBookingChangeFee(
    bookingId: string,
    newDate: string,
  ): Promise<ChangeFeeQuote> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }
    const fareService = new FareRulesService();
    const parsedDate = new Date(newDate);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestError("Invalid date format");
    }
    return fareService.calculateChangeFee(booking, parsedDate);
  }

  async calculateBookingCancellationRefund(
    bookingId: string,
  ): Promise<CancellationRefund> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }
    const fareService = new FareRulesService();
    return fareService.calculateCancellationRefund(booking);
  }

  async processCancellation(
    bookingId: string,
  ): Promise<{
    success: boolean;
    refund: CancellationRefund;
    message: string;
  }> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }

    if (booking.status === "refunded") {
      throw new BadRequestError("Booking has already been refunded");
    }

    const fareService = new FareRulesService();
    const refund = fareService.calculateCancellationRefund(booking);

    if (!refund.eligible) {
      return {
        success: false,
        refund,
        message: "Booking is not eligible for cancellation refund",
      };
    }

    booking.status = "refunded";
    await this.bookingRepo.save(booking);

    logger.info("Booking cancelled and refunded", {
      bookingId,
      refundCents: refund.netRefundCents,
    });

    return {
      success: true,
      refund,
      message: `Booking cancelled. Refund of $${(refund.netRefundCents / 100).toFixed(2)} processed`,
    };
  }

  async calculateUpgradePrice(
    bookingId: string,
    targetClass: FareClass,
  ): Promise<UpgradeQuote> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }
    const fareService = new FareRulesService();
    return fareService.calculateUpgradePrice(booking, targetClass);
  }

  async processUpgrade(
    bookingId: string,
    targetClass: FareClass,
  ): Promise<{ success: boolean; upgrade: UpgradeQuote; message: string }> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });
    if (!booking) {
      throw new BadRequestError("Booking not found");
    }

    const fareService = new FareRulesService();
    const upgrade = fareService.calculateUpgradePrice(booking, targetClass);

    if (!isBookingEditable(booking.status)) {
      throw new BadRequestError(
        "Booking is not in an editable state for upgrade",
      );
    }

    logger.info("Booking upgrade processed", {
      bookingId,
      fromClass: upgrade.fromClass,
      toClass: upgrade.toClass,
      fee: upgrade.totalDueCents,
    });

    return {
      success: true,
      upgrade,
      message: `Upgrade from ${upgrade.fromClass} to ${upgrade.toClass} quoted at $${(upgrade.totalDueCents / 100).toFixed(2)}`,
    };
  }

  calculateNameChangeFee(
    _bookingId: string,
    isMinorCorrection: boolean,
  ): {
    feeCents: number;
    currency: string;
    breakdown: { label: string; amount: number }[];
  } {
    const breakdown: { label: string; amount: number }[] = [];

    if (isMinorCorrection) {
      breakdown.push({ label: "Name correction fee (minor)", amount: 0 });
      return {
        feeCents: 0,
        currency: "USD",
        breakdown,
      };
    }

    breakdown.push({ label: "Name change processing fee", amount: 5000 });
    breakdown.push({ label: "Reissue ticket fee", amount: 2500 });
    breakdown.push({ label: "Airline penalty (estimated)", amount: 7500 });

    const total = breakdown.reduce((sum, item) => sum + item.amount, 0);

    return {
      feeCents: total,
      currency: "USD",
      breakdown,
    };
  }

  async verifyAgainstDocument(
    passengerId: string,
    documentType: DocumentType,
    documentNumber: string,
  ): Promise<{ verified: boolean; matchScore: number; details: string }> {
    const passenger = await this.passengerRepo.findOne({
      where: { id: passengerId },
    });
    if (!passenger) {
      throw new BadRequestError("Passenger not found");
    }

    const docRepo = AppDataSource.getRepository(TravelDocument);
    const documents = await docRepo.find({ where: { documentType } });

    const matchingDoc = documents.find((doc: any) => {
      try {
        return (
          doc.documentNumber.replace(/\s/g, "").toUpperCase() ===
          documentNumber.replace(/\s/g, "").toUpperCase()
        );
      } catch {
        return false;
      }
    });

    if (!matchingDoc) {
      return {
        verified: false,
        matchScore: 0,
        details: "No matching travel document found",
      };
    }

    const passengerName =
      `${passenger.firstName} ${passenger.lastName}`.toUpperCase();
    const docName = matchingDoc.fullName.toUpperCase();

    const passengerParts = passengerName.split(/\s+/);
    const docParts = docName.split(/\s+/);

    let matchedParts = 0;
    const totalParts = Math.max(passengerParts.length, docParts.length);

    for (const pp of passengerParts) {
      if (
        docParts.some(
          (dp: any) => dp === pp || dp.startsWith(pp) || pp.startsWith(dp),
        )
      ) {
        matchedParts++;
      }
    }

    const matchScore =
      totalParts > 0 ? Math.round((matchedParts / totalParts) * 100) : 0;
    const verified = matchScore >= 80;

    return {
      verified,
      matchScore,
      details: verified
        ? `Name matches travel document (${matchScore}% confidence)`
        : `Name mismatch: passenger name "${passengerName}" vs document name "${docName}" (${matchScore}% match)`,
    };
  }

  getPassengerNameHistory(bookingId: string, passengerId: string): any[] {
    const key = `${bookingId}:${passengerId}`;
    return nameChangeHistory.get(key) || [];
  }

  private recordNameHistory(
    bookingId: string,
    passengerId: string,
    entry: any,
  ) {
    const key = `${bookingId}:${passengerId}`;
    if (!nameChangeHistory.has(key)) {
      nameChangeHistory.set(key, []);
    }
    nameChangeHistory.get(key)!.push(entry);
  }

  async createGroupBooking(params: {
    groupName: string;
    flightId: string;
    organizerEmail: string;
    memberEmails: string[];
    splitMethod: 'equal' | 'custom' | 'percentage';
    corporateAccountId?: string;
    costCenter?: string;
    department?: string;
    bookingPolicyId?: string;
  }): Promise<GroupBooking> {
    const groupService = GroupBookingService.getInstance();
    return groupService.createGroupBooking({
      ...params,
      organizerWalletAddress: undefined,
    });
  }

  async groupCheckIn(
    groupBookingId: string,
    seatAllocations?: Record<string, string>,
  ): Promise<{ checkedIn: number; errors: string[] }> {
    const groupService = GroupBookingService.getInstance();
    return groupService.checkInAllMembers(groupBookingId, seatAllocations);
  }

  async getGroupBooking(groupBookingId: string): Promise<GroupBooking | null> {
    const groupService = GroupBookingService.getInstance();
    return groupService.getGroupBooking(groupBookingId);
  }
}

function isBookingEditable(status: string): boolean {
  const editableStatuses = [
    "created",
    "awaiting_payment",
    "paid",
    "onchain_pending",
    "onchain_submitted",
    "confirmed",
  ];
  return editableStatuses.includes(status);
}
