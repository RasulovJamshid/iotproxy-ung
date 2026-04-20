import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SiteGroup } from '../types';
import { api } from '../api/client';

export function useSiteGroups() {
  return useQuery<SiteGroup[]>({
    queryKey: ['site-groups'],
    queryFn: async () => {
      const res = await api.get('/site-groups');
      return res.data;
    },
  });
}

export function useSiteGroup(id: string | undefined) {
  return useQuery<SiteGroup & { sites: import('../types').Site[] }>({
    queryKey: ['site-groups', id],
    queryFn: async () => {
      const res = await api.get(`/site-groups/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateSiteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; color?: string }) => {
      const res = await api.post('/site-groups', data);
      return res.data as SiteGroup;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-groups'] }),
  });
}

export function useUpdateSiteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; color?: string }) => {
      const res = await api.patch(`/site-groups/${id}`, data);
      return res.data as SiteGroup;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['site-groups'] });
      qc.invalidateQueries({ queryKey: ['site-groups', id] });
    },
  });
}

export function useDeleteSiteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/site-groups/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-groups'] });
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

/** Assign a site to a group */
export function useAssignSiteToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, siteId }: { groupId: string; siteId: string }) => {
      const res = await api.patch(`/site-groups/${groupId}/sites/${siteId}`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['site-groups'] });
    },
  });
}

/** Remove a site from its group */
export function useUnassignSiteFromGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, siteId }: { groupId: string; siteId: string }) => {
      await api.delete(`/site-groups/${groupId}/sites/${siteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['site-groups'] });
    },
  });
}
