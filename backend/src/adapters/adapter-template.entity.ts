import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InboundMapping, ResponseMapping, PullAuthType, PullAuthConfig } from './site-adapter.entity';

/**
 * An AdapterTemplate captures the "mapping / request shape" portion of a
 * SiteAdapter so it can be reused across multiple sites that expose the same
 * API format.  Credentials (auth values) are intentionally excluded from
 * templates — they must always be entered per-site.
 */
@Entity('adapter_templates')
export class AdapterTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'name' })
  name!: string;

  @Column({ name: 'description', nullable: true })
  description?: string;

  // ── Inbound ───────────────────────────────────────────────────────────────

  @Column({ name: 'inbound_mapping', type: 'jsonb', nullable: true })
  inboundMapping?: InboundMapping;

  // ── Pull ──────────────────────────────────────────────────────────────────

  @Column({ name: 'pull_method', default: 'GET' })
  pullMethod!: string;

  @Column({ name: 'pull_headers', type: 'jsonb', nullable: true })
  pullHeaders?: Record<string, string>;

  @Column({ name: 'pull_query_params', type: 'jsonb', nullable: true })
  pullQueryParams?: Record<string, string>;

  /** Auth type hint — value/credentials are intentionally not stored */
  @Column({ name: 'pull_auth_type', default: 'none' })
  pullAuthType!: PullAuthType;

  /** Header name only (for apiKey type); actual secret is NOT stored */
  @Column({ name: 'pull_auth_config', type: 'jsonb', nullable: true })
  pullAuthConfig?: Pick<PullAuthConfig, 'headerName'>;

  @Column({ name: 'pull_body_template', type: 'jsonb', nullable: true })
  pullBodyTemplate?: Record<string, unknown>;

  @Column({ name: 'pull_interval_sec', default: 300 })
  pullIntervalSec!: number;

  @Column({ name: 'response_mapping', type: 'jsonb', nullable: true })
  responseMapping?: ResponseMapping;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
