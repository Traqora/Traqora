import { Request } from 'express';
import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors';

export async function getBookingForRequester(
  bookingId: string,
  req: Request,
  relations: string[] = ['passenger'],
): Promise<Booking> {
  const walletAddress = req.user?.walletAddress;
  if (!walletAddress) {
    throw new UnauthorizedError('Unauthorized');
  }

  const repo = AppDataSource.getRepository(Booking);
  const booking = await repo.findOne({ where: { id: bookingId }, relations });
  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  const owner = booking.passenger?.sorobanAddress;
  if (!owner || owner !== walletAddress) {
    // Avoid leaking existence/ownership details across accounts.
    throw new NotFoundError('Booking not found');
  }

  return booking;
}

export async function assertPassengerBelongsToBooking(
  bookingId: string,
  passengerId: string,
  req: Request,
): Promise<{ booking: Booking; passengerId: string }> {
  const booking = await getBookingForRequester(bookingId, req, ['passenger']);
  if (!booking.passenger || booking.passenger.id !== passengerId) {
    throw new NotFoundError('Passenger not found');
  }
  return { booking, passengerId };
}
