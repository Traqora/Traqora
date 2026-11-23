import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1716912345678 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === "postgres";
    const uuidDefault = isPostgres ? " DEFAULT gen_random_uuid()" : "";
    const jsonType = isPostgres ? "JSONB" : "TEXT";
    const timestamptzType = isPostgres ? "TIMESTAMPTZ" : "DATETIME";
    const checkConstraint = isPostgres ? ' CHECK ("walletType" IN (\'freighter\', \'albedo\', \'rabet\'))' : '';
    const nowDefault = isPostgres ? "now()" : "CURRENT_TIMESTAMP";

    // 1. users
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "walletAddress" VARCHAR PRIMARY KEY,
        "walletType" VARCHAR NOT NULL${checkConstraint},
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "lastLoginAt" ${timestamptzType}
      )
    `);

    // 2. flights
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "flights" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "flightNumber" VARCHAR(32) NOT NULL,
        "airlineCode" VARCHAR(10) NOT NULL,
        "fromAirport" VARCHAR(16) NOT NULL,
        "toAirport" VARCHAR(16) NOT NULL,
        "departureTime" ${timestamptzType} NOT NULL,
        "arrivalTime" ${timestamptzType},
        "seatsAvailable" INTEGER NOT NULL DEFAULT 0,
        "priceCents" INTEGER NOT NULL DEFAULT 0,
        "airlineSorobanAddress" VARCHAR(128) NOT NULL DEFAULT '',
        "status" VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
        "delayMinutes" INTEGER NOT NULL DEFAULT 0,
        "gate" VARCHAR(16),
        "cancellationReason" VARCHAR(256),
        "terminal" VARCHAR(32),
        "dataSource" VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
        "lastSyncedAt" ${timestamptzType},
        "syncStatus" VARCHAR(32) NOT NULL DEFAULT 'EXACT_MATCH',
        "conflictData" ${jsonType},
        "syncAttempts" INTEGER NOT NULL DEFAULT 0,
        "lastSyncError" VARCHAR(256),
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "rawData" ${jsonType}
      )
    `);

    // Indexes for flights
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_flights_flightNumber" ON "flights" ("flightNumber")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_flights_airlineCode" ON "flights" ("airlineCode")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_flights_status" ON "flights" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_flights_lastSyncedAt" ON "flights" ("lastSyncedAt")`);

    // 3. passengers
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "passengers" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "email" VARCHAR(512) NOT NULL,
        "firstName" VARCHAR(512) NOT NULL,
        "lastName" VARCHAR(512) NOT NULL,
        "phone" VARCHAR(512),
        "sorobanAddress" VARCHAR(128) NOT NULL DEFAULT ''
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_passengers_email" ON "passengers" ("email")`);

    // 4. bookings
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bookings" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "idempotencyKey" VARCHAR(128),
        "flightId" UUID REFERENCES "flights"("id") ON DELETE RESTRICT,
        "passengerId" UUID REFERENCES "passengers"("id") ON DELETE CASCADE,
        "status" VARCHAR(32) NOT NULL DEFAULT 'created',
        "amountCents" INTEGER NOT NULL,
        "stripePaymentIntentId" VARCHAR(128),
        "stripeClientSecret" VARCHAR(256),
        "sorobanUnsignedXdr" TEXT,
        "sorobanTxHash" VARCHAR(128),
        "sorobanBookingId" BIGINT,
        "contractSubmitAttempts" INTEGER NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_bookings_idempotencyKey" ON "bookings" ("idempotencyKey")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_bookings_stripePaymentIntentId" ON "bookings" ("stripePaymentIntentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_bookings_sorobanTxHash" ON "bookings" ("sorobanTxHash")`);

    // 5. refunds
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refunds" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "bookingId" UUID NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "status" VARCHAR(32) NOT NULL,
        "reason" VARCHAR(64) NOT NULL,
        "reasonDetails" TEXT,
        "requestedAmountCents" INTEGER NOT NULL,
        "approvedAmountCents" INTEGER,
        "processingFeeCents" INTEGER NOT NULL DEFAULT 0,
        "isEligible" BOOLEAN NOT NULL DEFAULT false,
        "eligibilityNotes" TEXT,
        "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
        "reviewedBy" VARCHAR(128),
        "reviewedAt" ${timestamptzType},
        "reviewNotes" TEXT,
        "stripeRefundId" VARCHAR(128),
        "sorobanUnsignedXdr" TEXT,
        "sorobanTxHash" VARCHAR(128),
        "contractSubmitAttempts" INTEGER NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "requestedBy" VARCHAR(128),
        "isDelayed" BOOLEAN NOT NULL DEFAULT false,
        "delayedUntil" ${timestamptzType},
        "delayedLedgerSequence" INTEGER,
        "cancelledBy" VARCHAR(128),
        "cancelledAt" ${timestamptzType},
        "cancellationReason" TEXT,
        "emergencyOverride" BOOLEAN NOT NULL DEFAULT false,
        "emergencyOverrideBy" VARCHAR(128),
        "emergencyOverrideReason" TEXT,
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refunds_bookingId" ON "refunds" ("bookingId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refunds_stripeRefundId" ON "refunds" ("stripeRefundId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refunds_sorobanTxHash" ON "refunds" ("sorobanTxHash")`);

    // 6. user_preferences
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "userId" VARCHAR NOT NULL,
        "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
        "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
        "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
        "email" VARCHAR,
        "phoneNumber" VARCHAR,
        "fcmToken" VARCHAR,
        "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
        "webhookUrl" VARCHAR,
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);

    // 7. notification_logs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_logs" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "userId" VARCHAR NOT NULL,
        "channel" VARCHAR NOT NULL,
        "type" VARCHAR NOT NULL,
        "payload" TEXT,
        "status" VARCHAR NOT NULL DEFAULT 'pending',
        "errorMessage" VARCHAR,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);

    // 8. admin_users
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "email" VARCHAR(128) NOT NULL,
        "passwordHash" VARCHAR(256) NOT NULL,
        "role" VARCHAR(32) NOT NULL DEFAULT 'admin',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastLoginAt" ${timestamptzType},
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_admin_users_email" ON "admin_users" ("email")`);

    // 9. admin_audit_logs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "adminId" VARCHAR(128) NOT NULL,
        "adminEmail" VARCHAR(128) NOT NULL,
        "action" VARCHAR(64) NOT NULL,
        "resource" VARCHAR(64) NOT NULL,
        "resourceId" VARCHAR(128),
        "details" TEXT,
        "ipAddress" VARCHAR(64) NOT NULL DEFAULT 'unknown',
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_adminId" ON "admin_audit_logs" ("adminId")`);

    // 10. idempotency_keys
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "idempotency_keys" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "key" VARCHAR(128) NOT NULL,
        "method" VARCHAR(64) NOT NULL,
        "path" VARCHAR(256) NOT NULL,
        "requestHash" VARCHAR(64) NOT NULL,
        "resourceId" VARCHAR(64),
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_idempotency_keys_key" ON "idempotency_keys" ("key")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_resourceId" ON "idempotency_keys" ("resourceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === "postgres";
    const cascade = isPostgres ? " CASCADE" : "";

    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_keys"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_logs"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "passengers"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "flights"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"${cascade}`);
  }
}
