import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import * as Minio from 'minio';
import { Backup } from './backup.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private minio: Minio.Client;
  private bucket: string;

  constructor(
    @InjectRepository(Backup) private backups: Repository<Backup>,
    @InjectQueue(QUEUE_NAMES.BACKUPS) private queue: Queue,
    private config: ConfigService,
  ) {
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
    this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      const exists = await this.minio.bucketExists(this.bucket);
      if (!exists) {
        await this.minio.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      }
    } catch (error) {
      this.logger.error(`Failed to ensure bucket exists: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new backup job (queued for async processing).
   */
  async createBackup(organizationId: string, backupType: 'FULL' | 'INCREMENTAL' = 'FULL') {
    const backup = await this.backups.save(
      this.backups.create({
        organizationId,
        backupType,
        status: 'PENDING',
        tablesIncluded: backupType === 'FULL'
          ? ['sensor_readings', 'daily_summaries', 'sensors', 'sites', 'organizations']
          : ['sensor_readings', 'daily_summaries'],
      }),
    );

    await this.queue.add('create-backup', { backupId: backup.id });
    this.logger.log(`Backup ${backup.id} queued for org ${organizationId}`);
    return backup;
  }

  /**
   * List all backups for an organization.
   */
  async listBackups(organizationId: string) {
    return this.backups.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a single backup by ID.
   */
  async getBackup(id: string, organizationId: string) {
    const backup = await this.backups.findOne({ where: { id, organizationId } });
    if (!backup) throw new NotFoundException(`Backup ${id} not found`);
    return backup;
  }

  /**
   * Delete a backup record and its file.
   */
  async deleteBackup(id: string, organizationId: string) {
    const backup = await this.getBackup(id, organizationId);
    // TODO: Delete file from MinIO/S3 if filePath exists
    await this.backups.delete(id);
    this.logger.log(`Backup ${id} deleted`);
  }

  /**
   * Get a presigned download URL for a backup file.
   */
  async getDownloadUrl(id: string, organizationId: string) {
    const backup = await this.getBackup(id, organizationId);
    if (backup.status !== 'COMPLETED' || !backup.filePath) {
      throw new Error('Backup file not available for download');
    }

    // Generate presigned URL valid for 1 hour
    let url = await this.minio.presignedGetObject(this.bucket, backup.filePath, 3600);
    
    // Replace internal endpoint with external endpoint for browser access
    const internalEndpoint = this.config.get<string>('minio.endpoint')!;
    const externalEndpoint = this.config.get<string>('minio.externalEndpoint')!;
    if (internalEndpoint !== externalEndpoint) {
      url = url.replace(internalEndpoint, externalEndpoint);
    }
    
    return { url, expiresIn: 3600 };
  }

  /**
   * Restore from a backup (queued for async processing).
   */
  async restoreBackup(id: string, organizationId: string) {
    const backup = await this.getBackup(id, organizationId);
    if (backup.status !== 'COMPLETED') {
      throw new Error('Cannot restore from incomplete backup');
    }
    await this.queue.add('restore-backup', { backupId: id });
    this.logger.log(`Restore queued for backup ${id}`);
    return { message: 'Restore job queued', backupId: id };
  }
}
