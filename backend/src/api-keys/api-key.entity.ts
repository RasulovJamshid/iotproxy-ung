import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'site_id', nullable: true, type: 'uuid' })
  siteId?: string;

  @Column({ name: 'name' })
  name!: string;

  // First 12 chars of the raw key — used as lookup prefix and display value
  @Column({ name: 'prefix', length: 16 })
  @Index()
  prefix!: string;

  // bcrypt hash of the full key — never stored in plaintext
  @Column({ name: 'key_hash' })
  keyHash!: string;

  @Column({ name: 'permissions', type: 'simple-array', default: 'ingest' })
  permissions!: string[];

  @Column({ name: 'websocket_enabled', default: true })
  websocketEnabled!: boolean;

  @Column({ name: 'expires_at', nullable: true, type: 'timestamptz' })
  expiresAt?: Date;

  @Column({ name: 'revoked_at', nullable: true, type: 'timestamptz' })
  revokedAt?: Date;

  @Column({ name: 'last_used_at', nullable: true, type: 'timestamptz' })
  lastUsedAt?: Date;

  @Column({ name: 'expiry_warning_sent_at', nullable: true, type: 'timestamptz' })
  expiryWarningSentAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  get isActive(): boolean {
    if (this.revokedAt) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
  }
}
