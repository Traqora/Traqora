import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type ReportType =
  | "gdpr_audit"
  | "ccpa_audit"
  | "data_inventory"
  | "access_log"
  | "breach_notification"
  | "pia";
export type ReportStatus = "draft" | "pending_review" | "approved" | "archived";

@Entity({ name: "compliance_reports" })
export class ComplianceReport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 256 })
  reportName!: string;

  @Column({
    type: "enum",
    enum: [
      "gdpr_audit",
      "ccpa_audit",
      "data_inventory",
      "access_log",
      "breach_notification",
      "pia",
    ],
  })
  reportType!: ReportType;

  @Column({
    type: "enum",
    enum: ["draft", "pending_review", "approved", "archived"],
  })
  status!: ReportStatus;

  @Column({ type: "text" })
  reportContent!: string;

  @Column({ type: "jsonb", nullable: true })
  findings?: any;

  @Column({ type: "text", nullable: true })
  recommendations?: string | null;

  @Column({ type: "integer", default: 0 })
  totalRecordsProcessed!: number;

  @Column({ type: "integer", default: 0 })
  findingsCount!: number;

  @Column({ type: "integer", default: 0 })
  dataBreachesIdentified!: number;

  @Index()
  @Column({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
    nullable: true,
  })
  reportPeriodStart?: Date | null;

  @Index()
  @Column({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
    nullable: true,
  })
  reportPeriodEnd?: Date | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  generatedBy?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  reviewedBy?: string | null;

  @Column({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
    nullable: true,
  })
  reviewedAt?: Date | null;

  @Column({ type: "text", nullable: true })
  reviewNotes?: string | null;

  @Column({ type: "boolean", default: false })
  isPublic!: boolean;

  @CreateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  updatedAt!: Date;
}
