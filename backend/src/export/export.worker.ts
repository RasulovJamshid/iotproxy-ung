import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as Minio from 'minio';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ExportJob } from './export-job.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

const PAGE_SIZE = 10_000;

@Processor(QUEUE_NAMES.EXPORTS)
@Injectable()
export class ExportWorker extends WorkerHost {
  private readonly logger = new Logger(ExportWorker.name);
  private minio: Minio.Client;
  private pool: Pool;

  constructor(
    @InjectRepository(ExportJob) private jobs: Repository<ExportJob>,
    private config: ConfigService,
  ) {
    super();
    const endpoint = this.config.get<string>('minio.endpoint')!;
    const [host, portStr] = endpoint.split(':');
    this.minio = new Minio.Client({
      endPoint: host,
      port: parseInt(portStr ?? '9000'),
      useSSL: false,
      accessKey: this.config.get('minio.accessKey')!,
      secretKey: this.config.get('minio.secretKey')!,
    });
    this.pool = new Pool({ connectionString: this.config.get('database.url') });
  }

  async process(job: Job<{ jobId: string; organizationId: string }>): Promise<void> {
    const exportJob = await this.jobs.findOne({ where: { id: job.data.jobId } });
    if (!exportJob) return;

    await this.jobs.update(exportJob.id, { status: 'RUNNING' });

    try {
      const objectKey = `exports/${exportJob.organizationId}/${exportJob.id}.${exportJob.format}`;
      const bucket = this.config.get<string>('minio.bucket')!;

      await this.ensureBucket(bucket);

      // Stream export in pages to avoid loading all data into memory
      const chunks: Buffer[] = [];
      let offset = 0;
      let total = 0;

      if (exportJob.format === 'csv') {
        chunks.push(Buffer.from('sensor_id,phenomenon_time,processed_data,quality_code\n'));
      }

      while (true) {
        const rows = await this.fetchPage(exportJob, offset);
        if (rows.length === 0) break;

        for (const row of rows) {
          chunks.push(Buffer.from(this.rowToCsv(row)));
        }

        total += rows.length;
        offset += rows.length;
        const progress = Math.min(99, Math.round((offset / (total + 1)) * 100));
        await this.jobs.update(exportJob.id, { progress });

        if (rows.length < PAGE_SIZE) break;
      }

      const data = Buffer.concat(chunks);
      await this.minio.putObject(bucket, objectKey, data, data.length, {
        'Content-Type': exportJob.format === 'csv' ? 'text/csv' : 'application/octet-stream',
      });

      // Store the object key — the API's download endpoint will stream the file
      // through the backend rather than exposing a MinIO-internal presigned URL.
      await this.jobs.update(exportJob.id, {
        status: 'COMPLETED',
        progress: 100,
        downloadUrl: objectKey,
      });

      this.logger.log(`Export ${exportJob.id} completed (${total} rows)`);
    } catch (err) {
      await this.jobs.update(exportJob.id, {
        status: 'FAILED',
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  }

  private async fetchPage(job: ExportJob, offset: number) {
    const result = await this.pool.query(
      `SELECT sensor_id, phenomenon_time, processed_data, quality_code
       FROM sensor_readings
       WHERE site_id = $1
         AND organization_id = $2
         AND phenomenon_time >= $3
         AND phenomenon_time <= $4
       ORDER BY phenomenon_time ASC
       LIMIT $5 OFFSET $6`,
      [job.siteId, job.organizationId, job.startTs, job.endTs, PAGE_SIZE, offset],
    );
    return result.rows;
  }

  private rowToCsv(row: Record<string, unknown>): string {
    const data = JSON.stringify(row['processed_data']);
    return `${row['sensor_id']},${row['phenomenon_time']},${data},${row['quality_code']}\n`;
  }

  private async ensureBucket(bucket: string) {
    const exists = await this.minio.bucketExists(bucket);
    if (!exists) await this.minio.makeBucket(bucket, 'us-east-1');
  }
}
