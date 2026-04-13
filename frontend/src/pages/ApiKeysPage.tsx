import React, { useState } from 'react';
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useRevokeApiKey, useDeleteApiKey } from '../hooks/useApiKeys';
import { useSites } from '../hooks/useSites';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import type { ApiKey } from '../types';

const PERMISSIONS = ['ingest', 'read', 'admin'];

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys();
  const { data: sites } = useSites();
  const create = useCreateApiKey();
  const update = useUpdateApiKey();
  const revoke = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [perms, setPerms] = useState<string[]>(['ingest']);
  const [websocketEnabled, setWebsocketEnabled] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');

  // Edit modal
  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editWebsocket, setEditWebsocket] = useState(true);
  const [editExpiresAt, setEditExpiresAt] = useState('');

  // Confirm dialogs
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const togglePerm = (p: string, current: string[], setter: (v: string[]) => void) =>
    setter(current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create.mutateAsync({
      name,
      siteId: siteId || undefined,
      permissions: perms,
      websocketEnabled,
      expiresAt: expiresAt || undefined,
    });
    setCreateOpen(false);
    setNewKey(result.key!);
    setName(''); setSiteId(''); setPerms(['ingest']); setWebsocketEnabled(true); setExpiresAt('');
  };

  const openEdit = (key: ApiKey) => {
    setEditKey(key);
    setEditName(key.name);
    setEditPerms(key.permissions ?? []);
    setEditWebsocket(key.websocketEnabled ?? true);
    setEditExpiresAt(key.expiresAt ? new Date(key.expiresAt).toISOString().slice(0, 16) : '');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKey) return;
    await update.mutateAsync({
      id: editKey.id,
      name: editName,
      permissions: editPerms,
      websocketEnabled: editWebsocket,
      expiresAt: editExpiresAt || undefined,
    });
    setEditKey(null);
  };

  const pg = usePagination(keys);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {keys?.filter((k) => !k.revokedAt).length ?? 0} active · {pg.total} total
        </p>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Generate Key
        </button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : keys?.length === 0 ? (
        <div className="card">
          <EmptyState title="No API keys" description="Generate a key to authenticate device ingest requests." />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Prefix</th>
                <th className="table-th">Permissions</th>
                <th className="table-th">WebSocket</th>
                <th className="table-th">Site</th>
                <th className="table-th">Expires</th>
                <th className="table-th">Last Used</th>
                <th className="table-th">Status</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((key) => {
                const site = sites?.find((s) => s.id === key.siteId);
                const isRevoked = !!key.revokedAt;
                return (
                  <tr key={key.id} className={`table-row ${isRevoked ? 'opacity-50' : ''}`}>
                    <td className="table-td font-medium text-slate-800 dark:text-slate-200">{key.name}</td>
                    <td className="table-td font-mono text-xs text-slate-500 dark:text-slate-400">{key.prefix}…</td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">
                        {key.permissions?.map((p) => (
                          <span key={p} className="tag">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="table-td">
                      {key.websocketEnabled
                        ? <span className="text-green-600 dark:text-green-400 text-sm">✓</span>
                        : <span className="text-slate-400 text-sm">✗</span>}
                    </td>
                    <td className="table-td text-slate-400">{site?.name ?? 'All sites'}</td>
                    <td className="table-td text-slate-400">
                      {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="table-td text-slate-400">
                      {key.lastUsedAt
                        ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td className="table-td">
                      {isRevoked
                        ? <span className="text-xs font-medium text-red-500 dark:text-red-400">Revoked</span>
                        : <span className="text-xs font-medium text-green-600 dark:text-green-400">Active</span>}
                    </td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-3">
                        {!isRevoked && (
                          <>
                            <button
                              onClick={() => openEdit(key)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setRevokeId(key.id)}
                              className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteId(key.id)}
                          className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Generate API Key">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Production Device Gateway" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Site scope (optional)</label>
            <select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">All sites in this organization</option>
              {sites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Permissions</label>
            <div className="flex gap-3">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={perms.includes(p)} onChange={() => togglePerm(p, perms, setPerms)} className="rounded border-slate-300 text-blue-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-200 capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={websocketEnabled} onChange={(e) => setWebsocketEnabled(e.target.checked)} className="rounded border-slate-300 text-blue-600" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Enable WebSocket access</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Expires at (optional)</label>
            <input className="input" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              {create.isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editKey} onClose={() => setEditKey(null)} title="Edit API Key">
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Permissions</label>
            <div className="flex gap-3">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editPerms.includes(p)} onChange={() => togglePerm(p, editPerms, setEditPerms)} className="rounded border-slate-300 text-blue-600" />
                  <span className="text-sm text-slate-700 dark:text-slate-200 capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editWebsocket} onChange={(e) => setEditWebsocket(e.target.checked)} className="rounded border-slate-300 text-blue-600" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Enable WebSocket access</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Expires at (optional)</label>
            <input className="input" type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditKey(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={update.isPending} className="btn-primary">
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Show key once after creation */}
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Save your API key">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          Copy this key now — it will <strong>not</strong> be shown again.
        </p>
        <div className="rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-green-400 break-all select-all">
          {newKey}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={() => navigator.clipboard.writeText(newKey!)} className="btn-primary">
            Copy to clipboard
          </button>
        </div>
      </Modal>

      {/* Revoke confirm */}
      <ConfirmDialog
        open={!!revokeId}
        onClose={() => setRevokeId(null)}
        onConfirm={() => { revoke.mutate(revokeId!); setRevokeId(null); }}
        title="Revoke API Key"
        description="The key will be disabled immediately. Devices using it will lose access. The record is kept for audit purposes."
        confirmLabel="Revoke"
        danger
        loading={revoke.isPending}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { deleteKey.mutate(deleteId!); setDeleteId(null); }}
        title="Delete API Key"
        description="This key will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleteKey.isPending}
      />
    </div>
  );
}
