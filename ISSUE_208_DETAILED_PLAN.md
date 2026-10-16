# Issue #208: Implement Multi-City Flight Booking - Detailed Plan

## Objective
Enable users to book multiple flight segments in a single transaction with combined pricing, smart contract support, and unified refund logic.

## Priority: High | Type: Feature | Estimated Duration: 4-5 weeks

---

## Phase 1: Database Schema Updates

### 1.1 Create MultiCityBooking Entity
**File:** `packages/backend/src/db/entities/MultiCityBooking.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { User } from './User'
import { BookingSegment } from './BookingSegment'
import { Refund } from './Refund'

export type MultiCityBookingStatus =
  | 'created'
  | 'awaiting_payment'
  | 'payment_processing'
  | 'paid'
  | 'onchain_pending'
  | 'onchain_submitted'
  | 'confirmed'
  | 'partial_refunded'
  | 'fully_refunded'
  | 'failed'
  | 'cancelled'

@Entity({ name: 'multi_city_bookings' })
@Index(['userId', 'status'])
@Index(['createdAt', 'status'])
export class MultiCityBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  userId!: string

  @ManyToOne(() => User)
  user?: User

  // Pricing
  @Column({ type: 'integer' })
  totalPriceCents!: number // Sum of all segments

  @Column({ type: 'integer' })
  segmentCount!: number // Number of flight segments

  @Column({ type: 'simple-json', nullable: true })
  priceBreakdown?: {
    segments: Array<{
      bookingId: string
      priceCents: number
    }>
    taxes?: number
    fees?: number
  }

  // Status tracking
  @Column({ type: 'varchar', length: 32, default: 'created' })
  status!: MultiCityBookingStatus

  // Blockchain references
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey?: string | null

  @Column({ type: 'text', nullable: true })
  sorobanUnsignedXdr?: string | null

  @Column({ type: 'varchar', length: 128, nullable: true })
  sorobanTxHash?: string | null

  @Column({ type: 'integer', default: 0 })
  contractSubmitAttempts!: number

  @Column({ type: 'text', nullable: true })
  lastError?: string | null

  // Relationships
  @OneToMany(() => BookingSegment, segment => segment.multiCityBooking, {
    cascade: ['insert', 'update']
  })
  segments!: BookingSegment[]

  @Column({ type: 'uuid', nullable: true })
  linkedRefundId?: string | null

  @Column({ type: 'simple-json', nullable: true })
  refundPolicy?: {
    allowPartialRefund: boolean
    cancelWithinHours: number
    refundPercentage: number
  }

  // Payment info
  @Column({ type: 'varchar', length: 128, nullable: true })
  stripePaymentIntentId?: string | null

  @Column({ type: 'varchar', length: 256, nullable: true })
  stripeClientSecret?: string | null

  // Audit
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date

  @Column({ type: 'varchar', length: 256, nullable: true })
  cancellationReason?: string
}
```

### 1.2 Create BookingSegment Entity
**File:** `packages/backend/src/db/entities/BookingSegment.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'
import { MultiCityBooking } from './MultiCityBooking'
import { Booking } from './Booking'

@Entity({ name: 'booking_segments' })
@Index(['multiCityBookingId', 'sequenceNumber'])
export class BookingSegment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  multiCityBookingId!: string

  @ManyToOne(() => MultiCityBooking, booking => booking.segments, {
    onDelete: 'CASCADE'
  })
  multiCityBooking!: MultiCityBooking

  @Column({ type: 'uuid' })
  bookingId!: string

  @ManyToOne(() => Booking, { eager: true })
  booking!: Booking

  @Column({ type: 'integer' })
  sequenceNumber!: number // Order of segments (1, 2, 3, etc.)

  @Column({ type: 'integer' })
  connectionTime?: number // Minutes between previous segment and this one

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}
```

### 1.3 Create Migration
**File:** `packages/backend/src/db/migrations/1750003000000-CreateMultiCityBooking.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm'

export class CreateMultiCityBooking1750003000000 implements MigrationInterface {
  name = 'CreateMultiCityBooking1750003000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // Multi-city bookings table
    await queryRunner.createTable(
      new Table({
        name: 'multi_city_bookings',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid' },
          { name: 'totalPriceCents', type: 'integer' },
          { name: 'segmentCount', type: 'integer' },
          { name: 'priceBreakdown', type: 'simple-json', isNullable: true },
          { name: 'status', type: 'varchar', length: 32, default: "'created'" },
          { name: 'idempotencyKey', type: 'varchar', length: 128, isNullable: true },
          { name: 'sorobanUnsignedXdr', type: 'text', isNullable: true },
          { name: 'sorobanTxHash', type: 'varchar', length: 128, isNullable: true },
          { name: 'contractSubmitAttempts', type: 'integer', default: 0 },
          { name: 'lastError', type: 'text', isNullable: true },
          { name: 'linkedRefundId', type: 'uuid', isNullable: true },
          { name: 'refundPolicy', type: 'simple-json', isNullable: true },
          { name: 'stripePaymentIntentId', type: 'varchar', length: 128, isNullable: true },
          { name: 'stripeClientSecret', type: 'varchar', length: 256, isNullable: true },
          { name: 'cancellationReason', type: 'varchar', length: 256, isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'confirmedAt', type: 'timestamptz', isNullable: true }
        ]
      })
    )

    await queryRunner.createIndex('multi_city_bookings', new TableIndex({ columnNames: ['userId', 'status'] }))
    await queryRunner.createIndex('multi_city_bookings', new TableIndex({ columnNames: ['createdAt', 'status'] }))

    // Booking segments table
    await queryRunner.createTable(
      new Table({
        name: 'booking_segments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'multiCityBookingId', type: 'uuid' },
          { name: 'bookingId', type: 'uuid' },
          { name: 'sequenceNumber', type: 'integer' },
          { name: 'connectionTime', type: 'integer', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' }
        ]
      })
    )

    await queryRunner.createIndex('booking_segments', new TableIndex({ columnNames: ['multiCityBookingId', 'sequenceNumber'] }))

    // Add foreign keys
    await queryRunner.createForeignKey(
      'multi_city_bookings',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'booking_segments',
      new TableForeignKey({
        columnNames: ['multiCityBookingId'],
        referencedTableName: 'multi_city_bookings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'booking_segments',
      new TableForeignKey({
        columnNames: ['bookingId'],
        referencedTableName: 'bookings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('booking_segments')
    const foreignKeys = table?.foreignKeys || []
    
    for (const fk of foreignKeys) {
      await queryRunner.dropForeignKey('booking_segments', fk)
    }

    const mcbTable = await queryRunner.getTable('multi_city_bookings')
    const mcbForeignKeys = mcbTable?.foreignKeys || []
    
    for (const fk of mcbForeignKeys) {
      await queryRunner.dropForeignKey('multi_city_bookings', fk)
    }

    await queryRunner.dropTable('booking_segments')
    await queryRunner.dropTable('multi_city_bookings')
  }
}
```

---

## Phase 2: Repository & Service Layer

### 2.1 Create Repository
**File:** `packages/backend/src/repositories/multiCityBookingRepository.ts`

```typescript
import { Repository } from 'typeorm'
import { MultiCityBooking } from '../db/entities/MultiCityBooking'
import { AppDataSource } from '../db/dataSource'

export class MultiCityBookingRepository extends Repository<MultiCityBooking> {
  async createMultiCityBooking(data: Partial<MultiCityBooking>): Promise<MultiCityBooking> {
    const booking = this.create(data)
    return this.save(booking)
  }

  async getBookingWithSegments(id: string): Promise<MultiCityBooking | null> {
    return this.createQueryBuilder('booking')
      .leftJoinAndSelect('booking.segments', 'segment')
      .leftJoinAndSelect('segment.booking', 'individualBooking')
      .where('booking.id = :id', { id })
      .getOne()
  }

  async getUserBookings(userId: string, status?: string): Promise<MultiCityBooking[]> {
    let query = this.createQueryBuilder('booking')
      .leftJoinAndSelect('booking.segments', 'segment')
      .where('booking.userId = :userId', { userId })
      .orderBy('booking.createdAt', 'DESC')

    if (status) {
      query = query.andWhere('booking.status = :status', { status })
    }

    return query.getMany()
  }

  async getPendingBookings(): Promise<MultiCityBooking[]> {
    return this.createQueryBuilder('booking')
      .leftJoinAndSelect('booking.segments', 'segment')
      .where('booking.status IN (:...statuses)', {
        statuses: ['awaiting_payment', 'payment_processing', 'onchain_pending']
      })
      .andWhere('booking.updatedAt < NOW() - INTERVAL 1 HOUR')
      .getMany()
  }
}

export const getMultiCityBookingRepository = (): MultiCityBookingRepository => {
  return AppDataSource.getRepository(MultiCityBooking) as MultiCityBookingRepository
}
```

### 2.2 Create Multi-City Booking Service
**File:** `packages/backend/src/services/multi-city-booking.ts`

```typescript
import { AppDataSource } from '../db/dataSource'
import { MultiCityBooking } from '../db/entities/MultiCityBooking'
import { BookingSegment } from '../db/entities/BookingSegment'
import { Flight } from '../db/entities/Flight'
import { Booking } from '../db/entities/Booking'
import { getMultiCityBookingRepository } from '../repositories/multiCityBookingRepository'
import { multiCityValidator } from '../validators/multiCityValidator'
import { logger } from '../utils/logger'
import { hashObject } from './idempotency'

export interface SegmentInput {
  flightId: string
  passenger: {
    email: string
    firstName: string
    lastName: string
    phone?: string
    sorobanAddress: string
  }
}

export class MultiCityBookingService {
  private multiCityRepo = getMultiCityBookingRepository()
  private bookingRepo = AppDataSource.getRepository(Booking)
  private flightRepo = AppDataSource.getRepository(Flight)
  private segmentRepo = AppDataSource.getRepository(BookingSegment)

  /**
   * Create multi-city booking from flight segments
   */
  async createMultiCityBooking(
    userId: string,
    segments: SegmentInput[]
  ): Promise<MultiCityBooking> {
    const queryRunner = AppDataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // Get all flights
      const flights = await this.flightRepo.find({
        where: segments.map(s => ({ id: s.flightId }))
      })

      // Validate segments
      await multiCityValidator.validateSegments(flights, segments)

      // Calculate total price
      const totalPrice = flights.reduce((sum, flight) => sum + flight.priceCents, 0)

      // Generate idempotency key
      const idempotencyKey = hashObject({
        userId,
        segments: segments.map(s => s.flightId).sort()
      })

      // Check if booking already exists
      const existingBooking = await queryRunner.manager.findOne(MultiCityBooking, {
        where: { idempotencyKey }
      })

      if (existingBooking) {
        await queryRunner.rollbackTransaction()
        return existingBooking
      }

      // Create individual bookings
      const individualBookings: Booking[] = []
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        const flight = flights[i]

        const booking = await queryRunner.manager.save(Booking, {
          flight,
          passenger: {
            email: segment.passenger.email,
            firstName: segment.passenger.firstName,
            lastName: segment.passenger.lastName,
            phone: segment.passenger.phone,
            sorobanAddress: segment.passenger.sorobanAddress
          },
          status: 'created',
          amountCents: flight.priceCents
        })

        individualBookings.push(booking)
      }

      // Create multi-city booking
      const multiCityBooking = await queryRunner.manager.save(MultiCityBooking, {
        userId,
        totalPriceCents: totalPrice,
        segmentCount: segments.length,
        status: 'created',
        idempotencyKey,
        priceBreakdown: {
          segments: individualBookings.map((b, i) => ({
            bookingId: b.id,
            priceCents: flights[i].priceCents
          }))
        }
      })

      // Create booking segments
      for (let i = 0; i < individualBookings.length; i++) {
        const booking = individualBookings[i]
        const flight = flights[i]
        const previousFlight = i > 0 ? flights[i - 1] : null

        let connectionTime: number | undefined
        if (previousFlight && flight.departureTime > previousFlight.arrivalTime!) {
          const diff = flight.departureTime.getTime() - previousFlight.arrivalTime!.getTime()
          connectionTime = Math.floor(diff / (1000 * 60)) // minutes
        }

        await queryRunner.manager.save(BookingSegment, {
          multiCityBookingId: multiCityBooking.id,
          bookingId: booking.id,
          sequenceNumber: i + 1,
          connectionTime
        })
      }

      await queryRunner.commitTransaction()

      logger.info(`Multi-city booking created: ${multiCityBooking.id}`)

      return multiCityBooking
    } catch (error) {
      await queryRunner.rollbackTransaction()
      logger.error('Error creating multi-city booking:', error)
      throw error
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Calculate total price across all segments
   */
  async calculateTotalPrice(flightIds: string[]): Promise<number> {
    const flights = await this.flightRepo.find({
      where: flightIds.map(id => ({ id }))
    })

    return flights.reduce((sum, flight) => sum + flight.priceCents, 0)
  }

  /**
   * Get multi-city booking with all details
   */
  async getMultiCityBooking(bookingId: string): Promise<MultiCityBooking | null> {
    return this.multiCityRepo.getBookingWithSegments(bookingId)
  }

  /**
   * Get user's multi-city bookings
   */
  async getUserMultiCityBookings(userId: string, status?: string): Promise<MultiCityBooking[]> {
    return this.multiCityRepo.getUserBookings(userId, status)
  }

  /**
   * Update booking status
   */
  async updateStatus(bookingId: string, status: MultiCityBooking['status']): Promise<void> {
    await this.multiCityRepo.update(
      { id: bookingId },
      {
        status,
        updatedAt: new Date()
      }
    )

    if (status === 'confirmed') {
      await this.multiCityRepo.update({ id: bookingId }, { confirmedAt: new Date() })
    }
  }

  /**
   * Cancel multi-city booking
   */
  async cancelMultiCityBooking(
    bookingId: string,
    reason: string
  ): Promise<void> {
    const booking = await this.multiCityRepo.findOne({ where: { id: bookingId } })

    if (!booking) {
      throw new Error('Booking not found')
    }

    if (['confirmed', 'partial_refunded', 'fully_refunded', 'cancelled'].includes(booking.status)) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`)
    }

    await this.multiCityRepo.update(
      { id: bookingId },
      {
        status: 'cancelled',
        cancellationReason: reason,
        updatedAt: new Date()
      }
    )

    logger.info(`Multi-city booking cancelled: ${bookingId}`)
  }

  /**
   * Submit multi-city booking to blockchain
   */
  async submitToBlockchain(
    bookingId: string,
    unsignedXdr: string
  ): Promise<{ txHash: string }> {
    const booking = await this.multiCityRepo.findOne({ where: { id: bookingId } })

    if (!booking) {
      throw new Error('Booking not found')
    }

    // Update status
    await this.updateStatus(bookingId, 'onchain_pending')

    // Call soroban service (implemented in Phase 3)
    // This is placeholder
    const txHash = `tx_${Date.now()}`

    await this.multiCityRepo.update(
      { id: bookingId },
      {
        sorobanUnsignedXdr: unsignedXdr,
        sorobanTxHash: txHash,
        contractSubmitAttempts: 1
      }
    )

    return { txHash }
  }
}

export const multiCityBookingService = new MultiCityBookingService()
```

---

## Phase 3: Smart Contract Support

### 3.1 Create Smart Contract Service
**File:** `packages/backend/src/services/multiCitySmartContract.ts`

```typescript
import { Keypair, TransactionBuilder, Networks, Operation, Contract } from '@stellar/stellar-sdk'
import { submitSignedSorobanXdr } from './soroban'
import { logger } from '../utils/logger'

export class MultiCitySmartContractService {
  /**
   * Generate contract call for multi-city booking
   */
  async generateMultiCityContractCall(
    segments: Array<{
      bookingId: string
      amount: number
      flightId: string
    }>,
    userAddress: string
  ): Promise<string> {
    try {
      // Get contract details from env
      const contractId = process.env.SOROBAN_BOOKING_CONTRACT_ID
      if (!contractId) {
        throw new Error('Contract ID not configured')
      }

      // Build multi-city booking contract invocation
      const spec = Contract.getSpec(contractId)

      // Generate XDR for linked bookings
      const account = new Keypair()

      // Build transaction with multiple booking operations
      let builder = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: Networks.PUBLIC_NETWORK_PASSPHRASE
      })

      // Add operation for each segment
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]

        // Build booking operation (simplified)
        builder = builder.addOperation(
          Operation.invokeHostFunction({
            hostFunction: {
              // Contract invocation
            }
          })
        )
      }

      builder = builder.setTimeout(30)
      const transaction = builder.build()

      return transaction.toXDR()
    } catch (error) {
      logger.error('Error generating multi-city contract call:', error)
      throw error
    }
  }

  /**
   * Validate linked bookings on blockchain
   */
  async validateLinkedBookings(
    txHash: string,
    expectedSegmentCount: number
  ): Promise<boolean> {
    try {
      // Verify transaction structure includes all segments
      // This is placeholder - actual implementation would check blockchain

      return true
    } catch (error) {
      logger.error('Error validating linked bookings:', error)
      return false
    }
  }

  /**
   * Handle atomic refund for multi-city booking
   */
  async processMultiCityRefund(
    bookingId: string,
    segments: string[]
  ): Promise<{ refundAmount: number; txHash: string }> {
    try {
      // Build refund contract call that atomically refunds all segments
      // If any segment fails, entire refund transaction fails

      // Placeholder return
      return {
        refundAmount: 0,
        txHash: 'tx_refund'
      }
    } catch (error) {
      logger.error('Error processing multi-city refund:', error)
      throw error
    }
  }
}

export const multiCitySmartContractService = new MultiCitySmartContractService()
```

---

## Phase 4: API Endpoints

### 4.1 Create Multi-City Schemas
**File:** `packages/backend/src/api/schemas/multi-city.ts`

```typescript
import { z } from 'zod'

export const multiCitySegmentSchema = z.object({
  flightId: z.string().uuid('Invalid flight ID'),
  passenger: z.object({
    email: z.string().email('Invalid email'),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    sorobanAddress: z.string().regex(/^G[A-Z0-9]{55}$/)
  })
})

export const createMultiCityBookingSchema = z.object({
  segments: z
    .array(multiCitySegmentSchema)
    .min(2, 'Multi-city booking requires at least 2 segments')
    .max(10, 'Multi-city booking cannot exceed 10 segments')
})

export const submitMultiCityBookingSchema = z.object({
  unsignedXdr: z.string().min(1),
  idempotencyKey: z.string().uuid().optional()
})

export const cancelMultiCityBookingSchema = z.object({
  reason: z.string().min(1).max(500)
})
```

### 4.2 Create API Routes
**File:** `packages/backend/src/api/routes/bookings.ts` (extend)

```typescript
import { Router, Request, Response } from 'express'
import { validateRequest } from '../../middleware/validation'
import {
  createMultiCityBookingSchema,
  submitMultiCityBookingSchema,
  cancelMultiCityBookingSchema
} from '../../api/schemas/multi-city'
import { multiCityBookingService } from '../../services/multi-city-booking'
import { requireAuth } from '../../middleware/authMiddleware'
import { asyncHandler } from '../../utils/errorHandler'

const router = Router()

// POST /api/v1/bookings/multi-city
router.post(
  '/multi-city',
  requireAuth,
  validateRequest(createMultiCityBookingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { segments } = req.body

    const multiCityBooking = await multiCityBookingService.createMultiCityBooking(
      req.user.id,
      segments
    )

    res.status(201).json({
      success: true,
      data: multiCityBooking
    })
  })
)

// GET /api/v1/bookings/multi-city/:bookingId
router.get(
  '/multi-city/:bookingId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.params

    const booking = await multiCityBookingService.getMultiCityBooking(bookingId)

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { message: 'Booking not found' }
      })
    }

    // Verify ownership
    if (booking.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Unauthorized' }
      })
    }

    res.json({
      success: true,
      data: booking
    })
  })
)

// GET /api/v1/bookings/multi-city
router.get(
  '/multi-city',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined

    const bookings = await multiCityBookingService.getUserMultiCityBookings(
      req.user.id,
      status
    )

    res.json({
      success: true,
      data: bookings
    })
  })
)

// POST /api/v1/bookings/multi-city/:bookingId/submit
router.post(
  '/multi-city/:bookingId/submit',
  requireAuth,
  validateRequest(submitMultiCityBookingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.params
    const { unsignedXdr } = req.body

    // Verify ownership
    const booking = await multiCityBookingService.getMultiCityBooking(bookingId)
    if (!booking || booking.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Unauthorized' }
      })
    }

    const result = await multiCityBookingService.submitToBlockchain(bookingId, unsignedXdr)

    res.json({
      success: true,
      data: result
    })
  })
)

// DELETE /api/v1/bookings/multi-city/:bookingId
router.delete(
  '/multi-city/:bookingId',
  requireAuth,
  validateRequest(cancelMultiCityBookingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.params
    const { reason } = req.body

    // Verify ownership
    const booking = await multiCityBookingService.getMultiCityBooking(bookingId)
    if (!booking || booking.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Unauthorized' }
      })
    }

    await multiCityBookingService.cancelMultiCityBooking(bookingId, reason)

    res.json({
      success: true,
      message: 'Booking cancelled'
    })
  })
)

export default router
```

---

## Phase 5: Frontend Pages & Components

### 5.1 Multi-City Booking Page
**File:** `packages/client/app/book/multi-city/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { SegmentForm } from '@/components/multi-city-booking/SegmentForm'
import { SegmentList } from '@/components/multi-city-booking/SegmentList'
import { PriceSummary } from '@/components/multi-city-booking/PriceSummary'
import { BookingReview } from '@/components/multi-city-booking/BookingReview'
import { useMultiCityBooking } from '@/hooks/use-multi-city-booking'

export default function MultiCityBookingPage() {
  const [step, setStep] = useState<'segments' | 'review' | 'payment' | 'confirmation'>('segments')
  const {
    segments,
    totalPrice,
    isLoading,
    errors,
    addSegment,
    removeSegment,
    submitBooking
  } = useMultiCityBooking()

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Multi-City Flight Booking</h1>

      {step === 'segments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <SegmentForm onAdd={addSegment} />
            <SegmentList segments={segments} onRemove={removeSegment} />
          </div>
          <div>
            <PriceSummary segments={segments} totalPrice={totalPrice} />
            <button
              onClick={() => setStep('review')}
              disabled={segments.length < 2 || isLoading}
              className="w-full mt-4 bg-blue-600 text-white py-2 rounded"
            >
              Continue to Review
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <BookingReview
          segments={segments}
          totalPrice={totalPrice}
          onConfirm={() => setStep('payment')}
          onBack={() => setStep('segments')}
        />
      )}

      {errors && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mt-4">
          {errors}
        </div>
      )}
    </div>
  )
}
```

### 5.2 Segment Form Component
**File:** `packages/client/components/multi-city-booking/SegmentForm.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useFlightSearch } from '@/hooks/use-flight-search'

export function SegmentForm({
  onAdd
}: {
  onAdd: (segment: SegmentInput) => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState('')
  const { flights, searchFlights, isLoading } = useFlightSearch()

  const handleSearch = async () => {
    if (from && to && date) {
      await searchFlights({
        fromAirport: from,
        toAirport: to,
        departureDate: date
      })
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Add Flight Segment</h2>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <input
          type="text"
          placeholder="From (e.g., NYC)"
          value={from}
          onChange={e => setFrom(e.target.value.toUpperCase())}
          maxLength={3}
          className="border rounded px-3 py-2"
        />
        <input
          type="text"
          placeholder="To (e.g., LAX)"
          value={to}
          onChange={e => setTo(e.target.value.toUpperCase())}
          maxLength={3}
          className="border rounded px-3 py-2"
        />
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      <button
        onClick={handleSearch}
        disabled={!from || !to || !date || isLoading}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        {isLoading ? 'Searching...' : 'Search Flights'}
      </button>

      {flights.length > 0 && (
        <div className="mt-6 space-y-2">
          {flights.map(flight => (
            <div
              key={flight.id}
              className="border rounded p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
              onClick={() => onAdd({ flightId: flight.id, passenger: {} })}
            >
              <div>
                <p className="font-semibold">{flight.flightNumber}</p>
                <p className="text-sm text-gray-600">
                  {flight.departureTime} - {flight.arrivalTime}
                </p>
              </div>
              <p className="font-semibold">${(flight.price / 100).toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Phase 6: Client Hook

### 6.1 useMultiCityBooking Hook
**File:** `packages/client/hooks/use-multi-city-booking.ts`

```typescript
'use client'

import { useState, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'

export interface SegmentInput {
  flightId: string
  passenger: {
    email: string
    firstName: string
    lastName: string
    phone?: string
    sorobanAddress: string
  }
}

export interface FlightSegment {
  flightId: string
  flight?: any
  passenger: any
}

export function useMultiCityBooking() {
  const [segments, setSegments] = useState<FlightSegment[]>([])
  const [totalPrice, setTotalPrice] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<string | null>(null)
  const bookingIdRef = useRef<string | null>(null)

  const addSegment = useCallback(async (segment: SegmentInput) => {
    try {
      setErrors(null)

      // Validate segment
      if (!segment.flightId) {
        throw new Error('Flight ID is required')
      }

      // Fetch flight details
      const flightResponse = await apiClient.getFlight(segment.flightId)

      setSegments(prev => [
        ...prev,
        {
          flightId: segment.flightId,
          flight: flightResponse.data,
          passenger: segment.passenger
        }
      ])

      // Update total price
      await calculateTotalPrice([...segments, segment])
    } catch (error: any) {
      setErrors(error.message)
      toast.error('Failed to add segment', { description: error.message })
    }
  }, [segments])

  const removeSegment = useCallback((index: number) => {
    setSegments(prev => prev.filter((_, i) => i !== index))
  }, [])

  const calculateTotalPrice = useCallback(async (segs: FlightSegment[]) => {
    try {
      const response = await apiClient.calculateMultiCityPrice(
        segs.map(s => s.flightId)
      )
      setTotalPrice(response.data.totalPrice)
    } catch (error: any) {
      console.error('Error calculating price:', error)
    }
  }, [])

  const submitBooking = useCallback(async () => {
    try {
      setIsLoading(true)
      setErrors(null)

      const response = await apiClient.createMultiCityBooking({
        segments: segments.map(s => ({
          flightId: s.flightId,
          passenger: s.passenger
        }))
      })

      bookingIdRef.current = response.data.id
      toast.success('Multi-city booking created')

      return response.data
    } catch (error: any) {
      setErrors(error.message)
      toast.error('Failed to create booking', { description: error.message })
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [segments])

  return {
    segments,
    totalPrice,
    isLoading,
    errors,
    addSegment,
    removeSegment,
    submitBooking,
    bookingId: bookingIdRef.current
  }
}
```

---

## Phase 7: Validation & Business Logic

### 7.1 Create Multi-City Validator
**File:** `packages/backend/src/validators/multiCityValidator.ts`

```typescript
import { Flight } from '../db/entities/Flight'
import { logger } from '../utils/logger'

interface SegmentInput {
  flightId: string
  passenger: any
}

export class MultiCityValidator {
  /**
   * Validate all segments together
   */
  async validateSegments(
    flights: Flight[],
    segments: SegmentInput[]
  ): Promise<void> {
    // Check minimum 2 segments
    if (flights.length < 2) {
      throw new Error('Multi-city booking requires at least 2 segments')
    }

    // Check maximum 10 segments
    if (flights.length > 10) {
      throw new Error('Multi-city booking cannot exceed 10 segments')
    }

    // Sort by departure time
    const sorted = flights.sort((a, b) =>
      a.departureTime.getTime() - b.departureTime.getTime()
    )

    // Validate no overlapping flights
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]
      const next = sorted[i + 1]

      if (!current.arrivalTime) {
        throw new Error(`Flight ${current.id} missing arrival time`)
      }

      if (next.departureTime <= current.arrivalTime) {
        throw new Error('Flights overlap in time')
      }

      // Check minimum connection time (2 hours)
      const connectionMinutes =
        (next.departureTime.getTime() - current.arrivalTime.getTime()) / (1000 * 60)

      if (connectionMinutes < 120) {
        throw new Error(
          `Insufficient connection time between segments. Minimum 2 hours required.`
        )
      }
    }

    // Check booking span (max 30 days)
    const firstDeparture = sorted[0].departureTime
    const lastArrival = sorted[sorted.length - 1].arrivalTime

    if (lastArrival) {
      const spanDays = (lastArrival.getTime() - firstDeparture.getTime()) / (1000 * 60 * 60 * 24)

      if (spanDays > 30) {
        throw new Error('Booking span cannot exceed 30 days')
      }
    }

    logger.info('Multi-city segments validated successfully')
  }

  /**
   * Validate segments have same passenger
   */
  validateSamePassenger(segments: SegmentInput[]): void {
    const firstEmail = segments[0].passenger.email

    for (const segment of segments) {
      if (segment.passenger.email !== firstEmail) {
        throw new Error('All segments must have the same passenger')
      }
    }
  }

  /**
   * Validate prices correct
   */
  validatePrices(flights: Flight[], expectedTotal: number): void {
    const calculatedTotal = flights.reduce((sum, flight) => sum + flight.priceCents, 0)

    if (calculatedTotal !== expectedTotal) {
      throw new Error('Price calculation mismatch')
    }
  }
}

export const multiCityValidator = new MultiCityValidator()
```

---

## Phase 8: Combined Refund Logic

### 8.1 Extend Refund Service
**File:** `packages/backend/src/services/refundService.ts` (add multi-city support)

```typescript
// Add to existing refund service

/**
 * Process refund for multi-city booking
 */
async processMultiCityRefund(
  multiCityBookingId: string,
  segmentIds?: string[]
): Promise<{ refundAmount: number; refundId: string }> {
  // If segmentIds specified, refund specific segments
  // Otherwise refund entire booking

  // Calculate refund amounts
  // Create linked refund record
  // Call smart contract for atomic refund
  // Update booking status
}

/**
 * Handle partial refund (refund specific segments)
 */
async processPartialMultiCityRefund(
  multiCityBookingId: string,
  segments: string[]
): Promise<void> {
  // Calculate remaining amount if some segments refunded
  // Ensure compliance with refund policies
}
```

---

## Testing Strategy

### Test Cases

1. **Create Multi-City Booking**
   - Valid segments
   - Overlapping flights (should fail)
   - Insufficient connection time (should fail)
   - Different passengers (should fail)

2. **Price Calculation**
   - Correct sum of segment prices
   - Tax/fee handling

3. **Refund Logic**
   - Full refund
   - Partial refund
   - Refund policies enforcement

4. **Blockchain Integration**
   - Contract call generation
   - XDR submission
   - Transaction validation

---

## Success Metrics

- ✅ Multi-city bookings created successfully
- ✅ Validation prevents invalid segment combinations
- ✅ Prices calculated correctly
- ✅ Smart contract integration works
- ✅ Refunds process atomically
- ✅ UI is intuitive for adding/removing segments
- ✅ All tests passing

---

## Related Issues
- Depends on #223 (Database optimization)
- Requires #221 (Input validation)
