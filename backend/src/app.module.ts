import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import configuration, { validationSchema } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { CacheRedisModule } from './database/cache-redis.module';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SitesModule } from './sites/sites.module';
import { SensorsModule } from './sensors/sensors.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { IngestModule } from './ingest/ingest.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { QueryModule } from './query/query.module';
import { AlertsModule } from './alerts/alerts.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConnectivityModule } from './connectivity/connectivity.module';
import { ExportModule } from './export/export.module';
import { AdminModule } from './admin/admin.module';
import { AdaptersModule } from './adapters/adapters.module';
import { HealthModule } from './health/health.module';
import { QUEUE_NAMES } from '@iotproxy/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),

    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.bullUrl') },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      }),
      inject: [ConfigService],
    }),

    ThrottlerModule.forRootAsync({
      imports: [CacheRedisModule],
      useFactory: (config: ConfigService, redis: any) => ({
        throttlers: [{ ttl: 60_000, limit: config.get('ingest.rateLimitRpm') ?? 10000 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
      inject: [ConfigService, 'CACHE_REDIS'],
    }),

    CacheRedisModule,
    DatabaseModule,
    AuthModule,
    ApiKeysModule,
    OrganizationsModule,
    SitesModule,
    SensorsModule,
    DiscoveryModule,
    IngestModule,
    PipelineModule,
    QueryModule,
    AlertsModule,
    WebhooksModule,
    NotificationsModule,
    ConnectivityModule,
    ExportModule,
    AdminModule,
    AdaptersModule,
    HealthModule,
  ],
})
export class AppModule {}
