import React, { useState } from 'react';
import { useUpsertSensorConfig } from '../hooks/useSensors';

interface Props {
  sensorId: string;
  initial?: {
    alias?: string;
    unit?: string;
    scaleMultiplier?: number;
    scaleOffset?: number;
    expectedMin?: number | null;
    expectedMax?: number | null;
    rejectOutOfRange?: boolean;
  };
  onSaved?: () => void;
}

export function SensorConfigForm({ sensorId, initial, onSaved }: Props) {
  const upsert = useUpsertSensorConfig();
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [scaleMultiplier, setScaleMultiplier] = useState(String(initial?.scaleMultiplier ?? 1));
  const [scaleOffset, setScaleOffset] = useState(String(initial?.scaleOffset ?? 0));
  const [expectedMin, setExpectedMin] = useState(initial?.expectedMin != null ? String(initial.expectedMin) : '');
  const [expectedMax, setExpectedMax] = useState(initial?.expectedMax != null ? String(initial.expectedMax) : '');
  const [rejectOutOfRange, setRejectOutOfRange] = useState(initial?.rejectOutOfRange ?? false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsert.mutateAsync({
      id: sensorId,
      config: {
        alias: alias || undefined,
        unit: unit || undefined,
        scaleMultiplier: Number(scaleMultiplier),
        scaleOffset: Number(scaleOffset),
        expectedMin: expectedMin ? Number(expectedMin) : undefined,
        expectedMax: expectedMax ? Number(expectedMax) : undefined,
        rejectOutOfRange,
        fieldMappings: {},
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Alias</label>
          <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="temperature" />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Output field name after pipeline remapping</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Unit</label>
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Scale multiplier</label>
          <input className="input" type="number" step="any" value={scaleMultiplier} onChange={(e) => setScaleMultiplier(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">value × multiplier + offset</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Scale offset</label>
          <input className="input" type="number" step="any" value={scaleOffset} onChange={(e) => setScaleOffset(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Expected min</label>
          <input className="input" type="number" step="any" value={expectedMin} onChange={(e) => setExpectedMin(e.target.value)} placeholder="—" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Expected max</label>
          <input className="input" type="number" step="any" value={expectedMax} onChange={(e) => setExpectedMax(e.target.value)} placeholder="—" />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={rejectOutOfRange}
          onChange={(e) => setRejectOutOfRange(e.target.checked)}
          className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
        />
        <span className="text-sm text-slate-700 dark:text-slate-200">Reject readings outside expected range</span>
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={upsert.isPending} className="btn-primary">
          {upsert.isPending ? 'Saving…' : 'Save Config'}
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>}
        {upsert.isError && <span className="text-sm text-red-600 dark:text-red-400">Failed to save</span>}
      </div>
    </form>
  );
}
