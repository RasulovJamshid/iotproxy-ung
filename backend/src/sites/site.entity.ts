import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { Sensor } from '../sensors/sensor.entity';
import { SiteGroup } from '../site-groups/site-group.entity';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, (o) => o.sites)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'commissioning_status', default: 'DISCOVERY' })
  commissioningStatus!: string;   // DISCOVERY | REVIEW | ACTIVE | SUSPENDED

  @Column({ name: 'discovery_window_ends_at', nullable: true, type: 'timestamptz' })
  discoveryWindowEndsAt?: Date;

  @Column({ name: 'discovery_enabled', default: false })
  discoveryEnabled!: boolean;

  @Column({ name: 'connectivity_status', default: 'UNKNOWN' })
  connectivityStatus!: string;   // ONLINE | OFFLINE | UNKNOWN

  @Column({ name: 'last_seen_at', nullable: true, type: 'timestamptz' })
  lastSeenAt?: Date;

  @Column({ name: 'timescale_chunk_interval', default: '7 days' })
  timescaleChunkInterval!: string;

  @Column({ name: 'group_id', nullable: true })
  groupId?: string;

  @ManyToOne(() => SiteGroup, (g) => g.sites, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group?: SiteGroup;

  // Geolocation
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: number;

  @Column({ nullable: true })
  timezone?: string; // IANA timezone (e.g., 'America/New_York')

  // Site classification
  @Column({ name: 'site_type', nullable: true })
  siteType?: string; // FACTORY | WAREHOUSE | OFFICE | OUTDOOR | MOBILE | RESIDENTIAL | OTHER

  // Flexible metadata
  @Column({ type: 'jsonb', nullable: true })
  tags?: string[]; // Array of custom tags for filtering/grouping

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>; // Arbitrary key-value pairs

  @Column({ name: 'custom_fields', type: 'jsonb', nullable: true })
  customFields?: Record<string, unknown>; // Customer-specific fields

  // Data retention defaults (sensor → site → org fallback chain)
  @Column({ name: 'default_raw_retention_days', nullable: true, type: 'int' })
  defaultRawRetentionDays?: number;

  @Column({ name: 'default_summary_retention_months', nullable: true, type: 'int' })
  defaultSummaryRetentionMonths?: number;

  @Column({ name: 'default_summary_agg_mode', nullable: true, type: 'varchar', length: 10 })
  defaultSummaryAggMode?: string;

  @OneToMany(() => Sensor, (s) => s.site)
  sensors!: Sensor[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
