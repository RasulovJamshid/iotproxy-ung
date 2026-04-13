import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiKeyService } from './api-key.service';
import { WebhookService } from '../webhooks/webhook.service';
import { WEBHOOK_EVENTS } from '@iotproxy/shared';

@Injectable()
export class KeyExpiryCron {
  private readonly logger = new Logger(KeyExpiryCron.name);

  constructor(
    private apiKeys: ApiKeyService,
    private webhooks: WebhookService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async enforceExpiry() {
    // Mark expired keys as revoked and fire webhook
    const expired = await this.apiKeys.findExpired();
    if (expired.length > 0) {
      await this.apiKeys.markExpired(expired);
      for (const key of expired) {
        await this.webhooks.dispatch(key.organizationId, WEBHOOK_EVENTS.API_KEY_EXPIRED, {
          keyId: key.id,
          prefix: key.prefix,
        });
      }
      this.logger.log(`Revoked ${expired.length} expired API key(s)`);
    }

    // Warn about keys expiring within 7 days
    const expiringSoon = await this.apiKeys.findExpiringSoon();
    for (const key of expiringSoon) {
      await this.webhooks.dispatch(key.organizationId, WEBHOOK_EVENTS.API_KEY_EXPIRING_SOON, {
        keyId: key.id,
        prefix: key.prefix,
        expiresAt: key.expiresAt,
      });
      await this.apiKeys.markWarningSent(key.id);
    }
    if (expiringSoon.length > 0) {
      this.logger.log(`Sent expiry warnings for ${expiringSoon.length} API key(s)`);
    }
  }
}
