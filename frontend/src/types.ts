export interface Organization {
  id: string;
  name: string;
  slug: string;
  rateLimitRpm: number;
  rawRetentionDays?: number;
  isActive: boolean;
  createdAt: string;
}

export interface OrgUser {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface Site {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  commissioningStatus: string;
  connectivityStatus: string;
  lastSeenAt?: string;
  discoveryWindowEndsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sensor {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  externalId?: string;
  description?: string;
  status: string;
  connectivityStatus: string;
  lastReadingAt?: string;
  reportingIntervalSeconds?: number;
  maxRecordsPerSensor?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  organizationId: string;
  siteId?: string;
  sensorId?: string;
  field: string;
  operator: string;
  threshold: number;
  windowSeconds: number;
  severity: string;
  cooldownSeconds: number;
  notificationChannels: Array<{ type: string; target: string }>;
  isActive: boolean;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  alertRuleId: string;
  sensorId: string;
  siteId: string;
  state: string;
  value: number;
  threshold: number;
  severity: string;
  createdAt: string;
}

export interface ApiKeyScope {
  orgId: string;
  siteId?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  websocketEnabled?: boolean;
  /** GLOBAL | ORGS | SITES — defaults to SITES for legacy keys */
  scopeType?: string;
  /** Populated for ORGS/SITES keys */
  scopes?: ApiKeyScope[];
  /** Legacy single-site */
  siteId?: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  key?: string; // only on creation
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  siteId: string;
  startTs: string;
  endTs: string;
  format: string;
  fields?: string[];
  status: string;
  progress: number;
  downloadUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface Reading {
  bucket: string;
  avg_val: number;
  min_val: number;
  max_val: number;
}
