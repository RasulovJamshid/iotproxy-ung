import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBackfillRuns1746000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS backfill_runs (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        adapter_id              UUID          NOT NULL,
        organization_id         UUID          NOT NULL,
        range_start             TIMESTAMPTZ   NOT NULL,
        range_end               TIMESTAMPTZ   NOT NULL,
        chunk_size              VARCHAR(20)   NOT NULL DEFAULT 'day',
        chunk_size_sec          INT,
        timestamp_strategy      VARCHAR(20)   NOT NULL DEFAULT 'sequence',
        status                  VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
        total_chunks            INT           NOT NULL DEFAULT 0,
        completed_chunks        INT           NOT NULL DEFAULT 0,
        failed_chunks           INT           NOT NULL DEFAULT 0,
        total_readings          INT           NOT NULL DEFAULT 0,
        delay_between_chunks_ms INT           NOT NULL DEFAULT 0,
        error_message           TEXT,
        created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backfill_runs_org
        ON backfill_runs (organization_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backfill_runs_adapter
        ON backfill_runs (adapter_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS backfill_runs`);
  }
}
