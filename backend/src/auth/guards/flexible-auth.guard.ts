import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApiKeyService } from '../../api-keys/api-key.service';
import { OrgContext } from '../interfaces/auth-user.interface';
import { PERMISSIONS } from '@iotproxy/shared';

/**
 * Accepts either:
 *  - X-API-Key header  → resolves OrgContext (site-scoped ingest)
 *  - Authorization: Bearer <JWT> → resolves AuthUser (operator/service)
 *
 * Attaches req.orgContext for API key path, req.user for JWT path.
 */
@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private apiKeys: ApiKeyService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      return this.validateApiKey(req, apiKey);
    }

    const bearer = req.headers['authorization'] as string | undefined;
    if (bearer?.startsWith('Bearer ')) {
      return this.validateJwt(req, bearer.slice(7));
    }

    throw new UnauthorizedException('No credentials provided');
  }

  private async validateApiKey(req: any, rawKey: string): Promise<boolean> {
    const key = await this.apiKeys.validate(rawKey);
    if (!key) throw new UnauthorizedException('Invalid or expired API key');

    // Don't check permissions here - let each controller validate based on its needs
    // (e.g., 'ingest' for ingest endpoints, 'read' for query endpoints, 'admin' for write operations)

    const orgContext: OrgContext = {
      organizationId: key.organizationId,
      siteId: key.siteId,
      permissions: key.permissions,
      apiKeyId: key.id,
    };
    req.orgContext = orgContext;
    return true;
  }

  private validateJwt(req: any, token: string): boolean {
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      req.user = {
        id: payload.sub,
        email: payload.email,
        organizationId: payload.orgId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
