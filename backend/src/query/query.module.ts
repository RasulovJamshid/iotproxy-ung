import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { ReadingsGateway } from './readings.gateway';
import { SensorsModule } from '../sensors/sensors.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [SensorsModule, AuthModule, ApiKeysModule],
  controllers: [QueryController],
  providers: [ReadingsGateway],
  exports: [ReadingsGateway],
})
export class QueryModule {}
