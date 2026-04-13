import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from './site.entity';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { AuthModule } from '../auth/auth.module';
import { Organization } from '../organizations/organization.entity';
import { Sensor } from '../sensors/sensor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Site, Organization, Sensor]), AuthModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService, TypeOrmModule],
})
export class SitesModule {}
