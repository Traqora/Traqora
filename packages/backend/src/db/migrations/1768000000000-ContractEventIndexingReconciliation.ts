import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #931/#932/#934: durable contract-event indexing positions, a deduplicated
 * event archive used as the on-chain source of truth, and an append-only log of
 * booking reconciliation repair attempts.
 */
export class ContractEventIndexingReconciliation1768000000000
  implements MigrationInterface
{
  name = 'ContractEventIndexingReconciliation1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_event_cursors" (
        "contract_id" varchar(128) PRIMARY KEY,
        "cursor" varchar(512),
        "last_committed_ledger" integer NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_event_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "contract_id" varchar(128) NOT NULL,
        "event_type" varchar(64) NOT NULL,
        "ledger" integer NOT NULL,
        "paging_token" varchar(512),
        "tx_hash" varchar(128),
        "soroban_booking_id" varchar(128),
        "wallet_address" varchar(128),
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "indexed_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // The table pre-dates the cursor work in some deployments (it was used by
    // the read-only contract-events API), so add the new columns defensively.
    await queryRunner.query(
      `ALTER TABLE "contract_event_logs" ADD COLUMN IF NOT EXISTS "paging_token" varchar(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_event_logs" ADD COLUMN IF NOT EXISTS "tx_hash" varchar(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contract_event_logs" ADD COLUMN IF NOT EXISTS "soroban_booking_id" varchar(128)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_reconciliation_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id" varchar(64) NOT NULL,
        "soroban_booking_id" varchar(128),
        "contract_id" varchar(128),
        "event_type" varchar(64),
        "event_ledger" integer,
        "previous_status" varchar(32),
        "expected_status" varchar(32) NOT NULL,
        "outcome" varchar(16) NOT NULL,
        "error" text,
        "attempted_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contract_event_logs_contract_event" ON "contract_event_logs" ("contract_id", "event_type")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_contract_event_logs_contract_paging" ON "contract_event_logs" ("contract_id", "paging_token") WHERE "paging_token" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contract_event_logs_wallet" ON "contract_event_logs" ("wallet_address")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contract_event_logs_booking" ON "contract_event_logs" ("soroban_booking_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contract_event_logs_ledger" ON "contract_event_logs" ("ledger")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contract_reconciliation_booking" ON "contract_reconciliation_attempts" ("booking_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contract_reconciliation_outcome" ON "contract_reconciliation_attempts" ("outcome", "attempted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_reconciliation_outcome"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_reconciliation_booking"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_event_logs_ledger"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_event_logs_booking"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_event_logs_wallet"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_event_logs_contract_paging"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contract_event_logs_contract_event"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "contract_reconciliation_attempts"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "contract_event_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contract_event_cursors"`);
  }
}
