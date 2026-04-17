import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { Site } from '../sites/site.entity';

// ── Mapping type definitions ──────────────────────────────────────────────────

export interface FieldMapping {
  sensorId:           string;  // JSONPath within each reading item
  /** Optional: combine sensorId field with a discriminator field to create unique sensor IDs. */
  discriminatorField?:  string;
  discriminatorSuffix?: string;
  phenomenonTime:     string;
  data:               string | Record<string, string>;
}

export interface InboundMapping {
  readingsPath?: string;
  fields:        FieldMapping;
  /**
   * JSONata expression mode.
   * When set, the entire payload is the expression input.
   * Must return: { sensorId, phenomenonTime, data }[]
   * Binding available: $siteId
   * Ignores readingsPath and fields when set.
   */
  jsonataExpression?: string;
}

export interface ResponseMapping {
  mode: 'single-site' | 'multi-site';
  siteId?: string;
  sitesPath?:      string;
  siteIdPath?:     string;
  siteIdResolver?: 'by-id' | 'by-name';
  readingsPath: string;
  fields:       FieldMapping;
  /**
   * JSONata expression mode.
   * When set, the entire API response is the expression input.
   * Must return: { sensorId, phenomenonTime, data, siteId? }[]
   * For single-site, siteId is auto-injected if absent from each result.
   * Ignores JSONPath fields when set.
   */
  jsonataExpression?: string;
}

export type PullAuthType = 'none' | 'apiKey' | 'bearerToken' | 'basicAuth';

export interface PullAuthConfig {
  headerName?: string; // apiKey: which header to set
  value?:      string; // apiKey / bearerToken value
  username?:   string; // basicAuth
  password?:   string; // basicAuth
}

// ── Entity ────────────────────────────────────────────────────────────────────

@Entity('site_adapters')
export class SiteAdapter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'site_id', unique: true })
  siteId!: string;

  @OneToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site!: Site;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  // ── Inbound (push normalization) ──────────────────────────────────────────

  @Column({ name: 'inbound_enabled', default: false })
  inboundEnabled!: boolean;

  @Column({ name: 'inbound_mapping', type: 'jsonb', nullable: true })
  inboundMapping?: InboundMapping;

  // ── Pull (outbound) ───────────────────────────────────────────────────────

  @Column({ name: 'pull_enabled', default: false })
  pullEnabled!: boolean;

  @Column({ name: 'pull_url', nullable: true })
  pullUrl?: string;

  @Column({ name: 'pull_method', default: 'GET' })
  pullMethod!: string; // GET | POST

  @Column({ name: 'pull_headers', type: 'jsonb', nullable: true })
  pullHeaders?: Record<string, string>;

  @Column({ name: 'pull_query_params', type: 'jsonb', nullable: true })
  pullQueryParams?: Record<string, string>;

  @Column({ name: 'pull_auth_type', default: 'none' })
  pullAuthType!: PullAuthType;

  @Column({ name: 'pull_auth_config', type: 'jsonb', nullable: true })
  pullAuthConfig?: PullAuthConfig;

  @Column({ name: 'pull_body_template', type: 'jsonb', nullable: true })
  pullBodyTemplate?: Record<string, unknown>;

  @Column({ name: 'pull_interval_sec', default: 60 })
  pullIntervalSec!: number;

  @Column({ name: 'response_mapping', type: 'jsonb', nullable: true })
  responseMapping?: ResponseMapping;

  // ── Pull state ────────────────────────────────────────────────────────────

  @Column({ name: 'pull_last_at', type: 'timestamptz', nullable: true })
  pullLastAt?: Date;

  @Column({ name: 'pull_last_status_code', type: 'int', nullable: true })
  pullLastStatusCode?: number;

  @Column({ name: 'pull_last_error', nullable: true })
  pullLastError?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
