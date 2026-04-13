import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface ReadingsParams {
  sensorId: string;
  startTs: string;
  endTs: string;
  agg?: 'AVG' | 'MIN' | 'MAX' | 'NONE';
  intervalMs?: number;
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
        },
      });
      return data as Array<{ bucket: string; avg_val: number; min_val: number; max_val: number }>;
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
      return data as Record<string, unknown>;
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
