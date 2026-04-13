import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Site } from '../types';

export function useSites() {
  return useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => (await api.get('/sites')).data,
  });
}

/** Fetch sites for a specific org (SYSTEM_ADMIN only). */
export function useOrgSites(orgId?: string) {
  return useQuery<Site[]>({
    queryKey: ['sites', 'org', orgId],
    queryFn: async () => (await api.get('/sites', { params: { orgId } })).data,
    enabled: !!orgId,
  });
}

export function useSite(id: string) {
  return useQuery<Site>({
    queryKey: ['sites', id],
    queryFn: async () => (await api.get(`/sites/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.post('/sites', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useTransitionSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/sites/${id}/status`, { status }).then((r) => r.data),
    onSuccess: (updated, { id }) => {
      qc.setQueryData(['sites', id], updated);
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; discoveryEnabled?: boolean }) =>
      api.patch(`/sites/${id}`, body).then((r) => r.data),
    onSuccess: (updated, { id }) => {
      qc.setQueryData(['sites', id], updated);
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
