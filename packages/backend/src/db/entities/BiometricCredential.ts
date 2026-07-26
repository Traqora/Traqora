import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("biometric_credentials")
export class BiometricCredential {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column()
  walletAddress: string;

  @Column({ unique: true })
  credentialId: string;

  @Column({ type: "text" })
  publicKey: string;

  @Column({ default: 0 })
  counter: number;

  @Column({ default: "fingerprint" })
  credentialType: "fingerprint" | "face";

  @Column({ nullable: true })
  deviceName: string | null;

  @Column({ type: "text", nullable: true })
  transports: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: "timestamp", nullable: true })
  lastUsedAt: Date | null;
}
