import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export interface TravelPreferences {
  seatPreference?: "aisle" | "window" | "middle";
  mealPreference?: string;
  preferredCabinClass?: "economy" | "premium_economy" | "business" | "first";
  frequentFlyerNumbers?: Record<string, string>;
}

/**
 * Creator/user-facing profile customization (issue #374): avatar, display
 * name, bio, and travel preferences. Distinct from `UserPreference`, which
 * holds notification channel settings.
 *
 * `avatarUrl` stores a URL only — there is no image upload/processing
 * pipeline or CDN integration here (out of scope; see PR description).
 */
@Entity("user_profiles")
export class UserProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  userId: string; // walletAddress, matching UserPreference's convention

  @Column({ type: "varchar", length: 80, nullable: true })
  displayName: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  bio: string | null;

  @Column({ type: "varchar", length: 2048, nullable: true })
  avatarUrl: string | null;

  @Column({
    type: process.env.NODE_ENV === "test" ? "simple-json" : "jsonb",
    nullable: true,
  })
  travelPreferences: TravelPreferences | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
