import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TimescaleRepository } from './timescale.repository';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        // synchronize: true in dev — auto-creates management tables from entity definitions.
        // For production, set to false and run migrations.
        synchronize: config.get('env') !== 'production',
        logging: config.get('env') === 'development' ? ['error', 'warn'] : ['error'],
        extra: {
          max: 10,
          idleTimeoutMillis: 30_000,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TimescaleRepository],
  exports: [TimescaleRepository],
})
export class DatabaseModule {}
