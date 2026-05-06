import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BackfillRun } from '../types';

export function useBackfillRuns(adapterId?: string) {
  return useQuery<BackfillRun[]>({
    queryKey: ['backfill-runs', adapterId ?? null],
    queryFn: async () => {
      const params = adapterId ? `?adapterId=${adapterId}` : '';
      return (await api.get(`/backfill/runs${params}`)).data;
    },
    refetchInterval: (query) => {
      const runs = query.state.data as BackfillRun[] | undefined;
      const hasActive = runs?.some((r) => r.status === 'RUNNING' || r.status === 'PENDING');
      return hasActive ? 3_000 : 30_000;
    },
    refetchIntervalInBackground: true,
  });
}

export function useCreateBackfillRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      adapterId: string;
      startDate: string;
      endDate: string;
      chunkSize?: string;
      chunkSizeSec?: number;
      timestampStrategy?: string;
      delayBetweenChunksMs?: number;
    }) => api.post('/backfill/runs', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backfill-runs'] }),
  });
}

export function useCancelBackfillRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.delete(`/backfill/runs/${runId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backfill-runs'] }),
  });
}
