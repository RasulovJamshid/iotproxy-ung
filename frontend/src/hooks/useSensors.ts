import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Sensor } from '../types';

export function useSensors(siteId?: string) {
  return useQuery<Sensor[]>({
    queryKey: ['sensors', siteId],
    queryFn: async () => {
      const params = siteId ? { siteId } : {};
      return (await api.get('/sensors', { params })).data;
    },
  });
}

export function useSensor(id: string) {
  return useQuery<Sensor>({
    queryKey: ['sensors', 'detail', id],
    queryFn: async () => (await api.get(`/sensors/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      siteId: string;
      name: string;
      description?: string;
      reportingIntervalSeconds?: number;
    }) => api.post('/sensors', body).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['sensors', vars.siteId] });
      qc.invalidateQueries({ queryKey: ['sensors', undefined] });
    },
  });
}

export function useUpdateSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; externalId?: string; reportingIntervalSeconds?: number; maxRecordsPerSensor?: number | null }) =>
      api.patch(`/sensors/${id}`, data).then((r) => r.data),
    onSuccess: (updated, { id }) => {
      qc.setQueryData(['sensors', 'detail', id], updated);
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}

export function useTransferSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newSiteId }: { id: string; newSiteId: string }) =>
      api.patch(`/sensors/${id}/transfer`, { newSiteId }).then((r) => r.data),
    onSuccess: (updated: Sensor, { id }) => {
      qc.setQueryData(['sensors', 'detail', id], updated);
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}

export function useUpdateSensorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/sensors/${id}/status`, { status }).then((r) => r.data),
    onSuccess: (updated, { id }) => {
      qc.setQueryData(['sensors', 'detail', id], updated);
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}

export function useSensorConfig(sensorId?: string) {
  return useQuery({
    queryKey: ['sensors', 'config', sensorId],
    queryFn: async () => {
      const { data } = await api.get(`/sensors/${sensorId}/config`);
      return data as {
        alias?: string; unit?: string;
        scaleMultiplier: number; scaleOffset: number;
        expectedMin?: number | null; expectedMax?: number | null;
        rejectOutOfRange: boolean; fieldMappings: Record<string, string>;
      } | null;
    },
    enabled: !!sensorId,
  });
}

export function useUpsertSensorConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) =>
      api.post(`/sensors/${id}/config`, config).then((r) => r.data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['sensors', 'config', id] });
      qc.invalidateQueries({ queryKey: ['sensors', 'detail', id] });
    },
  });
}

export function useSoftDeleteSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sensors/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}

export function useHardDeleteSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sensors/${id}?hard=true`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}

export function useSoftDeleteVirtualSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sensors/virtual/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}

export function useHardDeleteVirtualSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sensors/virtual/${id}?hard=true`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensors'] });
    },
  });
}
