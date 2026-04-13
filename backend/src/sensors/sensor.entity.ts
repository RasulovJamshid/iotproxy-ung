import {
  Entity, PrimaryGeneratedColumn, Column, Unique,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Site } from '../sites/site.entity';
import { SensorConfig } from './sensor-config.entity';

@Entity('sensors')
@Unique('UQ_sensors_site_external_id', ['siteId', 'externalId'])
export class Sensor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'site_id' })
  siteId!: string;

  @ManyToOne(() => Site, (s) => s.sensors)
  @JoinColumn({ name: 'site_id' })
  site!: Site;

  @Column()
  name!: string;

  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 'MAINTENANCE' })
  status!: string;   // ACTIVE | DISABLED | MAINTENANCE | CALIBRATING

  @Column({ name: 'connectivity_status', default: 'UNKNOWN' })
  connectivityStatus!: string;

  @Column({ name: 'last_reading_at', nullable: true, type: 'timestamptz' })
  lastReadingAt?: Date;

  @Column({ name: 'reporting_interval_seconds', nullable: true, type: 'int' })
  reportingIntervalSeconds?: number;

  @Column({ name: 'max_records_per_sensor', nullable: true, type: 'int', default: 10 })
  maxRecordsPerSensor?: number | null;

  @OneToMany(() => SensorConfig, (c) => c.sensor)
  configs!: SensorConfig[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
