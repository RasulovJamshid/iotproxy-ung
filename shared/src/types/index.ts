// ── Enums ────────────────────────────────────────────────────────────────────

export type ReadingQuality = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'MAINTENANCE';

export type SensorStatus =
  | 'ACTIVE'
  | 'DISABLED'
  | 'MAINTENANCE'
  | 'CALIBRATING';

export type SensorType =
  | 'TEMPERATURE'
  | 'HUMIDITY'
  | 'PRESSURE'
  | 'FLOW'
  | 'LEVEL'
  | 'VOLTAGE'
  | 'CURRENT'
  | 'POWER'
  | 'ENERGY'
  | 'VIBRATION'
  | 'ACCELERATION'
  | 'VELOCITY'
  | 'POSITION'
  | 'PROXIMITY'
  | 'MOTION'
  | 'LIGHT'
  | 'SOUND'
  | 'GAS'
  | 'PH'
  | 'CONDUCTIVITY'
  | 'TURBIDITY'
  | 'DISSOLVED_OXYGEN'
  | 'COUNTER'
  | 'BINARY'
  | 'OTHER';

export type SensorCategory =
  | 'ENVIRONMENTAL'
  | 'INDUSTRIAL'
  | 'ENERGY'
  | 'WATER_QUALITY'
  | 'HVAC'
  | 'SAFETY'
  | 'SECURITY'
  | 'MANUFACTURING'
  | 'AGRICULTURE'
  | 'BUILDING_AUTOMATION'
  | 'TRANSPORTATION'
  | 'HEALTHCARE'
  | 'OTHER';

export type CommissioningStatus =
  | 'DISCOVERY'
  | 'REVIEW'
  | 'ACTIVE'
  | 'SUSPENDED';

export type ConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertOperator = 'GT' | 'LT' | 'GTE' | 'LTE' | 'EQ' | 'NEQ';

export type AlertState = 'INACTIVE' | 'FIRING' | 'RESOLVED';

export type ExportFormat = 'csv' | 'parquet';

export type ExportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type UserRole = 'SYSTEM_ADMIN' | 'ADMIN' | 'USER' | 'VIEWER';

// ── Core reading types ───────────────────────────────────────────────────────

export interface RawIngestPayload {
  sensorId: string;
  phenomenonTime: string;        // ISO-8601
  data: Record<string, unknown>; // arbitrary sensor fields
}

export interface ProcessedReading {
  sensorId: string;
  organizationId: string;
  siteId: string;
  phenomenonTime: string;
  receivedAt: string;
  rawData: Record<string, unknown>;
  processedData: Record<string, unknown>;
  qualityCode: ReadingQuality;
  pipelineFlags: string[];
  configVersionId: string | null;
  correlationId: string;
  derivedReadings?: ProcessedReading[];
}

// ── Ingest job (what goes into BullMQ) ──────────────────────────────────────

export interface IngestJob extends RawIngestPayload {
  organizationId: string;
  siteId: string;
  receivedAt: string;
  correlationId: string;
  batchId: string;
  source: 'http' | 'mqtt' | 'pull';
}

// ── Site Adapters ────────────────────────────────────────────────────────────

export interface FieldMapping {
  sensorId:           string;
  phenomenonTime:     string;
  data:               string | Record<string, string>;
  discriminatorField?:  string;
  discriminatorSuffix?: string;
}

export interface InboundMapping {
  readingsPath?: string;
  fields:        FieldMapping;
  /**
   * JSONata expression mode.
   * When set, the entire payload is passed as the expression input.
   * The expression must return an array (or single object) with shape:
   *   { sensorId, phenomenonTime, data: Record<string,unknown> }
   * The `readingsPath` and `fields` config is ignored in this mode.
   * Available binding: $siteId (the site's internal UUID).
   */
  jsonataExpression?: string;
}

export interface ResponseMapping {
  mode: 'single-site' | 'multi-site';
  siteId?: string;
  sitesPath?:      string;
  siteIdPath?:     string;
  siteIdResolver?: 'by-id' | 'by-name';
  readingsPath: string;
  fields:       FieldMapping;
  /**
   * JSONata expression mode.
   * When set, the entire API response is passed as the expression input.
   * The expression must return an array (or single object) with shape:
   *   { sensorId, phenomenonTime, data: Record<string,unknown>, siteId?: string }
   * For single-site mode, siteId is auto-injected if absent.
   * For multi-site mode, include siteId in each result object.
   * The JSONPath fields config is ignored in this mode.
   */
  jsonataExpression?: string;
}

export type PullAuthType = 'none' | 'apiKey' | 'bearerToken' | 'basicAuth';

export interface PullAuthConfig {
  headerName?: string;
  value?:      string;
  username?:   string;
  password?:   string;
}

export interface SiteAdapter {
  id: string;
  siteId: string;
  organizationId: string;
  inboundEnabled: boolean;
  inboundMapping?: InboundMapping;
  pullEnabled: boolean;
  pullUrl?: string;
  pullMethod: string;
  pullHeaders?: Record<string, string>;
  pullQueryParams?: Record<string, string>;
  pullAuthType: PullAuthType;
  pullAuthConfig?: PullAuthConfig;
  pullBodyTemplate?: Record<string, unknown>;
  pullIntervalSec: number;
  responseMapping?: ResponseMapping;
  pullLastAt?: string;
  pullLastStatusCode?: number;
  pullLastError?: string;
  createdAt: string;
  updatedAt: string;
}

/** Reusable adapter mapping/request template (credentials excluded) */
export interface AdapterTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  inboundMapping?: InboundMapping;
  pullMethod: string;
  pullHeaders?: Record<string, string>;
  pullQueryParams?: Record<string, string>;
  pullAuthType: PullAuthType;
  /** Only the header name hint is stored; actual secret is never saved in a template */
  pullAuthConfig?: Pick<PullAuthConfig, 'headerName'>;
  pullBodyTemplate?: Record<string, unknown>;
  pullIntervalSec: number;
  responseMapping?: ResponseMapping;
  createdAt: string;
  updatedAt: string;
}

// ── WebSocket events ─────────────────────────────────────────────────────────

export interface WsReadingEvent {
  type: 'reading';
  siteId: string;
  sensorId: string;
  phenomenonTime: string;
  processedData: Record<string, unknown>;
  qualityCode: ReadingQuality;
}

export interface WsAlertEvent {
  type: 'alert';
  alertRuleId: string;
  sensorId: string;
  siteId: string;
  state: AlertState;
  severity: AlertSeverity;
  triggeredAt: string;
}

// ── API response wrappers ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  cursor?: string;
}

export interface BatchAcceptedResponse {
  accepted: number;
  batchId: string;
  correlationId?: string;
}

// ── Sensor config ────────────────────────────────────────────────────────────

export interface SensorConfigSnapshot {
  id: string;
  version: number;
  alias?: string;
  unit?: string;
  scaleMultiplier: number;
  scaleOffset: number;
  expectedMin: number | null;
  expectedMax: number | null;
  rejectOutOfRange: boolean;
  fieldMappings: Record<string, string>;
}
