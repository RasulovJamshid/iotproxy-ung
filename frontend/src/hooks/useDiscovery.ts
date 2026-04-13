import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client';

export interface FieldProfile {
  id: string;
  siteId: string;
  fieldKey: string;
  sampleCount: number;
  mean: number;
  m2: number;
  minVal?: number;
  maxVal?: number;
  suggestedUnit?: string;
  sampleTypes: Record<string, number>;
  updatedAt: string;
}

export function useFieldProfiles(siteId: string, enabled = true) {
  return useQuery<FieldProfile[]>({
    queryKey: ['discovery', 'profiles', siteId],
    queryFn: async () => (await api.get(`/discovery/sites/${siteId}/profiles`)).data,
    enabled: !!siteId && enabled,
    refetchInterval: 30_000,
  });
}

export function usePreviewConfig(siteId: string) {
  return useMutation({
    mutationFn: (proposedConfig: Record<string, unknown>) =>
      api.post(`/discovery/sites/${siteId}/preview`, proposedConfig).then((r) => r.data),
  });
}
