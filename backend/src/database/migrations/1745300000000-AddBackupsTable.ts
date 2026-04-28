import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBackupsTable1745300000000 implements MigrationInterface {
  name = 'AddBackupsTable1745300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "backups" (
        "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id"     UUID        NOT NULL,
        "backup_type"         VARCHAR(20) DEFAULT 'FULL',
        "status"              VARCHAR(20) DEFAULT 'PENDING',
        "file_path"           TEXT,
        "file_size_bytes"     BIGINT,
        "tables_included"     JSONB       DEFAULT '[]',
        "error_message"       TEXT,
        "started_at"          TIMESTAMPTZ,
        "completed_at"        TIMESTAMPTZ,
        "created_at"          TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_backups_org_id" ON "backups" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_backups_status" ON "backups" ("status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "backups"`);
  }
}
