import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GroupBooking } from './GroupBooking';

export type GroupMemberStatus =
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'failed'
  | 'cancelled';

export type GroupMemberRole = 'organizer' | 'member';

@Entity({ name: 'group_members' })
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => GroupBooking, (groupBooking) => groupBooking.members)
  groupBooking!: GroupBooking;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  groupBookingId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string | null;

  @Column({ type: 'varchar', length: 56, nullable: true })
  stellarAddress?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: GroupMemberStatus;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role!: GroupMemberRole;

  @Column({ type: 'integer', nullable: true })
  shareAmountCents?: number | null;

  @Column({ type: 'boolean', default: false })
  isInvited!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  invitedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  inviteToken?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}