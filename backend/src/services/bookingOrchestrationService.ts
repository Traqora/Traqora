import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import { Flight } from '../db/entities/Flight';
import { Passenger } from '../db/entities/Passenger';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { 
    getTransactionStatus,
    signAndSubmitCreateBooking
} from './soroban';
import { config } from '../config';
import { logger } from '../utils/logger';
import { withRetries } from './retry';

export class BookingOrchestrationService {
    private bookingRepo = AppDataSource.getRepository(Booking);
    private flightRepo = AppDataSource.getRepository(Flight);
    private passengerRepo = AppDataSource.getRepository(Passenger);
    private idempotencyRepo = AppDataSource.getRepository(IdempotencyKey);

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
    }): Promise<Booking> {
        // 1. Find flight
        const flight = await this.flightRepo.findOne({ where: { id: params.flightId } });
        if (!flight) throw new Error('Flight not found');
        if (flight.seatsAvailable <= 0) throw new Error('Flight sold out');

        // 2. Reserve seat (optimistic update)
        const updated = await this.flightRepo
            .createQueryBuilder()
            .update(Flight)
            .set({ seatsAvailable: () => "seatsAvailable - 1" })
            .where("id = :id", { id: flight.id })
            .andWhere("seatsAvailable > 0")
            .execute();

        if (!updated.affected) throw new Error('Flight sold out');

        // 3. Create passenger
        const passenger = this.passengerRepo.create(params.passenger);
        await this.passengerRepo.save(passenger);

        // 4. Build, Sign, and Submit Soroban transaction
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

            // 5. Create booking record in DB
            const booking = this.bookingRepo.create({
                idempotencyKey: params.idempotencyKey,
                flight,
                passenger,
                status: 'onchain_submitted',
                amountCents: flight.priceCents,
                sorobanTxHash: result.txHash,
            });

            const savedBooking = await this.bookingRepo.save(booking);

            // 6. Wait for transaction finality (poll status)
            this.pollTransactionStatus(savedBooking.id, result.txHash).catch(err => {
                logger.error('Error polling transaction status', { bookingId: savedBooking.id, error: err.message });
            });

            return savedBooking;
        } catch (error: any) {
            logger.error('Booking orchestration failed during submission', { error: error.message });
            
            // Revert seat reservation
            await this.flightRepo.increment({ id: flight.id }, 'seatsAvailable', 1);
            
            throw error;
        }
    }

    private async pollTransactionStatus(bookingId: string, txHash: string) {
        try {
            await withRetries(async () => {
                const status = await getTransactionStatus(txHash);
                
                const booking = await this.bookingRepo.findOne({ where: { id: bookingId }, relations: ['flight'] });
                if (!booking) return;

                if (status.status === 'success') {
                    booking.status = 'confirmed';
                    // Extract booking_id from result if available
                    if (status.result) {
                        // In Soroban, return values are ScVal. getTransactionStatus should return the parsed value.
                        // Assuming status.result is already parsed or is the ScVal.
                        booking.sorobanBookingId = status.result.toString();
                    }
                    await this.bookingRepo.save(booking);
                    logger.info('Booking confirmed on-chain', { bookingId, txHash });
                } else if (status.status === 'failed') {
                    booking.status = 'failed';
                    booking.lastError = status.error || 'Transaction failed';
                    await this.bookingRepo.save(booking);
                    
                    // Revert seat reservation
                    await this.flightRepo.increment({ id: booking.flight.id }, 'seatsAvailable', 1);
                    logger.error('Booking failed on-chain', { bookingId, txHash, error: status.error });
                } else if (status.status === 'pending') {
                    throw new Error('Transaction still pending'); // Retry
                } else if (status.status === 'not_found') {
                    // Could be a re-org or just slow indexing
                    throw new Error('Transaction not found yet'); // Retry
                }
            }, { 
                maxAttempts: 20, 
                delayMs: 5000, 
                backoff: true 
            });
        } catch (error: any) {
            logger.error('Max retries reached for booking status polling', { bookingId, txHash, error: error.message });
            const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
            if (booking && booking.status === 'onchain_submitted') {
                booking.status = 'failed';
                booking.lastError = 'Transaction status polling timed out';
                await this.bookingRepo.save(booking);
            }
        }
    }
}
