import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('alert_events')
export class AlertEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'alert_rule_id' })
  alertRuleId!: string;

  @Column({ name: 'sensor_id' })
  sensorId!: string;

  @Column({ name: 'site_id' })
  siteId!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column()
  state!: string;       // FIRING | RESOLVED

  @Column({ type: 'float' })
  value!: number;

  @Column({ type: 'float' })
  threshold!: number;

  @Column()
  severity!: string;

  @Column({ name: 'correlation_id', nullable: true })
  correlationId?: string;

  @Column({ name: 'notification_sent_at', nullable: true, type: 'timestamptz' })
  notificationSentAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
