import React from 'react';
import { Link } from 'react-router-dom';
import { useSites } from '../hooks/useSites';
import { useSensors } from '../hooks/useSensors';
import { useAlertEvents } from '../hooks/useAlerts';
import { useHealth } from '../hooks/useHealth';
import { Badge } from '../components/ui/Badge';
import { PageSpinner } from '../components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

import { useTheme } from '../contexts/ThemeContext';

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type StatCardProps = {
  label: string;
  value: string | number;
  sub: string;
  to?: string;
  icon: React.ReactNode;
  accent: string;
  delayClass?: string;
};

function StatCard({ label, value, sub, to, icon, accent, delayClass = '' }: StatCardProps) {
  const inner = (
    <div className={`card-flush h-full flex items-start gap-4 transition-all duration-300 group relative p-5 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(15,23,42,0.15)] dark:hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] ${delayClass}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent}`} />
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 shadow-sm border border-slate-100 dark:border-slate-700/50 transition-colors group-hover:bg-slate-100 dark:group-hover:bg-slate-800 group-hover:text-slate-700 dark:group-hover:text-slate-300">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{value}</p>
        </div>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

function SystemStatusBadge({ status }: { status: string }) {
  if (status === 'ok') return <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />OK</span>;
  if (status === 'degraded') return <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />Degraded</span>;
  return <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Error</span>;
}

function SystemStatusPanel() {
  const { data, isLoading, error } = useHealth();
  const overall = error ? 'error' : (data?.status ?? 'ok');
  const colors: Record<string, string> = { 
    ok: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/20', 
    degraded: 'border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-900/20', 
    error: 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-900/20' 
  };

  return (
    <div className={`card-flush p-5 border ${colors[overall] ?? 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">System Status</p>
        <Link to="/health" className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Details</Link>
      </div>
      {isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Checking…</p>}
      {error && <p className="text-xs text-red-500 dark:text-red-400">Backend unreachable</p>}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Database</p>
            <SystemStatusBadge status={data.checks.database} />
            {data.checks.database_latency_ms != null && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{data.checks.database_latency_ms}ms</p>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Redis</p>
            <SystemStatusBadge status={data.checks.redis} />
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Queue</p>
            <SystemStatusBadge status={data.checks.queue_depth.status} />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">{data.checks.queue_depth.depth.toLocaleString()} jobs</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const sitesQuery = useSites();
  const sensorsQuery = useSensors();
  const eventsQuery = useAlertEvents();
  const { actualTheme } = useTheme();

  if (sitesQuery.isLoading || sensorsQuery.isLoading) return <PageSpinner />;

  const siteList = sitesQuery.data ?? [];
  const sensorList = sensorsQuery.data ?? [];
  const eventList = eventsQuery.data ?? [];

  const activeSites = siteList.filter((s) => s.commissioningStatus === 'ACTIVE').length;
  const onlineSensors = sensorList.filter((s) => s.connectivityStatus === 'ONLINE').length;
  const openAlerts = eventList.filter((e) => e.state === 'FIRING').length;
  const healthLabel = openAlerts > 0 ? 'Needs attention' : 'Healthy';

  // --- Chart Data Preparation ---
  // Site Status Data
  const siteStatusCounts = siteList.reduce((acc, site) => {
    acc[site.commissioningStatus] = (acc[site.commissioningStatus] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const siteChartData = Object.entries(siteStatusCounts).map(([name, value]) => ({ name, value }));

  // Sensor Connectivity Data
  const onlineCount = onlineSensors;
  const offlineCount = sensorList.length - onlineCount;
  const sensorChartData = [
    { name: 'Online', value: onlineCount },
    { name: 'Offline', value: offlineCount }
  ].filter(d => d.value > 0);

  // Alert Severity Data
  const severityCounts = eventList.filter((e) => e.state === 'FIRING').reduce((acc, ev) => {
    acc[ev.severity] = (acc[ev.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const alertChartData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));

  // Colors
  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
  const SENSOR_COLORS = { Online: '#10b981', Offline: '#ef4444' };
  const ALERT_COLORS: Record<string, string> = { CRITICAL: '#ef4444', WARNING: '#f59e0b', INFO: '#3b82f6' };
  const chartTextColor = actualTheme === 'dark' ? '#94a3b8' : '#64748b';
  const chartGridColor = actualTheme === 'dark' ? '#334155' : '#e2e8f0';

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <section className="card-flush relative p-8 sm:p-10 bg-white/70 dark:bg-slate-900/50 overflow-hidden stagger-1 hover:shadow-lg transition-shadow duration-300">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-400/20 dark:bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 h-64 w-64 rounded-full bg-indigo-400/20 dark:bg-indigo-600/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between z-10">
          <div>
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="flex h-6 items-center rounded-full bg-blue-50 dark:bg-blue-900/40 px-2.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-500/20 dark:ring-blue-400/30">
                Network Overview
              </span>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 drop-shadow-sm">IoT Operations Snapshot</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-xl">Monitor your globally distributed sensor network, site health, and automated alerts in real-time.</p>
          </div>
          <div className="flex-shrink-0">
            <div className={`inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur-md border ${
              openAlerts > 0 ? 'bg-rose-50 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            }`}>
              <span className="relative flex h-3 w-3">
                {openAlerts > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${openAlerts > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
              </span>
              System {healthLabel}
            </div>
          </div>
        </div>
      </section>

      {/* System Status */}
      <SystemStatusPanel />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          delayClass="stagger-2"
          label="Total Sites"
          value={siteList.length}
          sub={`${activeSites} actively reporting`}
          to="/sites"
          accent="bg-gradient-to-b from-blue-400 to-blue-600"
          icon={<Icon d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />}
        />
        <StatCard
          delayClass="stagger-3"
          label="Total Sensors"
          value={sensorList.length}
          sub={`${onlineSensors} online • ${sensorList.length - onlineSensors} offline`}
          to="/sensors"
          accent="bg-gradient-to-b from-violet-400 to-violet-600"
          icon={<Icon d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />}
        />
        <StatCard
          delayClass="stagger-4"
          label="Active Alerts"
          value={openAlerts}
          sub="Requires immediate attention"
          to="/alerts"
          accent={openAlerts > 0 ? 'bg-gradient-to-b from-rose-400 to-rose-600' : 'bg-gradient-to-b from-emerald-400 to-emerald-600'}
          icon={<Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />}
        />
        <StatCard
          delayClass="stagger-5"
          label="Alert Evts (Total)"
          value={eventList.length}
          sub="System lifetime events"
          to="/alerts"
          accent="bg-gradient-to-b from-amber-400 to-amber-600"
          icon={<Icon d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
        />
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 stagger-5">
        
        {/* Sites Chart */}
        <div className="card hover-lift flex flex-col h-80">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Site Commissioning Status</p>
          <div className="flex-1 min-h-0 relative">
             {siteChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={siteChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {siteChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(val: number, name: string) => [val, name]} contentStyle={{ borderRadius: '12px', border: 'none', background: actualTheme === 'dark' ? '#1e293b' : '#fff', color: actualTheme === 'dark' ? '#f8fafc' : '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
             ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No Site Data</div>
             )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
             {siteChartData.map((entry, index) => (
               <div key={entry.name} className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                 <span>{entry.name}</span>
               </div>
             ))}
          </div>
        </div>

        {/* Sensors Chart */}
        <div className="card hover-lift flex flex-col h-80">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Sensor Connectivity</p>
          <div className="flex-1 min-h-0 relative">
             {sensorChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sensorChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {sensorChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SENSOR_COLORS[entry.name as keyof typeof SENSOR_COLORS] || COLORS[0]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', background: actualTheme === 'dark' ? '#1e293b' : '#fff', color: actualTheme === 'dark' ? '#f8fafc' : '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
             ) : (
               <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No Sensor Data</div>
             )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
             {sensorChartData.map((entry) => (
               <div key={entry.name} className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SENSOR_COLORS[entry.name as keyof typeof SENSOR_COLORS] }}></div>
                 <span>{entry.name} ({entry.value})</span>
               </div>
             ))}
          </div>
        </div>

        {/* Alerts Chart */}
        <div className="card hover-lift flex flex-col h-80">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Active Alert Severities</p>
          <div className="flex-1 min-h-0 relative">
             {alertChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alertChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: chartTextColor }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: chartTextColor }} allowDecimals={false} />
                    <RechartsTooltip cursor={{ fill: actualTheme === 'dark' ? '#334155' : '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', background: actualTheme === 'dark' ? '#1e293b' : '#fff', color: actualTheme === 'dark' ? '#f8fafc' : '#0f172a', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {alertChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={ALERT_COLORS[entry.name] || COLORS[0]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
             ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No Active Alerts</div>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 stagger-5">
        {/* Sites List */}
        <div className="card flex flex-col">
          <div className="flex flex-shrink-0 items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Featured Sites</p>
            <Link to="/sites" className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">View all</Link>
          </div>
          {siteList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12">
               <span className="text-slate-400"><Icon d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></span>
               <p className="mt-3 text-sm font-medium text-slate-400 dark:text-slate-500">No sites provisioned yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/80 dark:divide-slate-800/80 -mx-2">
              {siteList.slice(0, 5).map((site) => (
                <Link
                  key={site.id}
                  to={`/sites/${site.id}`}
                  className="flex items-center justify-between rounded-xl px-2 py-3 transition-colors hover:bg-blue-50/50 dark:hover:bg-slate-800/80 group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors group-hover:text-blue-700 dark:group-hover:text-blue-400 truncate">{site.name}</p>
                    {site.description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-sm mt-0.5">{site.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <Badge value={site.connectivityStatus} />
                    <Badge value={site.commissioningStatus} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent alert events */}
        <div className="card flex flex-col">
          <div className="flex flex-shrink-0 items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Recent Alert Events</p>
            <Link to="/alerts" className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">View all</Link>
          </div>
          {eventList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12">
               <span className="text-slate-400"><Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></span>
               <p className="mt-3 text-sm font-medium text-slate-400 dark:text-slate-500">All systems nominally operating</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/80 dark:divide-slate-800/80 -mx-2">
              {eventList.slice(0, 5).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between rounded-xl px-2 py-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/80">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge value={ev.severity} />
                      <Badge value={ev.state} />
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Reading <span className="text-slate-700 dark:text-slate-300 font-bold">{ev.value.toFixed(1)}</span> crossed threshold of <span className="text-slate-700 dark:text-slate-300 font-bold">{ev.threshold.toFixed(1)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 ml-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
