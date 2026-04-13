import * as Joi from 'joi';

export const validationSchema = Joi.object({
  DATABASE_URL:               Joi.string().required(),
  REDIS_BULL_URL:             Joi.string().required(),
  REDIS_CACHE_URL:            Joi.string().required(),
  MQTT_BROKER_URL:            Joi.string().required(),
  JWT_SECRET:                 Joi.string().min(32).required(),
  JWT_REFRESH_SECRET:         Joi.string().min(32).required(),
  MINIO_ENDPOINT:             Joi.string().required(),
  MINIO_ACCESS_KEY:           Joi.string().required(),
  MINIO_SECRET_KEY:           Joi.string().required(),
  MINIO_BUCKET:               Joi.string().default('iotproxy-exports'),
  SMTP_HOST:                  Joi.string().required(),
  SMTP_PORT:                  Joi.number().default(587),
  SMTP_USER:                  Joi.string().required(),
  SMTP_PASS:                  Joi.string().required(),
  APP_BASE_URL:               Joi.string().uri().required(),
  RATE_LIMIT_DEFAULT_RPM:     Joi.number().default(10000),
  DISCOVERY_WINDOW_HOURS:     Joi.number().default(24),
  CLOCK_SKEW_FUTURE_HOURS:    Joi.number().default(24),
  CLOCK_SKEW_PAST_DAYS:       Joi.number().default(30),
  NODE_ENV:                   Joi.string().valid('development', 'production', 'test').default('development'),
  POD_NAME:                   Joi.string().default('local'),
});

export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  podName: process.env.POD_NAME ?? 'local',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    bullUrl:   process.env.REDIS_BULL_URL,
    cacheUrl:  process.env.REDIS_CACHE_URL,
  },

  mqtt: {
    url: process.env.MQTT_BROKER_URL,
  },

  jwt: {
    secret:           process.env.JWT_SECRET,
    refreshSecret:    process.env.JWT_REFRESH_SECRET,
    expiresIn:        '15m',
    refreshExpiresIn: '7d',
  },

  ingest: {
    rateLimitRpm:      parseInt(process.env.RATE_LIMIT_DEFAULT_RPM ?? '10000'),
    maxBulkItems:      500,
    maxBodyBytes:      1_000_000,
    clockSkewFutureH:  parseInt(process.env.CLOCK_SKEW_FUTURE_HOURS ?? '24'),
    clockSkewPastD:    parseInt(process.env.CLOCK_SKEW_PAST_DAYS ?? '30'),
  },

  discovery: {
    windowHours:    parseInt(process.env.DISCOVERY_WINDOW_HOURS ?? '24'),
    replayCapacity: 500,
  },

  minio: {
    endpoint:  process.env.MINIO_ENDPOINT,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucket:    process.env.MINIO_BUCKET ?? 'iotproxy-exports',
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  app: {
    baseUrl: process.env.APP_BASE_URL,
  },
});
