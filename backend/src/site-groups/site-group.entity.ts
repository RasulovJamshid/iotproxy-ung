import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { Site } from '../sites/site.entity';

@Entity('site_groups')
export class SiteGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  /** Hex color used for UI badges, e.g. "#3b82f6" */
  @Column({ nullable: true })
  color?: string;

  @OneToMany(() => Site, (s) => s.group)
  sites!: Site[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
