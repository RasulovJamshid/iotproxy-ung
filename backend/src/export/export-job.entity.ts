import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('export_jobs')
export class ExportJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'site_id' })
  siteId!: string;

  @Column({ name: 'start_ts', type: 'timestamptz' })
  startTs!: Date;

  @Column({ name: 'end_ts', type: 'timestamptz' })
  endTs!: Date;

  @Column({ default: 'csv' })
  format!: string;        // csv | parquet

  @Column({ type: 'simple-array', nullable: true })
  fields?: string[];

  @Column({ default: 'PENDING' })
  status!: string;        // PENDING | RUNNING | COMPLETED | FAILED

  @Column({ type: 'int', default: 0 })
  progress!: number;      // 0-100

  @Column({ name: 'estimated_readings', type: 'int', nullable: true })
  estimatedReadings?: number;

  @Column({ name: 'download_url', nullable: true })
  downloadUrl?: string;

  @Column({ name: 'error_message', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
