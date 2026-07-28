import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RecommendationVariant = 'personalized' | 'control';
export type RecommendationAction = 'view' | 'click' | 'dismiss';

@Entity({ name: 'recommendation_events' })
@Index('idx_recommendation_events_userId', ['userId'])
@Index('idx_recommendation_events_destinationCode', ['destinationCode'])
export class RecommendationEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 8 })
  destinationCode!: string;

  @Column({ type: 'varchar', length: 32 })
  variant!: RecommendationVariant;

  @Column({ type: 'varchar', length: 16 })
  action!: RecommendationAction;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reason?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;
}
