import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './api-key.entity';
import { ApiKeyScope } from './api-key-scope.entity';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { KeyExpiryCron } from './key-expiry.cron';
import { CacheRedisModule } from '../database/cache-redis.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, ApiKeyScope]),
    CacheRedisModule,
    forwardRef(() => WebhooksModule),
  ],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, KeyExpiryCron],
  exports: [ApiKeyService],
})
export class ApiKeysModule {}
