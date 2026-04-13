import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('user_organizations')
export class UserOrganization {
  @PrimaryColumn({ name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ name: 'organization_id' })
  organizationId!: string;

  // Per-org role: VIEWER | USER | ADMIN
  // SYSTEM_ADMIN is a global role stored on the User entity, not here
  @Column({ default: 'USER' })
  role!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
