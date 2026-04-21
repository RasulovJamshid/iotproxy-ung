import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { Site } from '../sites/site.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ name: 'slug', unique: true })
  slug!: string;

  @Column({ name: 'rate_limit_rpm', default: 10000 })
  rateLimitRpm!: number;

  @Column({ name: 'raw_retention_days', nullable: true, type: 'int' })
  rawRetentionDays?: number;

  @Column({ name: 'default_raw_retention_days', nullable: true, type: 'int', default: 7 })
  defaultRawRetentionDays?: number;

  @Column({ name: 'default_summary_retention_months', nullable: true, type: 'int', default: 6 })
  defaultSummaryRetentionMonths?: number;

  @Column({ name: 'default_summary_agg_mode', nullable: true, type: 'varchar', length: 10, default: 'AVG' })
  defaultSummaryAggMode?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => Site, (s) => s.organization)
  sites!: Site[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
