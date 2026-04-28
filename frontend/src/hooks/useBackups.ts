import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface Backup {
  id: string;
  organizationId: string;
  backupType: string;
  status: string;
  filePath?: string;
  fileSizeBytes?: number;
  tablesIncluded: string[];
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export function useBackups(orgId: string) {
  return useQuery<Backup[]>({
    queryKey: ['backups', orgId],
    queryFn: async () => (await api.get(`/admin/organizations/${orgId}/backups`)).data,
    enabled: !!orgId,
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, backupType }: { orgId: string; backupType?: 'FULL' | 'INCREMENTAL' }) =>
      api.post(`/admin/organizations/${orgId}/backups`, { backupType }).then((r) => r.data),
    onSuccess: (_, { orgId }) => {
      qc.invalidateQueries({ queryKey: ['backups', orgId] });
    },
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, id }: { orgId: string; id: string }) =>
      api.delete(`/admin/organizations/${orgId}/backups/${id}`).then((r) => r.data),
    onSuccess: (_, { orgId }) => {
      qc.invalidateQueries({ queryKey: ['backups', orgId] });
    },
  });
}

export function useDownloadBackup() {
  return useMutation({
    mutationFn: async ({ orgId, id }: { orgId: string; id: string }) => {
      const response = await api.get(`/admin/organizations/${orgId}/backups/${id}/download`);
      const { url } = response.data;
      // Open download URL in new tab
      window.open(url, '_blank');
      return response.data;
    },
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, id }: { orgId: string; id: string }) =>
      api.post(`/admin/organizations/${orgId}/backups/${id}/restore`).then((r) => r.data),
    onSuccess: (_, { orgId }) => {
      qc.invalidateQueries({ queryKey: ['backups', orgId] });
    },
  });
}
