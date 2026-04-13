import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * Tracks Welford running statistics for each field observed during discovery.
 * One row per (site, fieldKey). Updated on every incoming reading.
 */
@Entity('field_profiles')
@Index(['siteId', 'fieldKey'], { unique: true })
export class FieldProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'site_id' })
  siteId!: string;

  @Column({ name: 'field_key' })
  fieldKey!: string;

  // Welford algorithm state
  @Column({ name: 'sample_count', type: 'int', default: 0 })
  sampleCount!: number;

  @Column({ name: 'mean', type: 'float', default: 0 })
  mean!: number;

  @Column({ name: 'm2', type: 'float', default: 0 })
  m2!: number;    // sum of squared deviations — variance = m2 / (n-1)

  @Column({ name: 'min_val', type: 'float', nullable: true })
  minVal?: number;

  @Column({ name: 'max_val', type: 'float', nullable: true })
  maxVal?: number;

  // Suggested config derived from profile
  @Column({ name: 'suggested_unit', nullable: true })
  suggestedUnit?: string;

  @Column({ name: 'sample_types', type: 'jsonb', default: '{}' })
  sampleTypes!: Record<string, number>;   // { number: 42, string: 3 }

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  get variance(): number {
    return this.sampleCount < 2 ? 0 : this.m2 / (this.sampleCount - 1);
  }

  get stdDev(): number {
    return Math.sqrt(this.variance);
  }
}
