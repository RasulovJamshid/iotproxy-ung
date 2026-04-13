import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'actor_id', nullable: true })
  actorId?: string;

  @Column({ name: 'actor_email', nullable: true })
  actorEmail?: string;

  @Column()
  action!: string;         // e.g. 'sensor.config.updated', 'api_key.revoked'

  @Column({ name: 'resource_type' })
  resourceType!: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Column({ type: 'jsonb', nullable: true })
  diff?: Record<string, unknown>;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
