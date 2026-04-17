import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from './sensor.entity';
import { SensorConfig } from './sensor-config.entity';
import { SensorConfigVersion } from './sensor-config-version.entity';
import { VirtualSensor } from './virtual-sensor.entity';
import { SensorType } from './sensor-type.entity';
import { SensorCategory } from './sensor-category.entity';
import { SensorsController } from './sensors.controller';
import { SensorTypesController } from './sensor-types.controller';
import { SensorCategoriesController } from './sensor-categories.controller';
import { SensorsService } from './sensors.service';
import { SensorTypesService } from './sensor-types.service';
import { SensorCategoriesService } from './sensor-categories.service';
import { AuthModule } from '../auth/auth.module';
import { Site } from '../sites/site.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sensor, SensorConfig, SensorConfigVersion, VirtualSensor, SensorType, SensorCategory, Site,
    ]),
    AuthModule,
  ],
  controllers: [SensorsController, SensorTypesController, SensorCategoriesController],
  providers: [SensorsService, SensorTypesService, SensorCategoriesService],
  exports: [SensorsService, SensorTypesService, SensorCategoriesService, TypeOrmModule],
})
export class SensorsModule {}
