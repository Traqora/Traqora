import crypto from 'crypto';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import { CheckIn } from '../db/entities/CheckIn';
import { Flight } from '../db/entities/Flight';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const CHECKIN_WINDOW_HOURS_BEFORE = 24;
const CHECKIN_WINDOW_MINUTES_BEFORE_CUTOFF = 45;

export interface CheckInWindow {
  opensAt: Date;
  closesAt: Date;
  isOpen: boolean;
}

export function getCheckInWindow(flight: Flight): CheckInWindow {
  const departure = new Date(flight.departureTime);
  const opensAt = new Date(departure.getTime() - CHECKIN_WINDOW_HOURS_BEFORE * 60 * 60 * 1000);
  const closesAt = new Date(departure.getTime() - CHECKIN_WINDOW_MINUTES_BEFORE_CUTOFF * 60 * 1000);
  const now = new Date();
  return {
    opensAt,
    closesAt,
    isOpen: now >= opensAt && now <= closesAt,
  };
}

function generateBoardingPassCode(booking: Booking): string {
  return crypto
    .createHash('sha256')
    .update(`${booking.id}:${booking.sorobanBookingId || booking.id}:${Date.now()}`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
}

export class CheckInService {
  private bookingRepo = AppDataSource.getRepository(Booking);
  private checkInRepo = AppDataSource.getRepository(CheckIn);

  async getWindow(bookingId: string): Promise<{ booking: Booking; window: CheckInWindow }> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    return { booking, window: getCheckInWindow(booking.flight) };
  }

  async checkIn(params: { bookingId: string; seatNumber?: string }): Promise<CheckIn> {
    const { booking, window } = await this.getWindow(params.bookingId);

    if (booking.status !== 'confirmed') {
      throw new ConflictError('Booking must be confirmed before check-in');
    }

    if (!window.isOpen) {
      const now = new Date();
      if (now < window.opensAt) {
        throw new BadRequestError(
          `Check-in opens at ${window.opensAt.toISOString()}`,
        );
      }
      throw new BadRequestError('Check-in window has closed for this flight');
    }

    let checkIn = await this.checkInRepo.findOne({ where: { booking: { id: booking.id } } });

    if (checkIn && checkIn.status === 'checked_in') {
      throw new ConflictError('Passenger is already checked in for this booking');
    }

    if (!checkIn) {
      checkIn = this.checkInRepo.create({
        booking,
        status: 'pending',
        boardingPassCode: generateBoardingPassCode(booking),
      });
    }

    checkIn.status = 'checked_in';
    checkIn.seatNumber = params.seatNumber || checkIn.seatNumber || null;
    checkIn.checkedInAt = new Date();

    await this.checkInRepo.save(checkIn);
    logger.info('Passenger checked in', { bookingId: booking.id, checkInId: checkIn.id });

    return checkIn;
  }

  async reselectSeat(bookingId: string, seatNumber: string): Promise<CheckIn> {
    const checkIn = await this.checkInRepo.findOne({ where: { booking: { id: bookingId } } });
    if (!checkIn) {
      throw new NotFoundError('No check-in found for this booking');
    }
    if (checkIn.status === 'cancelled') {
      throw new ConflictError('Cannot re-select seat for a cancelled check-in');
    }
    checkIn.seatNumber = seatNumber;
    await this.checkInRepo.save(checkIn);
    return checkIn;
  }

  async getCheckIn(bookingId: string): Promise<CheckIn> {
    const checkIn = await this.checkInRepo.findOne({ where: { booking: { id: bookingId } } });
    if (!checkIn) {
      throw new NotFoundError('No check-in found for this booking');
    }
    return checkIn;
  }

  async generateBoardingPassPdf(bookingId: string): Promise<Buffer> {
    const checkIn = await this.getCheckIn(bookingId);
    const booking = checkIn.booking;
    const flight = booking.flight;
    const passenger = booking.passenger;

    if (checkIn.status !== 'checked_in') {
      throw new ConflictError('Boarding pass is only available after check-in');
    }

    const qrDataUrl = await QRCode.toDataURL(checkIn.boardingPassCode, { margin: 1, width: 200 });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [400, 600], margin: 24 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Boarding Pass', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`${flight.fromAirport}  ->  ${flight.toAirport}`, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Passenger: ${passenger.firstName} ${passenger.lastName}`);
      doc.text(`Flight: ${flight.airlineCode}${flight.flightNumber}`);
      doc.text(`Departure: ${new Date(flight.departureTime).toISOString()}`);
      if (flight.gate) doc.text(`Gate: ${flight.gate}`);
      if (flight.terminal) doc.text(`Terminal: ${flight.terminal}`);
      doc.text(`Seat: ${checkIn.seatNumber || 'Not assigned'}`);
      doc.text(`Booking ID: ${booking.id}`);
      doc.text(`Boarding Pass Code: ${checkIn.boardingPassCode}`);

      doc.moveDown();
      doc.image(qrBuffer, { fit: [180, 180], align: 'center' });

      doc.end();
    });
  }

  async generateWalletPass(bookingId: string): Promise<Record<string, unknown>> {
    const checkIn = await this.getCheckIn(bookingId);
    const booking = checkIn.booking;
    const flight = booking.flight;
    const passenger = booking.passenger;

    if (checkIn.status !== 'checked_in') {
      throw new ConflictError('Wallet pass is only available after check-in');
    }

    const qrCode = await QRCode.toDataURL(checkIn.boardingPassCode, { margin: 1, width: 200 });

    return {
      formatVersion: 1,
      passTypeIdentifier: 'pass.com.traqora.boardingpass',
      serialNumber: checkIn.id,
      description: `${flight.airlineCode}${flight.flightNumber} boarding pass`,
      organizationName: 'Traqora',
      boardingPass: {
        transitType: 'PKTransitTypeAir',
        primaryFields: [
          { key: 'origin', label: 'FROM', value: flight.fromAirport },
          { key: 'destination', label: 'TO', value: flight.toAirport },
        ],
        secondaryFields: [
          { key: 'passenger', label: 'PASSENGER', value: `${passenger.firstName} ${passenger.lastName}` },
          { key: 'seat', label: 'SEAT', value: checkIn.seatNumber || 'N/A' },
        ],
        auxiliaryFields: [
          { key: 'flight', label: 'FLIGHT', value: `${flight.airlineCode}${flight.flightNumber}` },
          { key: 'gate', label: 'GATE', value: flight.gate || 'TBD' },
          { key: 'departure', label: 'DEPARTS', value: new Date(flight.departureTime).toISOString() },
        ],
        barcodes: [
          {
            format: 'PKBarcodeFormatQR',
            message: checkIn.boardingPassCode,
            messageEncoding: 'iso-8859-1',
          },
        ],
      },
      qrCodeDataUrl: qrCode,
    };
  }
}
