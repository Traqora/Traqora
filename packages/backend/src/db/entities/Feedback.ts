import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * What the feedback is about. `airline` overlaps conceptually with the older
 * `Review` entity, which stays the canonical store for booking-verified
 * airline reviews; this entity covers the wider surface (individual flights
 * and the end-to-end booking experience) plus moderation and voting.
 */
export type FeedbackTargetType = 'flight' | 'airline' | 'booking_experience';

export type FeedbackStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

/** Per-aspect scores, each 1-5. Absent keys mean "not rated". */
export interface CategoryRatings {
  comfort?: number;
  service?: number;
  punctuality?: number;
  value?: number;
  cleanliness?: number;
  bookingEase?: number;
}

@Entity({ name: 'feedback' })
@Index(['targetType', 'targetId', 'status'])
@Index(['status', 'createdAt'])
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  targetType!: FeedbackTargetType;

  /** Flight id, airline code, or booking id depending on `targetType`. */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  targetId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bookingId?: string | null;

  /** Overall score, 1-5. */
  @Column({ type: 'integer' })
  rating!: number;

  @Column({ type: 'json', nullable: true })
  categoryRatings?: CategoryRatings | null;

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: FeedbackStatus;

  /** True when the author has a confirmed booking for the target. */
  @Column({ type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ type: 'integer', default: 0 })
  helpfulCount!: number;

  @Column({ type: 'integer', default: 0 })
  unhelpfulCount!: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  moderatedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  moderationNote?: string | null;

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz',
    nullable: true,
  })
  moderatedAt?: Date | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
