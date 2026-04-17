import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface SensorType {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useSensorTypes() {
  return useQuery<SensorType[]>({
    queryKey: ['sensor-types'],
    queryFn: async () => (await api.get('/sensor-types')).data,
  });
}

export function useCreateSensorType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; icon?: string }) =>
      api.post('/sensor-types', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensor-types'] });
    },
  });
}

export function useUpdateSensorType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; icon?: string; isActive?: boolean }) =>
      api.patch(`/sensor-types/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensor-types'] });
    },
  });
}

export function useDeleteSensorType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sensor-types/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensor-types'] });
    },
  });
}
