import {
  Controller, Post, Body, UseGuards, HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FlexibleAuthGuard } from '../auth/guards/flexible-auth.guard';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { OrgContext } from '../auth/interfaces/auth-user.interface';
import { IngestQueueProducer } from './ingest-queue.producer';
import { SingleReadingDto } from './dto/single-reading.dto';
import { BulkReadingDto } from './dto/bulk-reading.dto';
import { IngestJob, PERMISSIONS } from '@iotproxy/shared';
import { randomUUID } from 'crypto';

@ApiTags('ingest')
@ApiSecurity('api-key')
@UseGuards(FlexibleAuthGuard)
@Controller('ingest')
export class HttpIngestController {
  constructor(private queue: IngestQueueProducer) {}

  @Post('readings')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async ingestSingle(
    @Body() dto: SingleReadingDto,
    @CurrentOrg() org: OrgContext,
  ) {
    // API key must have 'ingest' or 'admin' permission
    if (!org.permissions.some(p => ([PERMISSIONS.INGEST, PERMISSIONS.ADMIN] as string[]).includes(p))) {
      throw new UnauthorizedException('API key lacks ingest permission');
    }

    const correlationId = randomUUID();
    const batchId = randomUUID();

    const job: IngestJob = {
      ...dto,
      organizationId: org.organizationId,
      siteId: org.siteId ?? '',
      receivedAt: new Date().toISOString(),
      correlationId,
      batchId,
      source: 'http',
    };

    await this.queue.enqueue([job]);
    return { accepted: 1, batchId, correlationId };
  }

  @Post('readings/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async ingestBulk(
    @Body() dto: BulkReadingDto,
    @CurrentOrg() org: OrgContext,
  ) {
    // API key must have 'ingest' or 'admin' permission
    if (!org.permissions.some(p => ([PERMISSIONS.INGEST, PERMISSIONS.ADMIN] as string[]).includes(p))) {
      throw new UnauthorizedException('API key lacks ingest permission');
    }

    const batchId = randomUUID();

    const jobs: IngestJob[] = dto.readings.map((r) => ({
      ...r,
      organizationId: org.organizationId,
      siteId: org.siteId ?? '',
      receivedAt: new Date().toISOString(),
      correlationId: randomUUID(),
      batchId,
      source: 'http',
    }));

    await this.queue.enqueue(jobs);
    return { accepted: jobs.length, batchId };
  }
}
