import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { Sensor } from '../sensors/sensor.entity';

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

  @OneToMany(() => Sensor, (s) => s.site)
  sensors!: Sensor[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
