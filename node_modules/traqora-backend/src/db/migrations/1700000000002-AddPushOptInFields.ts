import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPushOptInFields1700000000002 implements MigrationInterface {
  name = "AddPushOptInFields1700000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ADD COLUMN "pushBookingEnabled" boolean DEFAULT true,
      ADD COLUMN "pushReminderEnabled" boolean DEFAULT true,
      ADD COLUMN "pushRefundEnabled" boolean DEFAULT true,
      ADD COLUMN "pushPromoEnabled" boolean DEFAULT true,
      ADD COLUMN "pushOptedIn" boolean DEFAULT false,
      ADD COLUMN "pushOptInAt" timestamp,
      ADD COLUMN "pushDeviceTokens" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      DROP COLUMN "pushDeviceTokens",
      DROP COLUMN "pushOptInAt",
      DROP COLUMN "pushOptedIn",
      DROP COLUMN "pushPromoEnabled",
      DROP COLUMN "pushRefundEnabled",
      DROP COLUMN "pushReminderEnabled",
      DROP COLUMN "pushBookingEnabled"
    `);
  }
}
