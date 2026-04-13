import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'CACHE_REDIS',
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('redis.cacheUrl')!),
      inject: [ConfigService],
    },
  ],
  exports: ['CACHE_REDIS'],
})
export class CacheRedisModule {}
