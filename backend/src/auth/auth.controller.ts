import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './interfaces/auth-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  refresh(@CurrentUser() user: AuthUser) {
    return this.authService.refresh(user.id);
  }

  /** List all orgs the current user is a member of, with their per-org role. */
  @Get('my-orgs')
  @UseGuards(JwtAuthGuard)
  myOrgs(@CurrentUser() user: AuthUser) {
    return this.authService.getMyOrgs(user.id);
  }

  /** Switch to a different org — returns a fresh token pair scoped to the new org. */
  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  switchOrg(@CurrentUser() user: AuthUser, @Body() body: { orgId: string }) {
    return this.authService.switchOrg(user.id, body.orgId);
  }
}
