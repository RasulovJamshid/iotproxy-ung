import { InboundMapping, FieldMapping, ResponseMapping } from './site-adapter.entity';

// ── Path resolver ─────────────────────────────────────────────────────────────
// Supports: $.field  $.a.b.c  $.items[*]  $.a.b[*]
// [*] returns the array itself so callers can iterate over it.

export function getPath(obj: unknown, jsonPath: string): unknown {
  if (!jsonPath || jsonPath === '$') return obj;
  const normalized = jsonPath.startsWith('$.') ? jsonPath.slice(2)
    : jsonPath.startsWith('$') ? jsonPath.slice(1)
    : jsonPath;
  if (!normalized) return obj;

  let cur: unknown = obj;
  for (const part of normalized.split('.')) {
    if (cur == null) return undefined;
    const bracketAt = part.indexOf('[');
    if (bracketAt >= 0) {
      const field = part.slice(0, bracketAt);
      const idx   = part.slice(bracketAt + 1, part.length - 1); // '*' or digit
      if (field) cur = (cur as Record<string, unknown>)[field];
      if (idx !== '*') {
        cur = Array.isArray(cur) ? (cur as unknown[])[Number(idx)] : undefined;
      }
      // idx === '*' → leave cur as the array
    } else {
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

// ── Template interpolation ────────────────────────────────────────────────────
// Replaces {{lastPollAt}}, {{now}}, {{siteId}} in URL / body strings.

export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function interpolateObj(
  obj: Record<string, unknown>,
  vars: Record<string, string>,
): Record<string, unknown> {
  return JSON.parse(interpolate(JSON.stringify(obj), vars));
}

// ── Field extraction ──────────────────────────────────────────────────────────

function extractFields(
  item: unknown,
  fields: FieldMapping,
): { sensorId: string; phenomenonTime: string; data: Record<string, unknown> } {
  const sensorId       = String(getPath(item, fields.sensorId) ?? '');
  const phenomenonTime = String(getPath(item, fields.phenomenonTime) ?? new Date().toISOString());

  let data: Record<string, unknown>;
  if (typeof fields.data === 'string') {
    const raw = getPath(item, fields.data);
    data = (raw !== null && typeof raw === 'object')
      ? raw as Record<string, unknown>
      : { value: raw };
  } else {
    data = {};
    for (const [key, path] of Object.entries(fields.data)) {
      data[key] = getPath(item, path);
    }
  }

  return { sensorId, phenomenonTime, data };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MappedReading {
  siteId:         string;
  sensorId:       string;
  phenomenonTime: string;
  data:           Record<string, unknown>;
}

/**
 * Normalize an inbound pushed payload using the site's InboundMapping.
 * Returns an array of normalized readings from a single-site push.
 */
export function normalizeInbound(
  payload: unknown,
  mapping: InboundMapping,
  siteId: string,
): MappedReading[] {
  const items = mapping.readingsPath
    ? (getPath(payload, mapping.readingsPath) as unknown[])
    : Array.isArray(payload) ? payload : [payload];

  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const { sensorId, phenomenonTime, data } = extractFields(item, mapping.fields);
      if (!sensorId) return null;
      return { siteId, sensorId, phenomenonTime, data };
    })
    .filter((r): r is MappedReading => r !== null);
}

/**
 * Map a pull response using the adapter's ResponseMapping.
 * Handles both single-site and multi-site modes.
 * For multi-site, `siteResolver` maps identifier → internal UUID.
 */
export function mapPullResponse(
  response: unknown,
  mapping: ResponseMapping,
  siteResolver: (identifier: string) => string | undefined,
): MappedReading[] {
  const results: MappedReading[] = [];

  if (mapping.mode === 'single-site') {
    if (!mapping.siteId) return [];
    const items = getPath(response, mapping.readingsPath);
    if (!Array.isArray(items)) return [];
    for (const item of items) {
      const { sensorId, phenomenonTime, data } = extractFields(item, mapping.fields);
      if (!sensorId) continue;
      results.push({ siteId: mapping.siteId, sensorId, phenomenonTime, data });
    }
  } else {
    // multi-site
    if (!mapping.sitesPath || !mapping.siteIdPath) return [];
    const siteBlocks = getPath(response, mapping.sitesPath);
    if (!Array.isArray(siteBlocks)) return [];

    for (const block of siteBlocks) {
      const identifier = String(getPath(block, mapping.siteIdPath) ?? '');
      const siteId = mapping.siteIdResolver === 'by-id'
        ? identifier
        : siteResolver(identifier);
      if (!siteId) continue;

      const items = getPath(block, mapping.readingsPath);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const { sensorId, phenomenonTime, data } = extractFields(item, mapping.fields);
        if (!sensorId) continue;
        results.push({ siteId, sensorId, phenomenonTime, data });
      }
    }
  }

  return results;
}
