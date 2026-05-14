import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface ReadingsParams {
  sensorId: string;
  startTs: string;
  endTs: string;
  agg?: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'LATEST' | 'NONE';
  intervalMs?: number;
  aggField?: string;
  /** Sensor's effective raw retention in days — lets the backend fall back to
   *  daily summaries for ranges that predate the cutoff. */
  rawRetentionDays?: number | null;
}

export function useReadings(params: ReadingsParams) {
  return useQuery({
    queryKey: ['readings', params],
    queryFn: async () => {
      const { data } = await api.get(`/query/readings/${params.sensorId}`, {
        params: {
          startTs: params.startTs,
          endTs: params.endTs,
          agg: params.agg ?? 'AVG',
          intervalMs: params.intervalMs ?? 3_600_000,
          aggField: params.aggField ?? 'value',
          ...(params.rawRetentionDays != null && { rawRetentionDays: params.rawRetentionDays }),
        },
      });
      return data as Array<{ bucket: string; avg_val: number; min_val: number; max_val: number; sum_val?: number; latest_val?: number }>;
    },
    refetchInterval: 60_000,
  });
}

export interface RawReading {
  phenomenon_time: string;
  processed_data: Record<string, unknown>;
  quality_code: string;
  pipeline_flags: string[];
}

export function useRawReadings(sensorId: string, limitHours = 24, limit = 100) {
  return useQuery({
    queryKey: ['raw-readings', sensorId, limitHours, limit],
    queryFn: async () => {
      const endTs = new Date().toISOString();
      const startTs = new Date(Date.now() - limitHours * 3_600_000).toISOString();
      const { data } = await api.get(`/query/readings/${sensorId}`, {
        params: { startTs, endTs, agg: 'NONE', limit },
      });
      return data as RawReading[];
    },
    refetchInterval: 30_000,
    enabled: !!sensorId,
  });
}

export function useSiteLatest(siteId: string) {
  return useQuery({
    queryKey: ['latest', siteId],
    queryFn: async () => {
      const { data } = await api.get(`/query/sites/${siteId}/latest`);
      return (data?.data ?? data) as Record<string, unknown>;
    },
    refetchInterval: 30_000,
  });
}

export function useDeleteReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sensorId, phenomenonTime }: { sensorId: string; phenomenonTime: string }) =>
      api.delete(`/query/readings/${sensorId}/${phenomenonTime}`).then((r) => r.data),
    onSuccess: (_d, { sensorId }) => {
      qc.invalidateQueries({ queryKey: ['readings', sensorId] });
      qc.invalidateQueries({ queryKey: ['raw-readings', sensorId] });
    },
  });
}

// ── Advanced search ────────────────────────────────────────────────────────

export interface SearchReadingsParams {
  sensorIds?: string[];
  siteId?: string;
  startTs?: string;
  endTs?: string;
  /** Exact clock time, e.g. "11:00" — only readings at that time of day */
  exactTime?: string;
  agg?: 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT' | 'NONE';
  intervalMs?: number;
  aggField?: string;
  sortBy?: 'time' | 'value' | 'sensor' | 'quality';
  sortDir?: 'ASC' | 'DESC';
  minQuality?: number;
  limit?: number;
  offset?: number;
  fields?: string[];
  /** If false, force raw-only search; if true/undefined, allow raw+summaries */
  includeSummaries?: boolean;
}

export interface SearchMeta {
  total: number;
  limit: number;
  offset: number;
  returned: number;
  dataStart: string | null;
  dataEnd: string | null;
  fromDailySummary?: boolean;
}

export interface SearchReadingsResult {
  data: Array<Record<string, unknown>>;
  meta: SearchMeta;
}

export function useSearchReadings(params: SearchReadingsParams, enabled = true) {
  return useQuery({
    queryKey: ['search-readings', params],
    queryFn: async () => {
      const { data } = await api.post('/query/readings/search', params);
      return data as SearchReadingsResult;
    },
    enabled,
  });
}

export function useNearestReadings(
  sensorIds: string[],
  targetTime: string,
  maxPerSensor = 1,
  enabled = true,
) {
  return useQuery({
    queryKey: ['nearest-readings', sensorIds, targetTime, maxPerSensor],
    queryFn: async () => {
      const { data } = await api.post('/query/readings/nearest', {
        sensorIds,
        targetTime,
        maxPerSensor,
      });
      return data as {
        data: Array<{
          sensor_id: string;
          phenomenon_time: string;
          processed_data: Record<string, unknown>;
          quality_code: string;
          distance_sec: number;
        }>;
        meta: { targetTime: string; sensorCount: number };
      };
    },
    enabled: enabled && sensorIds.length > 0 && !!targetTime,
  });
}

export function useClearAllReadings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sensorId: string) =>
      api.delete(`/query/readings/${sensorId}/all`).then((r) => r.data),
    onSuccess: (_d, sensorId) => {
      qc.invalidateQueries({ queryKey: ['readings', sensorId] });
      qc.invalidateQueries({ queryKey: ['raw-readings', sensorId] });
    },
  });
}
