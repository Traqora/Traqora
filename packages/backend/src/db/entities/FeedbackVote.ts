import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Feedback } from './Feedback';

export type VoteValue = 'helpful' | 'unhelpful';

/**
 * One user's verdict on one piece of feedback. The unique constraint keeps
 * voting idempotent — re-voting flips the existing row instead of inflating
 * the tally.
 */
@Entity({ name: 'feedback_votes' })
@Unique('UQ_feedback_vote_per_user', ['feedbackId', 'userId'])
export class FeedbackVote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  feedbackId!: string;

  @ManyToOne(() => Feedback, { onDelete: 'CASCADE' })
  feedback?: Feedback;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  value!: VoteValue;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
