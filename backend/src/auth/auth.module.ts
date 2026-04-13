import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { FlexibleAuthGuard } from './guards/flexible-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { User } from '../organizations/user.entity';
import { UserOrganization } from '../organizations/user-organization.entity';
import { Organization } from '../organizations/organization.entity';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // secrets set per-call in AuthService
    TypeOrmModule.forFeature([User, UserOrganization, Organization]),
    ApiKeysModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    FlexibleAuthGuard,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [FlexibleAuthGuard, JwtAuthGuard, RolesGuard, JwtModule, ApiKeysModule],
})
export class AuthModule {}
