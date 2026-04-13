import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { SensorConfig } from './sensor-config.entity';

@Entity('sensor_config_versions')
export class SensorConfigVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'config_id' })
  configId!: string;

  @ManyToOne(() => SensorConfig, (c) => c.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'config_id' })
  config!: SensorConfig;

  @Column({ type: 'int' })
  version!: number;

  // Immutable snapshot of the config at this version
  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ name: 'changed_by', nullable: true })
  changedBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
