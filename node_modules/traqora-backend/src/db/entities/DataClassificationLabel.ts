import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type ClassificationLevel =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "pii"
  | "financial";
export type DataType =
  | "user_data"
  | "transaction_data"
  | "booking_data"
  | "payment_data"
  | "metadata"
  | "audit_log";

@Entity({ name: "data_classification_labels" })
export class DataClassificationLabel {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 256 })
  labelName!: string;

  @Column({ type: "varchar", length: 128 })
  entityType!: string;

  @Column({
    type: "enum",
    enum: [
      "public",
      "internal",
      "confidential",
      "restricted",
      "pii",
      "financial",
    ],
  })
  classificationLevel!: ClassificationLevel;

  @Column({
    type: "enum",
    enum: [
      "user_data",
      "transaction_data",
      "booking_data",
      "payment_data",
      "metadata",
      "audit_log",
    ],
  })
  dataType!: DataType;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "simple-array" })
  applicableFields!: string[];

  @Column({ type: "text", nullable: true })
  handlingInstructions?: string | null;

  @Column({ type: "text", nullable: true })
  retentionPolicy?: string | null;

  @Column({ type: "integer", default: 365 })
  retentionDays!: number;

  @Column({ type: "boolean", default: false })
  requiresEncryption!: boolean;

  @Column({ type: "boolean", default: false })
  requiresMasking!: boolean;

  @Column({ type: "simple-array", nullable: true })
  maskingRules?: string[] | null;

  @Column({ type: "boolean", default: false })
  requiresAuditLog!: boolean;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  updatedAt!: Date;

  @Column({ type: "varchar", length: 128, nullable: true })
  createdBy?: string | null;
}
