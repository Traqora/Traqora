import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type AncillaryServiceType =
  | "seat_upgrade"
  | "priority_boarding"
  | "lounge_access"
  | "extra_legroom";

export type AncillaryPurchaseStatus =
  | "purchased"
  | "fulfilled"
  | "bid_pending"
  | "bid_accepted"
  | "bid_rejected";

@Entity({ name: "ancillary_purchases" })
@Index("idx_ancillary_booking", ["bookingId"])
@Index("idx_ancillary_type_created", ["serviceType", "createdAt"])
export class AncillaryPurchase {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  bookingId!: string;

  @Column({ type: "varchar", length: 48 })
  serviceCode!: string;

  @Column({ type: "varchar", length: 32 })
  serviceType!: AncillaryServiceType;

  @Column({ type: "integer" })
  amountCents!: number;

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  @Column({ type: "varchar", length: 24 })
  status!: AncillaryPurchaseStatus;

  @Column({
    type: process.env.NODE_ENV === "test" ? "simple-json" : "jsonb",
    nullable: true,
  })
  details?: Record<string, string | number | boolean> | null;

  @CreateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: process.env.NODE_ENV === "test" ? "datetime" : "timestamptz",
  })
  updatedAt!: Date;
}
