import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteGroup } from './site-group.entity';
import { Site } from '../sites/site.entity';
import { SiteGroupsService } from './site-groups.service';
import { SiteGroupsController } from './site-groups.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([SiteGroup, Site]), AuthModule],
  controllers: [SiteGroupsController],
  providers: [SiteGroupsService],
  exports: [SiteGroupsService, TypeOrmModule],
})
export class SiteGroupsModule {}
