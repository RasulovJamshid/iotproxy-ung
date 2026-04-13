import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    database: string;
    database_latency_ms?: number;
    redis: string;
    queue_depth: { status: string; depth: number };
  };
}

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: async () => (await api.get('/health')).data,
    refetchInterval: 15_000,
    retry: false,
  });
}
