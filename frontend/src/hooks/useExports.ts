import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { ExportJob } from '../types';

export function useExports() {
  return useQuery<ExportJob[]>({
    queryKey: ['exports'],
    queryFn: async () => (await api.get('/export')).data,
    refetchInterval: (query) => {
      const jobs = query.state.data as ExportJob[] | undefined;
      const hasActive = jobs?.some(
        (j) => j.status !== 'COMPLETED' && j.status !== 'FAILED',
      );
      return hasActive ? 2_000 : 30_000;
    },
    refetchIntervalInBackground: true,
  });
}

export function useCreateExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      siteId: string;
      startTs: string;
      endTs: string;
      format: string;
      fields?: string[];
    }) => api.post('/export', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exports'] }),
  });
}

export function useDownloadExport() {
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (job: ExportJob) => {
    if (downloading) return;
    setDownloading(job.id);
    try {
      const res = await api.get(`/export/${job.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${job.id}.${job.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  return { download, downloading };
}
