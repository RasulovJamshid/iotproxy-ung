import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import * as Minio from 'minio';
import { ConfigService } from '@nestjs/config';
import { ExportJob } from './export-job.entity';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Injectable()
export class ExportService {
  private minio: Minio.Client;
  private bucket: string;

  constructor(
    @InjectRepository(ExportJob) private jobs: Repository<ExportJob>,
    @InjectQueue(QUEUE_NAMES.EXPORTS) private queue: Queue,
    private config: ConfigService,
  ) {
    const endpoint = this.config.get<string>('minio.endpoint')!;
    const [host, portStr] = endpoint.split(':');
    this.minio = new Minio.Client({
      endPoint: host,
      port: parseInt(portStr ?? '9000'),
      useSSL: false,
      accessKey: this.config.get('minio.accessKey')!,
      secretKey: this.config.get('minio.secretKey')!,
    });
    this.bucket = this.config.get<string>('minio.bucket') ?? 'iotproxy-exports';
  }

  async create(
    organizationId: string,
    data: {
      siteId: string;
      startTs: string;
      endTs: string;
      format: string;
      fields?: string[];
    },
  ) {
    const job = await this.jobs.save(
      this.jobs.create({
        organizationId,
        siteId: data.siteId,
        startTs: new Date(data.startTs),
        endTs: new Date(data.endTs),
        format: data.format,
        fields: data.fields,
        status: 'PENDING',
      }),
    );

    await this.queue.add('export', { jobId: job.id, organizationId });

    return { jobId: job.id, status: 'PENDING' };
  }

  async findOne(id: string, organizationId: string) {
    const job = await this.jobs.findOne({ where: { id, organizationId } });
    if (!job) throw new NotFoundException(`Export job ${id} not found`);
    return job;
  }

  findAll(organizationId: string) {
    return this.jobs.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async download(id: string, organizationId: string): Promise<{ file: StreamableFile; filename: string; contentType: string }> {
    const job = await this.jobs.findOne({ where: { id, organizationId } });
    if (!job) throw new NotFoundException(`Export job ${id} not found`);
    if (job.status !== 'COMPLETED' || !job.downloadUrl) {
      throw new NotFoundException('Export file is not ready for download');
    }

    const contentType = job.format === 'csv' ? 'text/csv' : 'application/octet-stream';
    const filename = `export-${id}.${job.format}`;

    // job.downloadUrl stores the MinIO object key (e.g. "exports/orgId/jobId.csv").
    // Legacy records may still contain a full presigned URL — extract the key from the path.
    let objectKey = job.downloadUrl;
    if (objectKey.startsWith('http')) {
      const withoutQuery = objectKey.split('?')[0];
      const bucketPrefix = `/${this.bucket}/`;
      const idx = withoutQuery.indexOf(bucketPrefix);
      objectKey = idx >= 0 ? withoutQuery.slice(idx + bucketPrefix.length) : withoutQuery;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream: any = await this.minio.getObject(this.bucket, objectKey);
    return {
      file: new StreamableFile(stream),
      filename,
      contentType,
    };
  }
}
