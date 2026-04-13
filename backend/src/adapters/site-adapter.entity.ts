import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { Site } from '../sites/site.entity';

// ── Mapping type definitions ──────────────────────────────────────────────────

export interface FieldMapping {
  sensorId:          string;  // JSONPath within each reading item
  /** Optional: combine sensorId field with a discriminator field to create unique sensor IDs.
   *  E.g. if each row has a "product_type" field, set discriminatorField to "$.Классификатор"
   *  and the resulting sensorId becomes "<sensorId_value>:<discriminator_value>"
   */
  discriminatorField?: string; // JSONPath to the field that differentiates sensor types within an item
  discriminatorSuffix?: string; // static suffix to add instead of a dynamic field (mutually exclusive with discriminatorField)
  phenomenonTime:    string;
  data:              string | Record<string, string>; // single path OR { field: path }
}

export interface InboundMapping {
  readingsPath?: string; // optional: path to readings array in pushed payload
  fields:        FieldMapping;
}

export interface ResponseMapping {
  mode: 'single-site' | 'multi-site';

  // single-site: all readings belong to this site
  siteId?: string;

  // multi-site: response contains data for multiple sites
  sitesPath?:      string; // path to array of site blocks
  siteIdPath?:     string; // path within each site block to extract site identifier
  siteIdResolver?: 'by-id' | 'by-name'; // 'by-id' = value IS uuid; 'by-name' = look up by site name

  readingsPath: string; // path to readings array (absolute for single-site, relative to site block for multi-site)
  fields:       FieldMapping;
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
