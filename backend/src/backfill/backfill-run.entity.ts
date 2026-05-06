import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { BackfillTimeParams } from '@iotproxy/shared';

@Entity('backfill_runs')
export class BackfillRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'adapter_id' })
  adapterId!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'range_start', type: 'timestamptz' })
  rangeStart!: Date;

  @Column({ name: 'range_end', type: 'timestamptz' })
  rangeEnd!: Date;

  /** 'hour' | 'day' | 'week' | 'month' | 'custom' */
  @Column({ name: 'chunk_size', default: 'day' })
  chunkSize!: string;

  /** Window size in seconds when chunkSize = 'custom' */
  @Column({ name: 'chunk_size_sec', type: 'int', nullable: true })
  chunkSizeSec?: number;

  /** 'window-start' | 'window-mid' | 'window-end' | 'sequence' | 'from-response' */
  @Column({ name: 'timestamp_strategy', default: 'sequence' })
  timestampStrategy!: string;

  /** 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' */
  @Column({ default: 'PENDING' })
  status!: string;

  @Column({ name: 'total_chunks', type: 'int', default: 0 })
  totalChunks!: number;

  @Column({ name: 'completed_chunks', type: 'int', default: 0 })
  completedChunks!: number;

  @Column({ name: 'failed_chunks', type: 'int', default: 0 })
  failedChunks!: number;

  @Column({ name: 'total_readings', type: 'int', default: 0 })
  totalReadings!: number;

  /**
   * How to inject the window start/end into the API request.
   * Takes priority over the adapter's pullTimeParams so adapters that work
   * without date params for regular polling can still be backfilled correctly.
   * When null the worker falls back to adapter.pullTimeParams (if enabled).
   */
  @Column({ name: 'time_params', type: 'jsonb', nullable: true })
  timeParams?: BackfillTimeParams;

  /** Milliseconds to wait between successive chunk jobs (rate limiting) */
  @Column({ name: 'delay_between_chunks_ms', type: 'int', default: 0 })
  delayBetweenChunksMs!: number;

  @Column({ name: 'error_message', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
