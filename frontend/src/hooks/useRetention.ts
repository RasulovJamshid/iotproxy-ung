import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface RetentionPreview {
  sensors: Array<{
    sensorId: string;
    cutoffDate: string;
    readingsToDelete: number;
  }>;
  summary: {
    totalSensors: number;
    totalReadingsToDelete: number;
    defaultRawRetentionDays?: number;
    defaultSummaryRetentionMonths?: number;
  };
}

export interface RetentionRunResult {
  sensorsProcessed: number;
  rawReadingsDeleted: number;
  summariesPurged: number;
}

export function useRetentionPreview(orgId: string, enabled = true) {
  return useQuery<RetentionPreview>({
    queryKey: ['retention', 'preview', orgId],
    queryFn: async () => (await api.get(`/admin/organizations/${orgId}/retention-preview`)).data,
    enabled: !!orgId && enabled,
    refetchInterval: 60_000,
  });
}

export function useRunRetention() {
  const queryClient = useQueryClient();
  return useMutation<RetentionRunResult, Error, { orgId: string }>({
    mutationFn: async ({ orgId }) =>
      (await api.post(`/admin/organizations/${orgId}/retention/run`)).data,
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['retention', 'preview', orgId] });
    },
  });
}
