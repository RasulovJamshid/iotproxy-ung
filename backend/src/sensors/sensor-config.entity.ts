import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Sensor } from './sensor.entity';
import { SensorConfigVersion } from './sensor-config-version.entity';
import { SensorConfigSnapshot } from '@iotproxy/shared';

@Entity('sensor_configs')
export class SensorConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sensor_id' })
  sensorId!: string;

  @ManyToOne(() => Sensor, (s) => s.configs)
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  alias?: string;

  @Column({ nullable: true })
  unit?: string;

  @Column({ name: 'scale_multiplier', type: 'float', default: 1.0 })
  scaleMultiplier!: number;

  @Column({ name: 'scale_offset', type: 'float', default: 0.0 })
  scaleOffset!: number;

  @Column({ name: 'expected_min', type: 'float', nullable: true })
  expectedMin?: number;

  @Column({ name: 'expected_max', type: 'float', nullable: true })
  expectedMax?: number;

  @Column({ name: 'reject_out_of_range', default: false })
  rejectOutOfRange!: boolean;

  @Column({ name: 'field_mappings', type: 'jsonb', default: '{}' })
  fieldMappings!: Record<string, string>;

  @OneToMany(() => SensorConfigVersion, (v) => v.config)
  versions!: SensorConfigVersion[];

  // Populated via eager loading or explicit join
  latestVersion?: SensorConfigVersion;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  toSnapshot(): SensorConfigSnapshot {
    return {
      id: this.id,
      version: this.latestVersion?.version ?? 1,
      alias: this.alias,
      unit: this.unit,
      scaleMultiplier: this.scaleMultiplier,
      scaleOffset: this.scaleOffset,
      expectedMin: this.expectedMin ?? null,
      expectedMax: this.expectedMax ?? null,
      rejectOutOfRange: this.rejectOutOfRange,
      fieldMappings: this.fieldMappings,
    };
  }
}
