import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type ConsentType =
  | "marketing"
  | "analytics"
  | "data_processing"
  | "third_party_sharing"
  | "profiling";
export type ConsentStatus = "granted" | "withdrawn" | "expired" | "pending";

@Entity({ name: "consent_records" })
export class ConsentRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 128 })
  userWalletAddress!: string;

  @Column({
    type: "enum",
    enum: [
      "marketing",
      "analytics",
      "data_processing",
      "third_party_sharing",
      "profiling",
    ],
  })
  consentType!: ConsentType;

  @Column({
    type: "enum",
    enum: ["granted", "withdrawn", "expired", "pending"],
  })
  status!: ConsentStatus;

  @Column({ type: "text" })
  consentDetails!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  ipAddress?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  userAgent?: string | null;

  @Column({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
    nullable: true,
  })
  expiresAt?: Date | null;

  @Column({ type: "text", nullable: true })
  withdrawalReason?: string | null;

  @Column({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
    nullable: true,
  })
  withdrawnAt?: Date | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  withdrawnBy?: string | null;

  @Column({ type: "boolean", default: false })
  isVerified!: boolean;

  @Column({ type: "varchar", length: 256, nullable: true })
  verificationCode?: string | null;

  @CreateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  updatedAt!: Date;
}
