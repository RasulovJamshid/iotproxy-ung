import React, { useEffect, useRef, useState } from 'react';
import { subscribeToSite } from '../api/ws-client';
import { formatDistanceToNow } from 'date-fns';
import type { WsReadingEvent, WsAlertEvent } from '@iotproxy/shared';

interface FeedEntry {
  type: 'reading' | 'alert';
  ts: Date;
  sensorId: string;
  data: unknown;
}

interface Props {
  siteId: string;
  filterSensorId?: string;
}

const MAX_ENTRIES = 50;

export function LiveReadingsFeed({ siteId, filterSensorId }: Props) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToSite(
      siteId,
      (ev: WsReadingEvent) => {
        if (filterSensorId && ev.sensorId !== filterSensorId) return;
        setEntries((prev) => [
          { type: 'reading', ts: new Date(ev.phenomenonTime), sensorId: ev.sensorId, data: ev.processedData },
          ...prev,
        ].slice(0, MAX_ENTRIES));
      },
      (ev: WsAlertEvent) => {
        if (filterSensorId && ev.sensorId !== filterSensorId) return;
        setEntries((prev) => [
          {
            type: 'alert',
            ts: new Date(ev.triggeredAt),
            sensorId: ev.sensorId,
            data: { rule: ev.alertRuleId, state: ev.state, severity: ev.severity },
          },
          ...prev,
        ].slice(0, MAX_ENTRIES));
      },
      setConnected,
    );

    return () => {
      unsub();
      setConnected(false);
    };
  }, [siteId, filterSensorId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries]);

  const latest = entries[0];

  return (
    <div className="card-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{connected ? 'Live stream connected' : 'Disconnected'}</span>
        <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {entries.length} event{entries.length !== 1 ? 's' : ''}
        </span>
        {latest && (
          <span className="ml-auto text-[11px] text-slate-400">
            Last update {formatDistanceToNow(latest.ts, { addSuffix: true })}
          </span>
        )}
      </div>

      <div className="h-64 overflow-y-auto rounded-xl border border-slate-800/70 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-3 font-mono text-xs shadow-inner">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-slate-500">Waiting for incoming readings…</p>
        ) : (
          entries.map((e, i) => (
            <div
              key={i}
              className={`mb-1.5 rounded-md px-2 py-1 leading-relaxed transition-colors ${
                e.type === 'alert'
                  ? 'bg-red-500/10 text-red-300'
                  : 'bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <span className="text-slate-500">{e.ts.toLocaleTimeString()} </span>
              <span className={e.type === 'alert' ? 'text-red-200' : 'text-cyan-300'}>
                [{e.type}]
              </span>
              {' '}
              <span className="text-slate-300">{e.sensorId.slice(0, 8)}…</span>
              {' '}
              {JSON.stringify(e.data)}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
