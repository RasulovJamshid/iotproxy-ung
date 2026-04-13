import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrgContext } from '../interfaces/auth-user.interface';

export const CurrentOrg = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): OrgContext => {
    return ctx.switchToHttp().getRequest().orgContext;
  },
);
