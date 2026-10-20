import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("user_preferences")
export class UserPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string; // Storing as string since we don't have a formal User entity yet

  @Column({ default: true })
  emailEnabled: boolean;

  @Column({ default: false })
  smsEnabled: boolean;

  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ default: false })
  webhookEnabled: boolean;

  @Column({ nullable: true })
  webhookUrl: string;

  // Push notification opt-in preferences by type
  @Column({ default: true })
  pushBookingEnabled: boolean;

  @Column({ default: true })
  pushReminderEnabled: boolean;

  @Column({ default: true })
  pushRefundEnabled: boolean;

  @Column({ default: true })
  pushPromoEnabled: boolean;

  @Column({ default: false })
  pushOptedIn: boolean; // Explicit opt-in flag for compliance

  @Column({ type: "timestamp", nullable: true })
  pushOptInAt: Date;

  @Column({ type: "jsonb", nullable: true })
  pushDeviceTokens: Array<{ token: string; platform: string; lastUsed: Date }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
