import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from './sensor.entity';
import { SensorConfig } from './sensor-config.entity';
import { SensorConfigVersion } from './sensor-config-version.entity';
import { VirtualSensor } from './virtual-sensor.entity';
import { SensorsController } from './sensors.controller';
import { SensorsService } from './sensors.service';
import { AuthModule } from '../auth/auth.module';
import { Site } from '../sites/site.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sensor, SensorConfig, SensorConfigVersion, VirtualSensor, Site,
    ]),
    AuthModule,
  ],
  controllers: [SensorsController],
  providers: [SensorsService],
  exports: [SensorsService, TypeOrmModule],
})
export class SensorsModule {}
