import { useState, useRef } from 'react';
import { Settings, Plug, Download, AlertCircle, CheckCircle2, Clock, BookTemplate, RefreshCw } from 'lucide-react';
import { useSites } from '../hooks/useSites';
import { useAdapter, useTriggerPull } from '../hooks/useAdapters';
import { InboundConfigForm } from '../components/adapters/InboundConfigForm';
import { PullConfigForm } from '../components/adapters/PullConfigForm';
import { TemplatesPanel } from '../components/adapters/TemplatesPanel';

type Tab = 'inbound' | 'pull' | 'templates';

export function AdaptersPage() {
  const { data: sites, isLoading: sitesLoading } = useSites();
  const [selectedSiteId, setSelectedSiteId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<Tab>('inbound');

  const { data: adapter, isLoading: adapterLoading, refetch: refetchAdapter } = useAdapter(selectedSiteId);
  const triggerPull = useTriggerPull();
  const [pullStatus, setPullStatus] = useState<'idle' | 'queued' | 'polling'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleTriggerPull = async () => {
    if (!selectedSiteId) return;
    setPullStatus('queued');
    try {
      await triggerPull.mutateAsync(selectedSiteId);
      setPullStatus('polling');
      // Poll every 2 s for up to 20 s to pick up the updated pullLastAt
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        await refetchAdapter();
        if (attempts >= 10) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPullStatus('idle');
        }
      }, 2000);
    } catch (err) {
      setPullStatus('idle');
      alert('Failed to trigger pull: ' + (err as Error).message);
    }
  };

  if (sitesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-slate-400">Loading sites...</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'inbound',   label: 'Inbound Mapping',   Icon: ({ className }) => <Plug className={className} /> },
    { id: 'pull',      label: 'Pull Configuration', Icon: ({ className }) => <Download className={className} /> },
    { id: 'templates', label: 'Templates',           Icon: ({ className }) => <BookTemplate className={className} /> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Site Data Adapters
        </h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Configure how data is normalized from each site. Use <strong>Templates</strong> to reuse mappings across sites with the same API format.
        </p>
      </div>

      {/* Site selector */}
      <div className="bg-white dark:bg-slate-900/90 rounded-lg shadow sm:ring-1 ring-slate-200/80 dark:ring-slate-800/80 p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
          Select Site
        </label>
        <select
          value={selectedSiteId ?? ''}
          onChange={(e) => setSelectedSiteId(e.target.value || undefined)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="">-- Choose a site --</option>
          {sites?.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>

      {/* Status card (only when a site is selected and has an adapter) */}
      {selectedSiteId && adapter && (
        <div className="bg-white dark:bg-slate-900/90 rounded-lg shadow sm:ring-1 ring-slate-200/80 dark:ring-slate-800/80 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">Adapter Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <span className="text-sm text-gray-600 dark:text-slate-400">Inbound:</span>
              {adapter.inboundEnabled ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-400 dark:text-slate-600" />
              )}
              <span className="text-sm font-medium dark:text-slate-300">
                {adapter.inboundEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              <span className="text-sm text-gray-600 dark:text-slate-400">Pull:</span>
              {adapter.pullEnabled ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-400 dark:text-slate-600" />
              )}
              <span className="text-sm font-medium dark:text-slate-300">
                {adapter.pullEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {adapter.pullLastAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <span className="text-sm text-gray-600 dark:text-slate-400">Last pull:</span>
                <span className="text-sm font-medium dark:text-slate-300">
                  {new Date(adapter.pullLastAt).toLocaleString()}
                </span>
                {adapter.pullLastStatusCode && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    adapter.pullLastStatusCode >= 200 && adapter.pullLastStatusCode < 300
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                  }`}>
                    {adapter.pullLastStatusCode}
                  </span>
                )}
              </div>
            )}
          </div>

          {adapter.pullLastError && adapter.pullLastStatusCode && !(adapter.pullLastStatusCode >= 200 && adapter.pullLastStatusCode < 300) && (
            <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded text-sm text-red-700 dark:text-red-400">
              <strong className="dark:text-red-300">Last error:</strong> {adapter.pullLastError}
            </div>
          )}

          {adapter.pullEnabled && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleTriggerPull}
                disabled={triggerPull.isPending || pullStatus === 'polling'}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pullStatus === 'polling' ? 'animate-spin' : ''}`} />
                {pullStatus === 'queued' ? 'Queueing…' : pullStatus === 'polling' ? 'Waiting for result…' : 'Trigger Pull Now'}
              </button>
              {pullStatus === 'polling' && (
                <span className="text-xs text-slate-400 dark:text-slate-500">Checking for updates automatically…</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900/90 rounded-lg shadow sm:ring-1 ring-slate-200/80 dark:ring-slate-800/80">
        <div className="border-b border-gray-200 dark:border-slate-800">
          <nav className="flex -mb-px">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {label}
                  {id === 'templates' && (
                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                      NEW
                    </span>
                  )}
                </div>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'templates' ? (
            <TemplatesPanel
              selectedSiteId={selectedSiteId}
              onTemplateApplied={() => {
                refetchAdapter();
                setActiveTab('inbound');
              }}
            />
          ) : !selectedSiteId ? (
            <div className="text-center text-gray-500 dark:text-slate-400 py-8">
              Select a site above to configure its adapter.
            </div>
          ) : adapterLoading ? (
            <div className="text-center text-gray-500 dark:text-slate-400 py-8">Loading adapter...</div>
          ) : activeTab === 'inbound' ? (
            <InboundConfigForm siteId={selectedSiteId} adapter={adapter} />
          ) : (
            <PullConfigForm siteId={selectedSiteId} adapter={adapter} />
          )}
        </div>
      </div>
    </div>
  );
}
