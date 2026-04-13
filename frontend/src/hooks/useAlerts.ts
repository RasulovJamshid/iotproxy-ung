import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AlertRule, AlertEvent } from '../types';

export function useAlertRules() {
  return useQuery<AlertRule[]>({
    queryKey: ['alert-rules'],
    queryFn: async () => (await api.get('/alerts/rules')).data,
  });
}

export function useAlertEvents(sensorId?: string) {
  return useQuery<AlertEvent[]>({
    queryKey: ['alert-events', sensorId],
    queryFn: async () => {
      const params = sensorId ? { sensorId } : {};
      return (await api.get('/alerts/events', { params })).data;
    },
    refetchInterval: 30_000,
  });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AlertRule>) =>
      api.post('/alerts/rules', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useUpdateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AlertRule> & { id: string }) =>
      api.patch(`/alerts/rules/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useUpdateAlertEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: string }) =>
      api.patch(`/alerts/events/${id}`, { state }).then((r) => r.data),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['alert-events'] });
    },
  });
}

export function useDeleteAlertEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });
}
