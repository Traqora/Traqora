import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type PIAStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "implemented"
  | "archived";
export type RiskLevel = "low" | "medium" | "high" | "critical";

@Entity({ name: "data_privacy_impact_assessments" })
export class DataPrivacyImpactAssessment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 256 })
  piaTitle!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({
    type: "enum",
    enum: ["draft", "in_review", "approved", "implemented", "archived"],
  })
  status!: PIAStatus;

  @Column({ type: "text" })
  processDescription!: string;

  @Column({ type: "simple-array" })
  personalDataTypes!: string[];

  @Column({ type: "simple-array" })
  dataCategories!: string[];

  @Column({ type: "text", nullable: true })
  justification?: string | null;

  @Column({ type: "text", nullable: true })
  necessity?: string | null;

  @Column({ type: "text", nullable: true })
  proportionality?: string | null;

  @Column({
    type: "enum",
    enum: ["low", "medium", "high", "critical"],
  })
  overallRiskLevel!: RiskLevel;

  @Column({ type: "jsonb", nullable: true })
  riskAssessment?: {
    dataSecurityRisk?: RiskLevel;
    privacyViolationRisk?: RiskLevel;
    unauthorizedAccessRisk?: RiskLevel;
    dataBreachRisk?: RiskLevel;
  };

  @Column({ type: "jsonb", nullable: true })
  mitigationMeasures?: {
    technicalMeasures?: string[];
    organizationalMeasures?: string[];
    legacyMeasures?: string[];
  };

  @Column({ type: "simple-array", nullable: true })
  involvedThirdParties?: string[] | null;

  @Column({ type: "boolean", default: false })
  requiresConsent!: boolean;

  @Column({ type: "text", nullable: true })
  consentStrategy?: string | null;

  @Column({ type: "text", nullable: true })
  recommendations?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  assessedBy?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  approvedBy?: string | null;

  @Column({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
    nullable: true,
  })
  approvedAt?: Date | null;

  @CreateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  updatedAt!: Date;
}
