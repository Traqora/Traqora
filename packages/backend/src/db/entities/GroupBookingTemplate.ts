import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

export type TemplateVisibility = 'private' | 'organization' | 'public';

@Entity({ name: 'group_booking_templates' })
export class GroupBookingTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'private' })
  visibility!: TemplateVisibility;

  @Column({ type: 'json' })
  templateConfig!: {
    flights: Array<{
      origin: string;
      destination: string;
      cabinClass: string;
      preferredAirline?: string;
    }>;
    splitMethod: 'equal' | 'custom' | 'percentage';
    defaultNotes?: string;
  };

  @Column({ type: 'integer', default: 0 })
  usageCount!: number;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  organizationId?: string | null;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  createdById?: string | null;

  @Column({ type: 'json', nullable: true })
  tags?: string[] | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
