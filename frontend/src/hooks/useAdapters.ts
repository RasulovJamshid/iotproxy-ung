import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SiteAdapter } from '@iotproxy/shared';
import { api } from '../api/client';

export function useAdapters() {
  return useQuery<SiteAdapter[]>({
    queryKey: ['adapters'],
    queryFn: async () => {
      const res = await api.get('/adapters');
      return res.data;
    },
  });
}

export function useAdapter(siteId: string | undefined) {
  return useQuery<SiteAdapter>({
    queryKey: ['adapters', siteId],
    queryFn: async () => {
      const res = await api.get(`/adapters/${siteId}`);
      return res.data;
    },
    enabled: !!siteId,
  });
}

export function useUpdateAdapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ siteId, data }: { siteId: string; data: Partial<SiteAdapter> }) => {
      const res = await api.put(`/adapters/${siteId}`, data);
      return res.data;
    },
    onSuccess: (updated, { siteId }) => {
      queryClient.setQueryData(['adapters', siteId], updated);
      queryClient.invalidateQueries({ queryKey: ['adapters'] });
    },
  });
}

export function useDeleteAdapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (siteId: string) => {
      await api.delete(`/adapters/${siteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adapters'] });
    },
  });
}

export function useTriggerPull() {
  return useMutation({
    mutationFn: async (siteId: string) => {
      const res = await api.post(`/adapters/${siteId}/pull/trigger`);
      return res.data;
    },
  });
}
