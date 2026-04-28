import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('backups')
export class Backup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'backup_type', default: 'FULL' })
  backupType!: string; // FULL | INCREMENTAL

  @Column({ default: 'PENDING' })
  status!: string; // PENDING | IN_PROGRESS | COMPLETED | FAILED

  @Column({ name: 'file_path', nullable: true })
  filePath?: string; // S3/MinIO path

  @Column({ name: 'file_size_bytes', nullable: true, type: 'bigint' })
  fileSizeBytes?: number;

  @Column({ name: 'tables_included', type: 'jsonb', default: '[]' })
  tablesIncluded!: string[]; // ['sensor_readings', 'daily_summaries', ...]

  @Column({ name: 'error_message', nullable: true, type: 'text' })
  errorMessage?: string;

  @Column({ name: 'started_at', nullable: true, type: 'timestamptz' })
  startedAt?: Date;

  @Column({ name: 'completed_at', nullable: true, type: 'timestamptz' })
  completedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
