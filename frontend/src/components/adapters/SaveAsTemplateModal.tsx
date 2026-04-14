import { useState, useEffect } from 'react';
import { BookTemplate, X } from 'lucide-react';
import { useSaveAsTemplate } from '../../hooks/useAdapterTemplates';

interface Props {
  siteId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SaveAsTemplateModal({ siteId, onClose, onSuccess }: Props) {
  const [name, setName]       = useState('');
  const [description, setDesc] = useState('');
  const [saved, setSaved]      = useState(false);

  const save = useSaveAsTemplate();

  useEffect(() => {
    // Scroll modal into view when it opens
    setTimeout(() => {
      const modal = document.querySelector('[data-modal="save-template"]');
      if (modal) {
        modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await save.mutateAsync({ siteId, name: name.trim(), description: description.trim() || undefined });
    setSaved(true);
    setTimeout(() => {
      onClose();
      onSuccess?.();
    }, 1200);
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        data-modal="save-template"
        className="w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookTemplate className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Save as Template</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {saved ? (
          <div className="px-6 py-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Template saved!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The current adapter configuration (mappings, request shape, and auth type) will be saved as a reusable template.
              <br /><strong>Credential values are never stored in templates.</strong>
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Template name *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g. Acme IoT Platform v2"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Description <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDesc(e.target.value)}
                rows={2}
                placeholder="Brief notes about what API or device format this template matches"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || save.isPending}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                <BookTemplate className="w-4 h-4" />
                {save.isPending ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
