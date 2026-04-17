import jsonata from 'jsonata';

// ── Expression cache ──────────────────────────────────────────────────────────
// Re-compiling the same expression on every poll cycle is wasteful.
// We cache up to MAX_CACHE_SIZE compiled expressions by their source string.

const MAX_CACHE_SIZE = 200;
const expressionCache = new Map<string, ReturnType<typeof jsonata>>();

function compile(expression: string): ReturnType<typeof jsonata> {
  let expr = expressionCache.get(expression);
  if (!expr) {
    expr = jsonata(expression);
    if (expressionCache.size >= MAX_CACHE_SIZE) {
      // Evict the oldest entry
      const oldest = expressionCache.keys().next().value;
      if (oldest !== undefined) expressionCache.delete(oldest);
    }
    expressionCache.set(expression, expr);
  }
  return expr;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a JSONata expression against `data`.
 * Optional `bindings` are exposed as $ variables inside the expression.
 *
 * Throws if the expression is syntactically invalid or evaluation fails.
 */
export async function evaluateJsonata(
  expression: string,
  data: unknown,
  bindings?: Record<string, unknown>,
): Promise<unknown> {
  const expr = compile(expression);
  return expr.evaluate(data as any, bindings ?? {});
}

// ── Normalized reading shape that JSONata expressions must produce ─────────────

export interface JsonataMappedReading {
  sensorId: string;
  phenomenonTime: string;
  data: Record<string, unknown>;
  /** Optional — only required when the expression covers multiple sites */
  siteId?: string;
}

/**
 * Coerce the raw JSONata evaluation result into an array of JsonataMappedReading.
 * Handles both a single object and an array result.
 * Filters out items that are missing sensorId.
 */
export function coerceReadings(result: unknown): JsonataMappedReading[] {
  if (result == null) return [];
  const items = Array.isArray(result) ? result : [result];
  return items.filter(
    (item): item is JsonataMappedReading =>
      item != null &&
      typeof item === 'object' &&
      typeof (item as any).sensorId === 'string' &&
      (item as any).sensorId.length > 0,
  );
}
