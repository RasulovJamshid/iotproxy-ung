import React, { useState } from 'react';
import { useFieldProfiles, usePreviewConfig } from '../hooks/useDiscovery';
import { useCreateSensor, useUpsertSensorConfig } from '../hooks/useSensors';
import { PageSpinner } from './ui/Spinner';

interface Props {
  siteId: string;
}

interface FieldConfig {
  alias: string;
  unit: string;
  scaleMultiplier: string;
  scaleOffset: string;
  expectedMin: string;
  expectedMax: string;
}

function stdDev(m2: number, n: number): number {
  if (n < 2) return 0;
  return Math.sqrt(m2 / (n - 1));
}

export function DiscoveryPanel({ siteId }: Props) {
  const { data: profiles, isLoading } = useFieldProfiles(siteId);
  const previewConfig = usePreviewConfig(siteId);
  const createSensor = useCreateSensor();
  const upsertConfig = useUpsertSensorConfig();

  const [fieldConfigs, setFieldConfigs] = useState<Record<string, FieldConfig>>({});
  const [previewResult, setPreviewResult] = useState<unknown[] | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  const getConfig = (key: string): FieldConfig =>
    fieldConfigs[key] ?? { alias: '', unit: '', scaleMultiplier: '1', scaleOffset: '0', expectedMin: '', expectedMax: '' };

  const setConfig = (key: string, patch: Partial<FieldConfig>) =>
    setFieldConfigs((prev) => ({ ...prev, [key]: { ...getConfig(key), ...patch } }));

  const buildProposedConfig = () => ({
    fieldMappings: Object.fromEntries(
      (profiles ?? [])
        .filter((p) => fieldConfigs[p.fieldKey]?.alias)
        .map((p) => [p.fieldKey, fieldConfigs[p.fieldKey].alias])
    ),
    scaleMultiplier: 1,
    scaleOffset: 0,
  });

  const handlePreview = async () => {
    const result = await previewConfig.mutateAsync(buildProposedConfig());
    setPreviewResult(result);
  };

  const handleCommit = async () => {
    if (!profiles?.length) return;
    setCommitting(true);
    try {
      // Create one sensor per discovered field and push its config
      for (const profile of profiles) {
        const cfg = getConfig(profile.fieldKey);
        const sensor = await createSensor.mutateAsync({
          siteId,
          name: cfg.alias || profile.fieldKey,
          description: `Auto-discovered field: ${profile.fieldKey}`,
        });

        await upsertConfig.mutateAsync({
          id: sensor.id,
          config: {
            alias: cfg.alias || profile.fieldKey,
            unit: cfg.unit || undefined,
            scaleMultiplier: Number(cfg.scaleMultiplier) || 1,
            scaleOffset: Number(cfg.scaleOffset) || 0,
            expectedMin: cfg.expectedMin ? Number(cfg.expectedMin) : undefined,
            expectedMax: cfg.expectedMax ? Number(cfg.expectedMax) : undefined,
            rejectOutOfRange: !!(cfg.expectedMin || cfg.expectedMax),
            fieldMappings: {},
          },
        });
      }
      setCommitted(true);
    } finally {
      setCommitting(false);
    }
  };

  if (isLoading) return <PageSpinner />;

  if (!profiles?.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No field profiles yet</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          This site is in REVIEW. Send readings during the discovery window to populate field statistics.
        </p>
      </div>
    );
  }

  if (committed) {
    return (
      <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-6 text-center">
        <p className="text-sm font-semibold text-green-700 dark:text-green-400">Sensors created successfully</p>
        <p className="mt-1 text-xs text-green-600 dark:text-green-500">
          {profiles.length} sensor{profiles.length !== 1 ? 's' : ''} provisioned with configs. Transition the site to ACTIVE to begin normal pipeline processing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Review the fields discovered during the window. Set aliases, units, and scale transforms, then commit to create sensors.
      </p>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              {['Field', 'Samples', 'Mean', 'Std Dev', 'Min', 'Max', 'Types', 'Alias', 'Unit', 'Scale ×', 'Offset +', 'Val Min', 'Val Max'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const cfg = getConfig(p.fieldKey);
              const sd = stdDev(p.m2, p.sampleCount);
              const dominantType = Object.entries(p.sampleTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
              return (
                <tr key={p.id} className="table-row">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-200 font-medium">{p.fieldKey}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{p.sampleCount}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{p.mean.toFixed(3)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{sd.toFixed(3)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{p.minVal?.toFixed(3) ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{p.maxVal?.toFixed(3) ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">{dominantType}</td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-28"
                      value={cfg.alias}
                      onChange={(e) => setConfig(p.fieldKey, { alias: e.target.value })}
                      placeholder={p.fieldKey}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-20"
                      value={cfg.unit}
                      onChange={(e) => setConfig(p.fieldKey, { unit: e.target.value })}
                      placeholder="°C"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-20"
                      type="number"
                      step="any"
                      value={cfg.scaleMultiplier}
                      onChange={(e) => setConfig(p.fieldKey, { scaleMultiplier: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-20"
                      type="number"
                      step="any"
                      value={cfg.scaleOffset}
                      onChange={(e) => setConfig(p.fieldKey, { scaleOffset: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-20"
                      type="number"
                      step="any"
                      value={cfg.expectedMin}
                      onChange={(e) => setConfig(p.fieldKey, { expectedMin: e.target.value })}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input py-1 text-xs w-20"
                      type="number"
                      step="any"
                      value={cfg.expectedMax}
                      onChange={(e) => setConfig(p.fieldKey, { expectedMax: e.target.value })}
                      placeholder="—"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={previewConfig.isPending}
          className="btn-secondary disabled:opacity-50"
        >
          {previewConfig.isPending ? 'Running…' : 'Preview Transform'}
        </button>
        <button
          onClick={handleCommit}
          disabled={committing}
          className="btn-primary"
        >
          {committing ? 'Creating sensors…' : `Commit ${profiles.length} sensor${profiles.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {previewResult && previewResult.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Preview (first 5 payloads after transform):</p>
          <pre className="rounded-lg bg-slate-900 p-4 text-xs text-green-400 overflow-x-auto max-h-48">
            {JSON.stringify(previewResult.slice(0, 5), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
