import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('virtual_sensors')
export class VirtualSensor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'site_id' })
  siteId!: string;

  @Column({ name: 'source_sensor_id' })
  sourceSensorId!: string;

  @Column()
  name!: string;

  // mathjs expression; scope is the processedData fields of the source reading
  @Column()
  formula!: string;

  @Column({ nullable: true })
  unit?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
