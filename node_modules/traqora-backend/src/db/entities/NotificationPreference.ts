import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from "typeorm";

export type NotificationChannel = "email" | "sms" | "push" | "inapp";
export type NotificationCategory =
  | "booking"
  | "payment"
  | "itinerary"
  | "collaboration"
  | "marketing"
  | "system";
export type NotificationFrequency = "instant" | "daily" | "weekly" | "never";

@Entity("notification_preferences")
@Unique(["userId", "channel", "category"])
export class NotificationPreference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  @Index()
  userId: string;

  @Column({
    type: "enum",
    enum: ["email", "sms", "push", "inapp"],
  })
  @Index()
  channel: NotificationChannel;

  @Column({
    type: "enum",
    enum: ["booking", "payment", "itinerary", "collaboration", "marketing", "system"],
  })
  @Index()
  category: NotificationCategory;

  @Column({
    type: "enum",
    enum: ["instant", "daily", "weekly", "never"],
    default: "instant",
  })
  frequency: NotificationFrequency;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
