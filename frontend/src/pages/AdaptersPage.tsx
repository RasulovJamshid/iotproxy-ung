import { useState } from 'react';
import { Settings, Plug, Download, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useSites } from '../hooks/useSites';
import { useAdapter, useTriggerPull } from '../hooks/useAdapters';
import { InboundConfigForm } from '../components/adapters/InboundConfigForm';
import { PullConfigForm } from '../components/adapters/PullConfigForm';

export function AdaptersPage() {
  const { data: sites, isLoading: sitesLoading } = useSites();
  const [selectedSiteId, setSelectedSiteId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'inbound' | 'pull'>('inbound');

  const { data: adapter, isLoading: adapterLoading } = useAdapter(selectedSiteId);
  const triggerPull = useTriggerPull();

  const handleTriggerPull = async () => {
    if (!selectedSiteId) return;
    try {
      await triggerPull.mutateAsync(selectedSiteId);
      alert('Pull triggered successfully');
    } catch (err) {
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Site Data Adapters
        </h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Configure how data is normalized from each site (inbound push) and how to pull data from site APIs
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

      {selectedSiteId && (
        <>
          {/* Status card */}
          {adapter && (
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
                <div className="mt-4">
                  <button
                    onClick={handleTriggerPull}
                    disabled={triggerPull.isPending}
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {triggerPull.isPending ? 'Triggering...' : 'Trigger Pull Now'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white dark:bg-slate-900/90 rounded-lg shadow sm:ring-1 ring-slate-200/80 dark:ring-slate-800/80">
            <div className="border-b border-gray-200 dark:border-slate-800">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('inbound')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'inbound'
                      ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Plug className="w-4 h-4" />
                    Inbound Mapping
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('pull')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'pull'
                      ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Pull Configuration
                  </div>
                </button>
              </nav>
            </div>

            <div className="p-6">
              {adapterLoading ? (
                <div className="text-center text-gray-500 dark:text-slate-400 py-8">Loading adapter...</div>
              ) : activeTab === 'inbound' ? (
                <InboundConfigForm siteId={selectedSiteId} adapter={adapter} />
              ) : (
                <PullConfigForm siteId={selectedSiteId} adapter={adapter} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
