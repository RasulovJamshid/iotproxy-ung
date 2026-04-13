import React, { useState } from 'react';
import {
  Search, AlertTriangle, CheckCircle2, ChevronRight, ArrowLeft, Zap,
  Tag, Clock, BarChart2, Info, Copy, MousePointerClick, X,
} from 'lucide-react';
import { useDiscoverSchema, DiscoveryResult, DiscoveredField } from '../../hooks/useAdapters';

interface Props {
  onApply: (mapping: {
    readingsPath: string;
    sensorIdPath: string;
    discriminatorField: string | null;
    phenomenonTimePath: string;
    dataPath: string;
  }) => void;
  onBack: () => void;
}

// ── Role slot definitions ──────────────────────────────────────────────────────
type RoleKey = 'sensorId' | 'discriminator' | 'timestamp' | 'data';

const ROLES: { key: RoleKey; label: string; desc: string; color: string; icon: React.ReactNode; required: boolean }[] = [
  {
    key: 'sensorId',
    label: 'Sensor ID',
    desc: 'Field that uniquely identifies the sensor/site',
    color: 'blue',
    icon: <Tag className="w-3.5 h-3.5" />,
    required: true,
  },
  {
    key: 'discriminator',
    label: 'Discriminator',
    desc: 'Label field that differentiates sensor types per row (e.g. product type)',
    color: 'purple',
    icon: <Copy className="w-3.5 h-3.5" />,
    required: false,
  },
  {
    key: 'timestamp',
    label: 'Timestamp',
    desc: 'Date/time field for the reading (auto-generated if absent)',
    color: 'amber',
    icon: <Clock className="w-3.5 h-3.5" />,
    required: false,
  },
  {
    key: 'data',
    label: 'Data Value',
    desc: 'Numeric field(s) to record as sensor reading data',
    color: 'green',
    icon: <BarChart2 className="w-3.5 h-3.5" />,
    required: false,
  },
];

const ROLE_BG: Record<RoleKey, string> = {
  sensorId:     'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 ring-blue-400',
  discriminator:'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 ring-purple-400',
  timestamp:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 ring-amber-400',
  data:         'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 ring-green-400',
};

const ROLE_BADGE: Record<RoleKey, string> = {
  sensorId:     'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  discriminator:'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  timestamp:    'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  data:         'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
};

const ROLE_TEXT: Record<RoleKey, string> = {
  sensorId:     'text-blue-700 dark:text-blue-300',
  discriminator:'text-purple-700 dark:text-purple-300',
  timestamp:    'text-amber-700 dark:text-amber-300',
  data:         'text-green-700 dark:text-green-300',
};

type Assignments = Record<RoleKey, string>;

export function SchemaDiscoveryWizard({ onApply, onBack }: Props) {
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [activeSlot, setActiveSlot] = useState<RoleKey | null>(null);
  const [readingsPath, setReadingsPath] = useState('');
  const [assignments, setAssignments] = useState<Assignments>({
    sensorId: '', discriminator: '', timestamp: '', data: '',
  });
  const discover = useDiscoverSchema();

  const handleDiscover = async () => {
    setJsonError('');
    let parsed: unknown;
    try { parsed = JSON.parse(rawJson); }
    catch { setJsonError('Invalid JSON — please paste valid JSON and try again.'); return; }

    const res = await discover.mutateAsync(parsed);
    setResult(res);
    setReadingsPath(res.readingsPath);

    // Pre-fill from suggestions
    setAssignments({
      sensorId:     res.suggestions.sensorIdPath,
      discriminator: res.suggestions.discriminatorField ?? '',
      timestamp:    res.suggestions.phenomenonTimePath,
      data:         res.suggestions.dataFields[0]?.path ?? '',
    });
    setActiveSlot(null);
  };

  // Assign or clear a field to the active slot
  const handleFieldClick = (field: DiscoveredField) => {
    if (!activeSlot) return;
    setAssignments(prev => {
      const next = { ...prev };
      // Clear any other slot that had this path
      (Object.keys(next) as RoleKey[]).forEach(k => {
        if (next[k] === field.jsonPath) next[k] = '';
      });
      // Toggle: if this slot already has this field, clear it
      next[activeSlot] = next[activeSlot] === field.jsonPath ? '' : field.jsonPath;
      return next;
    });
  };

  const slotFor = (field: DiscoveredField): RoleKey | null => {
    for (const role of Object.keys(assignments) as RoleKey[]) {
      if (assignments[role] === field.jsonPath) return role;
    }
    return null;
  };

  const handleApply = () => {
    onApply({
      readingsPath,
      sensorIdPath:      assignments.sensorId,
      discriminatorField: assignments.discriminator || null,
      phenomenonTimePath: assignments.timestamp,
      dataPath:           assignments.data || '$.value',
    });
  };

  // Sensor ID preview with discriminator
  const sensorPreviews = (() => {
    if (!result) return [];
    const sidField = result.fields.find(f => f.jsonPath === assignments.sensorId);
    const discField = assignments.discriminator
      ? result.fields.find(f => f.jsonPath === assignments.discriminator)
      : null;
    if (!sidField) return [];
    if (discField) {
      return sidField.sampleValues.flatMap(sid =>
        discField.sampleValues.map(disc => `${sid}:${disc}`)
      ).slice(0, 8);
    }
    return sidField.sampleValues.slice(0, 8);
  })();

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Schema Discovery Wizard
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Paste a sample API response, then assign fields to roles using the slots below.
          </p>
        </div>
      </div>

      {/* Step 1: Paste JSON */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold">1</span>
          Paste a sample API response
        </label>
        <textarea
          value={rawJson}
          onChange={e => { setRawJson(e.target.value); setJsonError(''); }}
          placeholder={'{\n  "data": [ ...paste a real API response here... ]\n}'}
          rows={8}
          className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-y"
        />
        {jsonError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {jsonError}
          </p>
        )}
        <button
          onClick={handleDiscover}
          disabled={!rawJson.trim() || discover.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Search className="w-4 h-4" />
          {discover.isPending ? 'Analysing…' : 'Analyse Schema'}
        </button>
      </div>

      {result && (
        <>
          {/* Discovery banner */}
          <div className={`rounded-lg p-3.5 border ${result.discriminatorDetected
            ? 'bg-purple-50 dark:bg-purple-900/15 border-purple-200 dark:border-purple-800'
            : 'bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800'}`}>
            <div className="flex items-start gap-2">
              {result.discriminatorDetected
                ? <Info className="w-4 h-4 mt-0.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                : <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />}
              <p className={`text-xs ${result.discriminatorDetected ? 'text-purple-800 dark:text-purple-300' : 'text-green-800 dark:text-green-300'}`}>
                {result.discriminatorDetected
                  ? `⚡ Multi-sensor-per-row pattern detected! A discriminator field will create unique sensor IDs for each label value.`
                  : `Standard schema — ${result.totalItems} row(s) found, each represents a single sensor reading.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Role Slots */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold">2</span>
                Select a slot, then click a field on the right
              </label>

              {ROLES.map(role => {
                const assigned = assignments[role.key];
                const isActive = activeSlot === role.key;
                return (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => setActiveSlot(isActive ? null : role.key)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                      isActive
                        ? `${ROLE_BG[role.key]} ring-2 ring-offset-1`
                        : assigned
                        ? `${ROLE_BG[role.key]} opacity-90`
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className={`mt-0.5 flex-shrink-0 ${assigned ? ROLE_TEXT[role.key] : 'text-slate-400'}`}>
                          {role.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${assigned ? ROLE_TEXT[role.key] : 'text-slate-600 dark:text-slate-300'}`}>
                              {role.label}
                            </span>
                            {role.required && (
                              <span className="text-[10px] text-red-500 font-medium">required</span>
                            )}
                            {isActive && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[role.key]}`}>
                                ← click a field
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{role.desc}</p>
                          {assigned ? (
                            <div className="flex items-center gap-1 mt-1.5">
                              <span className="font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 truncate">
                                {assigned}
                              </span>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setAssignments(p => ({ ...p, [role.key]: '' })); }}
                                className="flex-shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                              <MousePointerClick className="w-3 h-3" />
                              {isActive ? 'Now click a field on the right →' : 'Click to activate, then pick a field'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Readings path */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Readings array path <span className="text-slate-400">(auto-detected)</span>
                </label>
                <input
                  type="text"
                  value={readingsPath}
                  onChange={e => setReadingsPath(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Sensor ID preview */}
              {sensorPreviews.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Resulting sensor IDs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sensorPreviews.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono text-slate-700 dark:text-slate-200">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Discovered Fields */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                Discovered Fields
                {activeSlot && (
                  <span className={`ml-2 text-xs font-normal px-2 py-0.5 rounded-full ${ROLE_BADGE[activeSlot]}`}>
                    Assigning to "{ROLES.find(r => r.key === activeSlot)?.label}"
                  </span>
                )}
              </label>

              {result.fields.map(field => {
                const assigned = slotFor(field);
                const highlightable = !!activeSlot;
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => handleFieldClick(field)}
                    disabled={!activeSlot && !assigned}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      assigned
                        ? `${ROLE_BG[assigned]} ring-1`
                        : highlightable
                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 cursor-pointer'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 cursor-default opacity-80'
                    }`}
                  >
                    {/* Type icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {field.isProbablyNumeric ? (
                        <BarChart2 className={`w-4 h-4 ${assigned === 'data' ? 'text-green-500' : 'text-slate-400'}`} />
                      ) : field.isProbablyTime ? (
                        <Clock className={`w-4 h-4 ${assigned === 'timestamp' ? 'text-amber-500' : 'text-slate-400'}`} />
                      ) : (
                        <Tag className={`w-4 h-4 ${assigned ? ROLE_TEXT[assigned] : 'text-slate-400'}`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{field.key}</span>
                        {assigned && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[assigned]}`}>
                            {ROLES.find(r => r.key === assigned)?.label}
                          </span>
                        )}
                        {!assigned && field.isProbablyDiscriminator && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-500 dark:text-purple-400">low cardinality</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {field.sampleValues.map(v => (
                          <span key={v} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-mono rounded">
                            {v}
                          </span>
                        ))}
                        {field.uniqueValueCount > field.sampleValues.length && (
                          <span className="text-[11px] text-slate-400 self-center">
                            +{field.uniqueValueCount - field.sampleValues.length} more
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="flex-shrink-0 self-center text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">
                      {field.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Apply */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back without applying
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!assignments.sensorId}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Apply to Pull Config <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
