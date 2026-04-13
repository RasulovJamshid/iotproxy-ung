import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('alert_rules')
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'site_id', nullable: true })
  siteId?: string;

  @Column({ name: 'sensor_id', nullable: true })
  sensorId?: string;

  @Column()
  field!: string;        // key in processedData to evaluate

  @Column()
  operator!: string;     // GT | LT | GTE | LTE | EQ | NEQ

  @Column({ type: 'float' })
  threshold!: number;

  @Column({ name: 'window_seconds', type: 'int', default: 0 })
  windowSeconds!: number;

  @Column({ default: 'WARNING' })
  severity!: string;     // INFO | WARNING | CRITICAL

  @Column({ name: 'cooldown_seconds', type: 'int', default: 300 })
  cooldownSeconds!: number;

  @Column({ name: 'notification_channels', type: 'jsonb', default: '[]' })
  notificationChannels!: Array<{
    type: 'email' | 'webhook' | 'slack';
    target: string;
  }>;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
