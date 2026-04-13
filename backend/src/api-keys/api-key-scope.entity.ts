import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('api_key_scopes')
export class ApiKeyScope {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'api_key_id' })
  apiKeyId!: string;

  @Column({ name: 'org_id' })
  orgId!: string;

  @Column({ name: 'site_id', nullable: true, type: 'uuid' })
  siteId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
