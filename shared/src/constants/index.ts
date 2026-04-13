export const ERROR_CODES = {
  SENSOR_DISABLED:             'SENSOR_DISABLED',
  SITE_NOT_IN_DISCOVERY:       'SITE_NOT_IN_DISCOVERY',
  PAYLOAD_TOO_LARGE:           'PAYLOAD_TOO_LARGE',
  TIMESTAMP_OUT_OF_BOUNDS:     'TIMESTAMP_OUT_OF_BOUNDS',
  RATE_LIMIT_EXCEEDED:         'RATE_LIMIT_EXCEEDED',
  DUPLICATE_READING:           'DUPLICATE_READING',
  FORMULA_CIRCULAR_DEPENDENCY: 'FORMULA_CIRCULAR_DEPENDENCY',
  CONFIG_VERSION_CONFLICT:     'CONFIG_VERSION_CONFLICT',
  UNAUTHORIZED:                'UNAUTHORIZED',
  FORBIDDEN:                   'FORBIDDEN',
  NOT_FOUND:                   'NOT_FOUND',
  VALIDATION_ERROR:            'VALIDATION_ERROR',
  INTERNAL_ERROR:              'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const QUEUE_NAMES = {
  READINGS:      'readings',
  WEBHOOKS:      'webhooks',
  NOTIFICATIONS: 'notifications',
  EXPORTS:       'exports',
  PULL:          'pull',
} as const;

export const WEBHOOK_EVENTS = {
  READING_PROCESSED:    'reading.processed',
  ALERT_FIRED:          'alert.fired',
  ALERT_RESOLVED:       'alert.resolved',
  SENSOR_OFFLINE:       'sensor.offline',
  SENSOR_ONLINE:        'sensor.online',
  SITE_OFFLINE:         'site.offline',
  EXPORT_READY:         'export.ready',
  API_KEY_EXPIRED:      'api_key.expired',
  API_KEY_EXPIRING_SOON:'api_key.expiring_soon',
} as const;

export const PERMISSIONS = {
  INGEST:         'ingest',
  QUERY:          'query',
  MANAGE_SENSORS: 'manage:sensors',
  MANAGE_SITES:   'manage:sites',
  MANAGE_KEYS:    'manage:keys',
  MANAGE_ALERTS:  'manage:alerts',
  EXPORT:         'export',
  ADMIN:          'admin',
} as const;

export const PIPELINE_FLAGS = {
  INVALID_TIMESTAMP:  'invalid_timestamp',
  FUTURE_TIMESTAMP:   'future_timestamp',
  STALE_TIMESTAMP:    'stale_timestamp',
  OUT_OF_RANGE:       'out_of_range',
  UNIT_CONVERTED:     'unit_converted',
  CLAMPED:            'clamped',
  ALIASED:            'aliased',
  DERIVED:            'derived',
} as const;
