import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type DataClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "pii"
  | "financial";
export type AccessLevel =
  | "super_admin"
  | "admin"
  | "support"
  | "analyst"
  | "viewer"
  | "restricted";
export type ComplianceFramework =
  | "gdpr"
  | "ccpa"
  | "hipaa"
  | "pci-dss"
  | "soc2";

@Entity({ name: "data_access_policies" })
export class DataAccessPolicy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 256 })
  policyName!: string;

  @Column({ type: "text" })
  description!: string;

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
  dataClassification!: DataClassification;

  @Column("simple-array")
  requiredRoles!: AccessLevel[];

  @Column({
    type: "enum",
    enum: ["gdpr", "ccpa", "hipaa", "pci-dss", "soc2"],
    array: true,
  })
  applicableFrameworks!: ComplianceFramework[];

  @Column({ type: "text", nullable: true })
  privacyControls?: string | null;

  @Column({ type: "text", nullable: true })
  dataRetentionPolicy?: string | null;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "boolean", default: false })
  requiresConsentManagement!: boolean;

  @Column({ type: "integer", default: 30 })
  dataRetentionDays!: number;

  @Column({ type: "text", nullable: true })
  auditRequirements?: string | null;

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

  @Column({ type: "varchar", length: 128, nullable: true })
  updatedBy?: string | null;
}
