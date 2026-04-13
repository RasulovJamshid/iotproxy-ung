import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { ApiKey } from '../types';

export function useApiKeys() {
  const { user } = useAuth();
  return useQuery<ApiKey[]>({
    queryKey: ['api-keys', user?.organizationId],
    queryFn: async () => (await api.get('/api-keys')).data,
    enabled: !!user,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      siteId?: string;
      permissions?: string[];
      websocketEnabled?: boolean;
      expiresAt?: string;
    }) => api.post('/api-keys', body).then((r) => r.data as ApiKey & { key: string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useUpdateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string;
      name?: string;
      permissions?: string[];
      websocketEnabled?: boolean;
      expiresAt?: string;
    }) => api.patch(`/api-keys/${id}`, data).then((r) => r.data as ApiKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/api-keys/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
