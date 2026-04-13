import React, { useState, useMemo } from 'react';
import {
  useAllOrganizations,
  useCreateOrganization,
  useUpdateOrganizationById,
  useOrgUsers,
  useCreateUser,
  useUpdateUser,
} from '../hooks/useOrganization';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import type { Organization, OrgUser } from '../types';

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:    () => <Icon d="M12 5v14M5 12h14" />,
  Edit:    () => <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />,
  Users:   () => <Icon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  Toggle:  () => <Icon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  Search:  () => <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
  Close:   () => <Icon d="M6 18L18 6M6 6l12 12" />,
  Org:     () => <Icon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
};

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent
      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-600/30 text-white'
      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${accent ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>{label}</p>
      <p className={`text-3xl font-bold ${accent ? 'text-white' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>{sub}</p>}
    </div>
  );
}

// ── Org Form Fields (create + edit) ───────────────────────────────────────────
interface OrgFormValues {
  name: string;
  slug: string;
  rateLimitRpm: string;
  rawRetentionDays: string;
  isActive: boolean;
}
const defaultForm = (): OrgFormValues => ({ name: '', slug: '', rateLimitRpm: '10000', rawRetentionDays: '', isActive: true });

function OrgForm({
  values,
  onChange,
  showActive = false,
  autoSlug = true,
}: {
  values: OrgFormValues;
  onChange: (v: OrgFormValues) => void;
  showActive?: boolean;
  autoSlug?: boolean;
}) {
  const set = (k: keyof OrgFormValues, v: string | boolean) => onChange({ ...values, [k]: v });
  const handleName = (v: string) => {
    set('name', v);
    if (autoSlug) onChange({ ...values, name: v, slug: v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name <span className="text-red-500">*</span></label>
        <input className="input" placeholder="Acme Corp" value={values.name} onChange={e => handleName(e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Slug <span className="text-red-500">*</span></label>
        <input
          className="input font-mono"
          placeholder="acme-corp"
          value={values.slug}
          onChange={e => set('slug', e.target.value)}
          required
          pattern="[a-z0-9-]+"
          title="Lowercase letters, numbers, and hyphens only"
        />
        <p className="mt-1 text-xs text-slate-400">Lowercase letters, numbers, and hyphens only</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Rate limit (rpm)</label>
          <input className="input" type="number" min={1} value={values.rateLimitRpm} onChange={e => set('rateLimitRpm', e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Raw retention (days)</label>
          <input className="input" type="number" min={1} placeholder="Unlimited" value={values.rawRetentionDays} onChange={e => set('rawRetentionDays', e.target.value)} />
        </div>
      </div>
      {showActive && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => set('isActive', !values.isActive)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${values.isActive ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${values.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm text-slate-700 dark:text-slate-200">{values.isActive ? 'Active' : 'Inactive'}</span>
        </div>
      )}
    </div>
  );
}

// ── Members Panel ─────────────────────────────────────────────────────────────
function MembersPanel({ org }: { org: Organization }) {
  const { data: users = [], isLoading } = useOrgUsers(org.id);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('USER');
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editActive, setEditActive] = useState(true);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await createUser.mutateAsync({ orgId: org.id, email, password, role });
    setEmail(''); setPassword(''); setRole('USER'); setAddOpen(false);
  };

  const openEdit = (u: OrgUser) => { setEditUser(u); setEditRole(u.role); setEditActive(u.isActive); };
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    await updateUser.mutateAsync({ userId: editUser.id, currentOrgId: org.id, role: editRole, isActive: editActive });
    setEditUser(null);
  };

  const roles = ['ADMIN', 'USER', 'VIEWER'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Members <span className="ml-1 text-xs font-normal text-slate-400">({users.length})</span>
        </p>
        <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3">
          <Icons.Plus /> Add Member
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4 italic">No members yet</p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="table-th">Email</th>
                <th className="table-th">Role</th>
                <th className="table-th">Status</th>
                <th className="table-th">Joined</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="table-row">
                  <td className="table-td font-medium text-slate-800 dark:text-slate-100">{u.email}</td>
                  <td className="table-td">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {u.role}
                    </span>
                  </td>
                  <td className="table-td"><Badge value={u.isActive} /></td>
                  <td className="table-td text-slate-400 text-xs">{formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}</td>
                  <td className="table-td">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Edit member"
                    >
                      <Icons.Edit />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add member modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`Add Member — ${org.name}`}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="user@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Password <span className="text-red-500">*</span></label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 8 characters" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {createUser.error && (
            <p className="text-sm text-red-600">{(createUser.error as any)?.response?.data?.message ?? 'Failed to add member'}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createUser.isPending} className="btn-primary">{createUser.isPending ? 'Adding…' : 'Add Member'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit member modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit — ${editUser?.email}`}>
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Role</label>
            <select className="input" value={editRole} onChange={e => setEditRole(e.target.value)}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditActive(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editActive ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-200">{editActive ? 'Active' : 'Inactive'}</span>
          </div>
          {updateUser.error && (
            <p className="text-sm text-red-600">{(updateUser.error as any)?.response?.data?.message ?? 'Failed to update member'}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditUser(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateUser.isPending} className="btn-primary">{updateUser.isPending ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Org Row ────────────────────────────────────────────────────────────────────
function OrgRow({ org }: { org: Organization }) {
  const updateOrg = useUpdateOrganizationById();
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [form, setForm] = useState<OrgFormValues>({
    name: org.name,
    slug: org.slug,
    rateLimitRpm: String(org.rateLimitRpm),
    rawRetentionDays: org.rawRetentionDays != null ? String(org.rawRetentionDays) : '',
    isActive: org.isActive,
  });

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateOrg.mutateAsync({
      id: org.id,
      name: form.name.trim(),
      slug: form.slug.trim(),
      rateLimitRpm: parseInt(form.rateLimitRpm, 10),
      rawRetentionDays: form.rawRetentionDays !== '' ? parseInt(form.rawRetentionDays, 10) : null,
      isActive: form.isActive,
    });
    setEditOpen(false);
  };

  const handleToggleActive = async () => {
    await updateOrg.mutateAsync({ id: org.id, isActive: !org.isActive });
    setConfirmToggle(false);
  };

  return (
    <>
      <tr className="table-row group">
        <td className="table-td">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold shadow">
              {org.name[0]?.toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">{org.name}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">{org.id}</p>
            </div>
          </div>
        </td>
        <td className="table-td font-mono text-xs text-slate-500 dark:text-slate-400">{org.slug}</td>
        <td className="table-td text-slate-500 dark:text-slate-400 tabular-nums">{org.rateLimitRpm.toLocaleString()}/min</td>
        <td className="table-td text-slate-500 dark:text-slate-400">{org.rawRetentionDays != null ? `${org.rawRetentionDays}d` : <span className="text-slate-300 dark:text-slate-600">∞</span>}</td>
        <td className="table-td"><Badge value={org.isActive} /></td>
        <td className="table-td text-slate-400 text-xs">{formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}</td>
        <td className="table-td">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Edit */}
            <button
              onClick={() => { setForm({ name: org.name, slug: org.slug, rateLimitRpm: String(org.rateLimitRpm), rawRetentionDays: org.rawRetentionDays != null ? String(org.rawRetentionDays) : '', isActive: org.isActive }); setEditOpen(true); }}
              title="Edit organization"
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Icons.Edit />
            </button>
            {/* Members */}
            <button
              onClick={() => setMembersOpen(true)}
              title="Manage members"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Icons.Users />
            </button>
            {/* Activate / Deactivate */}
            <button
              onClick={() => setConfirmToggle(true)}
              disabled={updateOrg.isPending}
              title={org.isActive ? 'Deactivate' : 'Activate'}
              className={`p-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${org.isActive ? 'text-slate-400 hover:text-red-500 dark:hover:text-red-400' : 'text-slate-400 hover:text-green-600 dark:hover:text-green-400'}`}
            >
              <Icons.Toggle />
            </button>
          </div>
        </td>
      </tr>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${org.name}`} width="max-w-xl">
        <form onSubmit={handleEdit} className="space-y-5">
          <OrgForm values={form} onChange={setForm} showActive autoSlug={false} />
          {updateOrg.error && (
            <p className="text-sm text-red-600">{(updateOrg.error as any)?.response?.data?.message ?? 'Failed to update organization'}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateOrg.isPending} className="btn-primary">{updateOrg.isPending ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* Members drawer modal */}
      <Modal open={membersOpen} onClose={() => setMembersOpen(false)} title={`Members — ${org.name}`} width="max-w-3xl">
        <MembersPanel org={org} />
      </Modal>

      {/* Activate / Deactivate confirm */}
      <ConfirmDialog
        open={confirmToggle}
        onClose={() => setConfirmToggle(false)}
        onConfirm={handleToggleActive}
        title={org.isActive ? 'Deactivate Organization' : 'Activate Organization'}
        description={org.isActive
          ? `Are you sure you want to deactivate "${org.name}"? Users in this organization will lose access.`
          : `Reactivate "${org.name}"? Users will regain access immediately.`}
        confirmLabel={org.isActive ? 'Deactivate' : 'Activate'}
        danger={org.isActive}
        loading={updateOrg.isPending}
      />
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function OrganizationsPage() {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const createOrg = useCreateOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [form, setForm] = useState<OrgFormValues>(defaultForm());

  const filtered = useMemo(() => {
    let list = orgs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
    }
    if (statusFilter === 'active')   list = list.filter(o => o.isActive);
    if (statusFilter === 'inactive') list = list.filter(o => !o.isActive);
    return list;
  }, [orgs, search, statusFilter]);

  const pg = usePagination(filtered);
  const active = orgs.filter(o => o.isActive).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createOrg.mutateAsync({
      name: form.name.trim(),
      slug: form.slug.trim(),
      rateLimitRpm: parseInt(form.rateLimitRpm, 10),
      rawRetentionDays: form.rawRetentionDays !== '' ? parseInt(form.rawRetentionDays, 10) : null,
    });
    setCreateOpen(false);
    setForm(defaultForm());
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total" value={orgs.length} accent />
        <StatCard label="Active" value={active} sub={`${orgs.length > 0 ? Math.round((active / orgs.length) * 100) : 0}% of total`} />
        <StatCard label="Inactive" value={orgs.length - active} />
        <StatCard label="Avg rate limit" value={orgs.length ? `${Math.round(orgs.reduce((s, o) => s + o.rateLimitRpm, 0) / orgs.length).toLocaleString()}/min` : '—'} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
            <input
              className="input pl-9 w-52"
              placeholder="Search orgs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <Icons.Close />
              </button>
            )}
          </div>
          {/* Status filter */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-400">{pg.total} result{pg.total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setForm(defaultForm()); setCreateOpen(true); }} className="btn-primary flex items-center gap-2">
          <Icons.Plus /> New Organization
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={search ? 'No matching organizations' : 'No organizations'}
            description={search ? 'Try adjusting your search or filter.' : 'Create the first organization to get started.'}
            action={!search ? (
              <button onClick={() => { setForm(defaultForm()); setCreateOpen(true); }} className="btn-primary flex items-center gap-2">
                <Icons.Plus /> New Organization
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Organization</th>
                <th className="table-th">Slug</th>
                <th className="table-th">Rate Limit</th>
                <th className="table-th">Retention</th>
                <th className="table-th">Status</th>
                <th className="table-th">Created</th>
                <th className="table-th w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(org => <OrgRow key={org.id} org={org} />)}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Organization" width="max-w-xl">
        <form onSubmit={handleCreate} className="space-y-5">
          <OrgForm values={form} onChange={setForm} />
          {createOrg.error && (
            <p className="text-sm text-red-600">{(createOrg.error as any)?.response?.data?.message ?? 'Failed to create organization'}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createOrg.isPending} className="btn-primary">{createOrg.isPending ? 'Creating…' : 'Create Organization'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
