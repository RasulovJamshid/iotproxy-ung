import { useState } from 'react';
import { BookTemplate, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { AdapterTemplate } from '@iotproxy/shared';
import {
  useAdapterTemplates,
  useCreateAdapterTemplate,
  useUpdateAdapterTemplate,
  useDeleteAdapterTemplate,
  useApplyTemplate,
} from '../../hooks/useAdapterTemplates';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    blue:  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls[color] ?? cls.slate}`}>
      {children}
    </span>
  );
}

function TemplateSummary({ tpl }: { tpl: AdapterTemplate }) {
  const [open, setOpen] = useState(false);
  const hasInbound  = !!tpl.inboundMapping;
  const hasPull     = !!tpl.responseMapping;

  return (
    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-2 flex-wrap">
        {hasInbound && <Badge color="blue">Inbound mapping</Badge>}
        {hasPull    && <Badge color="green">Pull · {tpl.pullMethod} · {tpl.pullIntervalSec}s</Badge>}
        {tpl.pullAuthType !== 'none' && <Badge>Auth: {tpl.pullAuthType}</Badge>}
      </div>

      {(hasInbound || hasPull) && (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {open ? 'Hide details' : 'Show details'}
        </button>
      )}

      {open && (
        <div className="mt-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 space-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
          <pre className="whitespace-pre-wrap">{JSON.stringify(
            {
              inboundMapping:  tpl.inboundMapping,
              pullMethod:      tpl.pullMethod,
              pullAuthType:    tpl.pullAuthType,
              pullIntervalSec: tpl.pullIntervalSec,
              pullQueryParams: tpl.pullQueryParams,
              pullHeaders:     tpl.pullHeaders,
              responseMapping: tpl.responseMapping,
            },
            null, 2
          )}</pre>
        </div>
      )}
    </div>
  );
}

// ── Inline name/description editor ───────────────────────────────────────────

function TemplateCard({
  tpl,
  selectedSiteId,
  onApplied,
}: {
  tpl: AdapterTemplate;
  selectedSiteId?: string;
  onApplied?: () => void;
}) {
  const [editing, setEditing]       = useState(false);
  const [name, setName]             = useState(tpl.name);
  const [description, setDesc]      = useState(tpl.description ?? '');
  const [confirmDelete, setConfirm] = useState(false);

  const update  = useUpdateAdapterTemplate();
  const remove  = useDeleteAdapterTemplate();
  const apply   = useApplyTemplate();

  const handleSave = async () => {
    await update.mutateAsync({ id: tpl.id, data: { name, description: description || undefined } });
    setEditing(false);
  };

  const handleDelete = async () => {
    await remove.mutateAsync(tpl.id);
  };

  const handleApply = async () => {
    if (!selectedSiteId) return;
    await apply.mutateAsync({ siteId: selectedSiteId, templateId: tpl.id });
    onApplied?.();
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 space-y-2 transition-shadow hover:shadow-md">
      {editing ? (
        <div className="space-y-2">
          <input
            className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Template name"
          />
          <input
            className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={update.isPending}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setName(tpl.name); setDesc(tpl.description ?? ''); }}
              className="flex items-center gap-1 px-3 py-1 text-xs text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{tpl.name}</p>
            {tpl.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tpl.description}</p>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
              {new Date(tpl.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Rename"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={remove.isPending}
                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {remove.isPending ? '…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  className="px-2 py-1 text-xs text-slate-500 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm(true)}
                title="Delete template"
                className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <TemplateSummary tpl={tpl} />

      {selectedSiteId && (
        <div className="pt-1">
          <button
            type="button"
            onClick={handleApply}
            disabled={apply.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            {apply.isPending ? 'Applying…' : 'Apply to selected site'}
          </button>
          {apply.isSuccess && (
            <p className="text-xs text-green-600 dark:text-green-400 text-center mt-1">✓ Template applied</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  selectedSiteId?: string;
  onTemplateApplied?: () => void;
}

export function TemplatesPanel({ selectedSiteId, onTemplateApplied }: Props) {
  const { data: templates = [], isLoading } = useAdapterTemplates();
  const create = useCreateAdapterTemplate();
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newDesc, setNewDesc]     = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await create.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined });
    setNewName('');
    setNewDesc('');
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookTemplate className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Saved Templates</h3>
          {templates.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
              {templates.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(v => !v)}
          className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
        >
          <Plus className="w-3 h-3" /> New blank template
        </button>
      </div>

      {/* New blank template form */}
      {creating && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-4 space-y-3">
          <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
            Create a blank template — you can fill its mapping later by editing a site adapter and using "Save as Template".
          </p>
          <input
            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Template name *"
          />
          <input
            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || create.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> {create.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
              className="px-3 py-1.5 text-xs text-slate-500 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {isLoading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Loading templates…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <BookTemplate className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No templates yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Configure a site adapter and click <strong>Save as Template</strong> to create your first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              selectedSiteId={selectedSiteId}
              onApplied={onTemplateApplied}
            />
          ))}
        </div>
      )}
    </div>
  );
}
