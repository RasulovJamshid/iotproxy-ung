import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface SensorCategory {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  color?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useSensorCategories() {
  return useQuery<SensorCategory[]>({
    queryKey: ['sensor-categories'],
    queryFn: async () => (await api.get('/sensor-categories')).data,
  });
}

export function useCreateSensorCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string }) =>
      api.post('/sensor-categories', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensor-categories'] });
    },
  });
}

export function useUpdateSensorCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; color?: string; isActive?: boolean }) =>
      api.patch(`/sensor-categories/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensor-categories'] });
    },
  });
}

export function useDeleteSensorCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sensor-categories/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensor-categories'] });
    },
  });
}
