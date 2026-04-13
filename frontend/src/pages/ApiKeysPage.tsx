import React, { useState } from 'react';
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useRevokeApiKey, useDeleteApiKey } from '../hooks/useApiKeys';
import { useSites, useOrgSites } from '../hooks/useSites';
import { useAllOrganizations } from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import type { ApiKey } from '../types';

const PERMISSIONS = ['ingest', 'read', 'admin'];

// ── Scope builder ────────────────────────────────────────────────────────────

interface ScopePair { orgId: string; siteId?: string }

interface ScopeBuilderProps {
  isSysAdmin: boolean;
  myOrgId: string;
  scopeType: string;
  onScopeTypeChange: (t: string) => void;
  scopes: ScopePair[];
  onScopesChange: (s: ScopePair[]) => void;
}

function ScopeBuilder({ isSysAdmin, myOrgId, scopeType, onScopeTypeChange, scopes, onScopesChange }: ScopeBuilderProps) {
  const { data: allOrgs } = useAllOrganizations();
  const { data: ownSites } = useSites();

  const [pickerOrgId, setPickerOrgId] = useState('');
  const [pickerSiteId, setPickerSiteId] = useState('');

  // For SYSTEM_ADMIN: load sites for the selected org dynamically
  const { data: orgSites } = useOrgSites(isSysAdmin ? pickerOrgId : undefined);
  const sitesForPicker = isSysAdmin ? (orgSites ?? []) : (ownSites ?? []);

  const removeScope = (idx: number) => onScopesChange(scopes.filter((_, i) => i !== idx));

  const addScope = () => {
    // For regular ADMIN, org is always their own org
    const effectiveOrgId = isSysAdmin ? pickerOrgId : myOrgId;
    if (!effectiveOrgId) return;
    const entry: ScopePair = { orgId: effectiveOrgId, siteId: pickerSiteId || undefined };
    // Avoid duplicates
    const already = scopes.some(
      (s) => s.orgId === entry.orgId && (s.siteId ?? '') === (entry.siteId ?? ''),
    );
    if (!already) onScopesChange([...scopes, entry]);
    setPickerOrgId('');
    setPickerSiteId('');
  };

  const getOrgName = (id: string) => allOrgs?.find((o) => o.id === id)?.name ?? id;
  const getSiteName = (id: string) => ownSites?.find((s) => s.id === id)?.name ?? id;

  // Options depend on role:
  // SYSTEM_ADMIN: GLOBAL | ORGS | SITES
  // ADMIN/others: ORGS (their org only, rendered as "All sites") | SITES
  const scopeOptions = isSysAdmin
    ? [
        { value: 'GLOBAL', label: 'Global — all organizations and their sites' },
        { value: 'ORGS', label: 'Organizations — all sites within selected organizations' },
        { value: 'SITES', label: 'Sites — specific sites within selected organizations' },
      ]
    : [
        { value: 'ORGS', label: 'All sites in this organization' },
        { value: 'SITES', label: 'Specific sites in this organization' },
      ];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {scopeOptions.map((opt) => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="scopeType"
              value={opt.value}
              checked={scopeType === opt.value}
              onChange={() => { onScopeTypeChange(opt.value); onScopesChange([]); }}
              className="mt-0.5"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
          </label>
        ))}
      </div>

      {/* Picker for ORGS or SITES */}
      {(scopeType === 'ORGS' || scopeType === 'SITES') && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
          {/* Already-added entries */}
          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {scopes.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                >
                  {isSysAdmin ? getOrgName(s.orgId) : ''}
                  {s.siteId ? (isSysAdmin ? ' / ' : '') + getSiteName(s.siteId) : (scopeType === 'ORGS' ? ' (all sites)' : '')}
                  <button
                    type="button"
                    onClick={() => removeScope(i)}
                    className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Picker row */}
          <div className="flex gap-2 items-end">
            {isSysAdmin && (
              <div className="flex-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Organization</label>
                <select
                  className="input text-sm py-1.5"
                  value={pickerOrgId}
                  onChange={(e) => { setPickerOrgId(e.target.value); setPickerSiteId(''); }}
                >
                  <option value="">Select org…</option>
                  {allOrgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}

            {scopeType === 'SITES' && (
              <div className="flex-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Site</label>
                <select
                  className="input text-sm py-1.5"
                  value={pickerSiteId}
                  onChange={(e) => setPickerSiteId(e.target.value)}
                  disabled={isSysAdmin && !pickerOrgId}
                >
                  <option value="">Select site…</option>
                  {sitesForPicker.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={addScope}
              disabled={isSysAdmin ? !pickerOrgId : scopeType === 'SITES' && !pickerSiteId}
              className="btn-secondary text-sm py-1.5 px-3 whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scope summary (for table cell) ───────────────────────────────────────────

function ScopeSummary({ apiKey, sites, orgs }: { apiKey: ApiKey; sites: any[]; orgs: any[] }) {
  if (apiKey.scopeType === 'GLOBAL') return <span className="tag">Global</span>;

  if (apiKey.scopes?.length) {
    const orgOnly = apiKey.scopes.filter((s) => !s.siteId);
    const siteOnly = apiKey.scopes.filter((s) => s.siteId);

    if (apiKey.scopeType === 'ORGS') {
      if (orgOnly.length === 1) {
        const name = orgs.find((o) => o.id === orgOnly[0].orgId)?.name ?? orgOnly[0].orgId;
        return <span>{name} (all sites)</span>;
      }
      return <span>{orgOnly.length} orgs</span>;
    }

    if (siteOnly.length === 1) {
      const name = sites.find((s) => s.id === siteOnly[0].siteId)?.name ?? siteOnly[0].siteId;
      return <span>{name}</span>;
    }
    return <span>{siteOnly.length} sites</span>;
  }

  // Legacy
  if (apiKey.siteId) {
    const site = sites.find((s) => s.id === apiKey.siteId);
    return <span>{site?.name ?? apiKey.siteId}</span>;
  }

  return <span>All sites</span>;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const { user } = useAuth();
  const isSysAdmin = user?.role === 'SYSTEM_ADMIN';

  const { data: keys, isLoading } = useApiKeys();
  const { data: sites = [] } = useSites();
  const { data: orgs = [] } = useAllOrganizations();
  const create = useCreateApiKey();
  const update = useUpdateApiKey();
  const revoke = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState('ORGS');
  const [scopes, setScopes] = useState<ScopePair[]>([]);
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

  const resetCreate = () => {
    setName(''); setScopeType('ORGS'); setScopes([]); setPerms(['ingest']); setWebsocketEnabled(true); setExpiresAt('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build payload based on scope type
    let payload: Parameters<typeof create.mutateAsync>[0] = {
      name,
      scopeType,
      permissions: perms,
      websocketEnabled,
      expiresAt: expiresAt || undefined,
    };

    if (scopeType === 'GLOBAL') {
      // no scopes needed
    } else if (scopes.length > 0) {
      payload.scopes = scopes;
    }
    // If ORGS/SITES with no scopes picked by non-sysadmin, fallback: org-wide via legacy siteId=undefined

    const result = await create.mutateAsync(payload);
    setCreateOpen(false);
    setNewKey(result.key!);
    resetCreate();
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
                <th className="table-th">Scope</th>
                <th className="table-th">Expires</th>
                <th className="table-th">Last Used</th>
                <th className="table-th">Status</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((key) => {
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
                    <td className="table-td text-slate-500 dark:text-slate-400 text-sm">
                      <ScopeSummary apiKey={key} sites={sites} orgs={orgs} />
                    </td>
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
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetCreate(); }} title="Generate API Key">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Production Device Gateway" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Scope</label>
            <ScopeBuilder
              isSysAdmin={isSysAdmin}
              myOrgId={user?.organizationId ?? ''}
              scopeType={scopeType}
              onScopeTypeChange={setScopeType}
              scopes={scopes}
              onScopesChange={setScopes}
            />
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
            <button type="button" onClick={() => { setCreateOpen(false); resetCreate(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              {create.isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal — scope is not editable after creation; recreate to change scope */}
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
          {editKey && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Scope: <strong>{editKey.scopeType ?? 'SITES'}</strong>
              {editKey.scopes?.length ? ` (${editKey.scopes.length} entries)` : editKey.siteId ? ' (single site)' : ' (all sites)'}
              {' '}— to change scope, delete and recreate this key.
            </p>
          )}
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
