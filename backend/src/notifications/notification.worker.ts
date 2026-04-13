import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, AlertSeverity } from '@iotproxy/shared';

export interface NotificationJob {
  type: 'email' | 'webhook_alert';
  organizationId: string;
  alertRuleId: string;
  sensorId: string;
  siteId: string;
  severity: AlertSeverity;
  state: 'FIRING' | 'RESOLVED';
  value: number;
  threshold: number;
  field: string;
  operator: string;
  alertEventId: string;
  // email-specific
  to?: string;
}

@Processor(QUEUE_NAMES.NOTIFICATIONS)
@Injectable()
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    super();
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('smtp.host'),
      port: config.get<number>('smtp.port'),
      auth: {
        user: config.get<string>('smtp.user'),
        pass: config.get<string>('smtp.pass'),
      },
    });
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const { type } = job.data;

    switch (type) {
      case 'email':
        await this.sendEmail(job.data);
        break;
      default:
        this.logger.warn(`Unknown notification type: ${type}`);
    }
  }

  private async sendEmail(data: NotificationJob): Promise<void> {
    if (!data.to) return;

    const emoji = data.severity === 'CRITICAL' ? '🔴' : data.severity === 'WARNING' ? '🟡' : '🔵';
    const stateLabel = data.state === 'FIRING' ? 'ALERT FIRED' : 'ALERT RESOLVED';

    await this.transporter.sendMail({
      from: this.config.get<string>('smtp.user'),
      to: data.to,
      subject: `${emoji} [${data.severity}] ${stateLabel} — Sensor ${data.sensorId}`,
      html: `
        <h2>${emoji} ${stateLabel}</h2>
        <table cellpadding="6">
          <tr><td><b>Severity</b></td><td>${data.severity}</td></tr>
          <tr><td><b>Sensor</b></td><td>${data.sensorId}</td></tr>
          <tr><td><b>Site</b></td><td>${data.siteId}</td></tr>
          <tr><td><b>Field</b></td><td>${data.field}</td></tr>
          <tr><td><b>Condition</b></td><td>${data.field} ${data.operator} ${data.threshold}</td></tr>
          <tr><td><b>Current value</b></td><td>${data.value}</td></tr>
          <tr><td><b>Time</b></td><td>${new Date().toISOString()}</td></tr>
        </table>
        <p style="color:#888;font-size:12px">Alert rule: ${data.alertRuleId}</p>
      `,
    });

    this.logger.log(`Alert email sent to ${data.to} for sensor ${data.sensorId} [${data.state}]`);
  }
}
