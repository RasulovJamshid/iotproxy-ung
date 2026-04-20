/**
 * Site type classifications for categorizing different kinds of IoT deployments
 */
export const SITE_TYPES = {
  FACTORY: 'FACTORY',
  WAREHOUSE: 'WAREHOUSE',
  OFFICE: 'OFFICE',
  OUTDOOR: 'OUTDOOR',
  MOBILE: 'MOBILE',
  RESIDENTIAL: 'RESIDENTIAL',
  RETAIL: 'RETAIL',
  HEALTHCARE: 'HEALTHCARE',
  AGRICULTURE: 'AGRICULTURE',
  ENERGY: 'ENERGY',
  TRANSPORTATION: 'TRANSPORTATION',
  WATER_TREATMENT: 'WATER_TREATMENT',
  DATA_CENTER: 'DATA_CENTER',
  OTHER: 'OTHER',
} as const;

export type SiteType = typeof SITE_TYPES[keyof typeof SITE_TYPES];

/**
 * Human-readable labels for site types
 */
export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  FACTORY: 'Factory / Manufacturing',
  WAREHOUSE: 'Warehouse / Distribution',
  OFFICE: 'Office Building',
  OUTDOOR: 'Outdoor / Environmental',
  MOBILE: 'Mobile / Vehicle',
  RESIDENTIAL: 'Residential',
  RETAIL: 'Retail Store',
  HEALTHCARE: 'Healthcare Facility',
  AGRICULTURE: 'Agriculture / Farm',
  ENERGY: 'Energy / Power Plant',
  TRANSPORTATION: 'Transportation Hub',
  WATER_TREATMENT: 'Water Treatment',
  DATA_CENTER: 'Data Center',
  OTHER: 'Other',
};

/**
 * Common timezone examples by region
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;
