import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Backup } from './backup.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

const execAsync = promisify(exec);

export interface BackupJob {
  backupId: string;
}

@Processor(QUEUE_NAMES.BACKUPS)
@Injectable()
export class BackupWorker extends WorkerHost {
  private readonly logger = new Logger(BackupWorker.name);
  private minio: Minio.Client;
  private bucket: string;

  constructor(
    @InjectRepository(Backup) private backups: Repository<Backup>,
    private config: ConfigService,
  ) {
    super();
    const endpoint = this.config.get<string>('minio.endpoint')!;
    const [host, portStr] = endpoint.split(':');
    this.minio = new Minio.Client({
      endPoint: host,
      port: parseInt(portStr ?? '9000'),
      useSSL: false,
      accessKey: this.config.get<string>('minio.accessKey')!,
      secretKey: this.config.get<string>('minio.secretKey')!,
    });
    this.bucket = this.config.get<string>('minio.bucket')!;
  }

  async process(job: Job<BackupJob>): Promise<void> {
    const { backupId } = job.data;
    const backup = await this.backups.findOne({ where: { id: backupId } });
    if (!backup) {
      this.logger.error(`Backup ${backupId} not found`);
      return;
    }

    if (job.name === 'create-backup') {
      await this.createBackup(backup);
    } else if (job.name === 'restore-backup') {
      await this.restoreBackup(backup);
    }
  }

  private async createBackup(backup: Backup): Promise<void> {
    const startTime = new Date();
    await this.backups.update(backup.id, { status: 'IN_PROGRESS', startedAt: startTime });

    try {
      const dbUrl = this.config.get<string>('database.url')!;
      const tmpDir = '/tmp/iotproxy-backups';
      await fs.mkdir(tmpDir, { recursive: true });

      const fileName = `backup-${backup.organizationId}-${Date.now()}.sql`;
      const localPath = path.join(tmpDir, fileName);

      // Use pg_dump to create SQL backup
      this.logger.log(`Creating backup for org ${backup.organizationId}...`);
      const { stdout, stderr } = await execAsync(
        `pg_dump "${dbUrl}" --no-owner --no-acl --clean --if-exists > "${localPath}"`,
      );
      if (stderr) this.logger.warn(`pg_dump stderr: ${stderr}`);

      // Get file size
      const stats = await fs.stat(localPath);
      const fileSizeBytes = stats.size;

      // Upload to MinIO
      const s3Path = `backups/${backup.organizationId}/${fileName}`;
      await this.minio.fPutObject(this.bucket, s3Path, localPath, {
        'Content-Type': 'application/sql',
      });
      this.logger.log(`Backup uploaded to ${s3Path}`);

      // Clean up local file
      await fs.unlink(localPath);

      // Update backup record
      await this.backups.update(backup.id, {
        status: 'COMPLETED',
        filePath: s3Path,
        fileSizeBytes,
        completedAt: new Date(),
      });

      this.logger.log(`Backup ${backup.id} completed (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Backup ${backup.id} failed: ${errorMessage}`, err instanceof Error ? err.stack : undefined);
      await this.backups.update(backup.id, {
        status: 'FAILED',
        errorMessage,
        completedAt: new Date(),
      });
    }
  }

  private async restoreBackup(backup: Backup): Promise<void> {
    this.logger.log(`Restoring backup ${backup.id}...`);

    try {
      if (!backup.filePath) {
        throw new Error('Backup file path not found');
      }

      const tmpDir = '/tmp/iotproxy-backups';
      await fs.mkdir(tmpDir, { recursive: true });

      const localPath = path.join(tmpDir, `restore-${Date.now()}.sql`);

      // Download from MinIO
      await this.minio.fGetObject(this.bucket, backup.filePath, localPath);
      this.logger.log(`Backup downloaded from ${backup.filePath}`);

      // Restore using psql
      const dbUrl = this.config.get<string>('database.url')!;
      const { stdout, stderr } = await execAsync(
        `psql "${dbUrl}" < "${localPath}"`,
      );
      if (stderr) this.logger.warn(`psql stderr: ${stderr}`);

      // Clean up
      await fs.unlink(localPath);

      this.logger.log(`Backup ${backup.id} restored successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Restore ${backup.id} failed: ${errorMessage}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }
}
