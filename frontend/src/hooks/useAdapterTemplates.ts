import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdapterTemplate } from '@iotproxy/shared';
import { api } from '../api/client';

const QK = ['adapter-templates'] as const;

export function useAdapterTemplates() {
  return useQuery<AdapterTemplate[]>({
    queryKey: QK,
    queryFn: async () => {
      const res = await api.get('/adapter-templates');
      return res.data;
    },
  });
}

export function useCreateAdapterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<AdapterTemplate>) => {
      const res = await api.post('/adapter-templates', data);
      return res.data as AdapterTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateAdapterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AdapterTemplate> }) => {
      const res = await api.put(`/adapter-templates/${id}`, data);
      return res.data as AdapterTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteAdapterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/adapter-templates/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

/** Snapshot the current site adapter as a named template */
export function useSaveAsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      siteId,
      name,
      description,
    }: {
      siteId: string;
      name: string;
      description?: string;
    }) => {
      const res = await api.post(`/adapters/${siteId}/save-as-template`, { name, description });
      return res.data as AdapterTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

/** Apply a saved template onto a site (stamps mapping/request fields; credentials left blank) */
export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      siteId,
      templateId,
    }: {
      siteId: string;
      templateId: string;
    }) => {
      const res = await api.post(`/adapters/${siteId}/apply-template/${templateId}`);
      return res.data;
    },
    onSuccess: (_data, { siteId }) => {
      qc.invalidateQueries({ queryKey: ['adapters', siteId] });
      qc.invalidateQueries({ queryKey: ['adapters'] });
    },
  });
}
