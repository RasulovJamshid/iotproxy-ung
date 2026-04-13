import React, { useState, useMemo } from 'react';
import {
  useOrgUsers, useCreateUser, useUpdateUser, useAllOrganizations,
  useUserMemberships, useAddMembership, useUpdateMembership, useRemoveMembership,
} from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import type { OrgUser } from '../types';

const ROLES = ['VIEWER', 'USER', 'ADMIN'];
const ALL_ROLES = [...ROLES, 'SYSTEM_ADMIN'];

// ── Icons ──────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:    () => <Icon d="M12 5v14M5 12h14" />,
  Edit:    () => <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />,
  Trash:   () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />,
  Toggle:  () => <Icon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  Search:  () => <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
  Close:   () => <Icon d="M6 18L18 6M6 6l12 12" />,
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

// ── Membership panel (only shown for SYSTEM_ADMIN) ────────────────────────────
function MembershipPanel({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { data: allOrgs } = useAllOrganizations();
  const { data: memberships, isLoading } = useUserMemberships(userId);
  const addMembership = useAddMembership();
  const updateMembership = useUpdateMembership();
  const removeMembership = useRemoveMembership();

  const [addOrgId, setAddOrgId] = useState('');
  const [addRole, setAddRole] = useState('USER');

  const assignedOrgIds = new Set(memberships?.map((m) => m.org.id) ?? []);
  const availableOrgs = allOrgs?.filter((o) => !assignedOrgIds.has(o.id)) ?? [];

  const handleAdd = async () => {
    if (!addOrgId) return;
    await addMembership.mutateAsync({ userId, orgId: addOrgId, role: addRole });
    setAddOrgId('');
    setAddRole('USER');
  };

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Organization memberships</p>

      {isLoading ? (
        <p className="text-xs text-slate-400 py-2">Loading…</p>
      ) : !memberships?.length ? (
        <p className="text-xs text-slate-400 py-2">No org memberships yet.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {memberships.map(({ org, role }) => (
            <div key={org.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{org.name}</span>
              {!isSelf ? (
                <select
                  className="input py-0.5 text-xs w-28"
                  value={role}
                  onChange={(e) => updateMembership.mutate({ userId, orgId: org.id, role: e.target.value })}
                  disabled={updateMembership.isPending}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <span className="text-xs text-slate-500">{role}</span>
              )}
              {!isSelf && (
                <button
                  type="button"
                  onClick={() => removeMembership.mutate({ userId, orgId: org.id })}
                  disabled={removeMembership.isPending}
                  className="text-red-400 hover:text-red-600 disabled:opacity-40 flex-shrink-0 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  title="Remove from org"
                >
                  <Icons.Trash />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isSelf && availableOrgs.length > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <select
            className="input py-1 text-xs flex-1"
            value={addOrgId}
            onChange={(e) => setAddOrgId(e.target.value)}
          >
            <option value="">Add to organization…</option>
            {availableOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select
            className="input py-1 text-xs w-24"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!addOrgId || addMembership.isPending}
            className="btn-primary py-1 text-xs disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── User Row ────────────────────────────────────────────────────────────────────
function UserRow({
  user: u,
  me,
  isAdmin,
  isSysAdmin,
  orgName,
  onEdit,
}: {
  user: OrgUser;
  me: any;
  isAdmin: boolean;
  isSysAdmin: boolean;
  orgName: (id: string) => string;
  onEdit: (u: OrgUser) => void;
}) {
  const updateUser = useUpdateUser();
  const [confirmToggle, setConfirmToggle] = useState(false);

  const handleToggleActive = async () => {
    await updateUser.mutateAsync({ userId: u.id, currentOrgId: u.organizationId, isActive: !u.isActive });
    setConfirmToggle(false);
  };

  return (
    <>
      <tr className="table-row group">
        <td className="table-td">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300 flex-shrink-0 shadow">
              {u.email[0]}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">{u.email}</span>
                {u.id === me?.id && (
                  <span className="rounded bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-500/20">
                    You
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">{u.id}</p>
            </div>
          </div>
        </td>
        <td className="table-td">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            {u.role}
          </span>
        </td>
        {isSysAdmin && (
          <td className="table-td text-sm text-slate-500 dark:text-slate-400">{orgName(u.organizationId)}</td>
        )}
        <td className="table-td"><Badge value={u.isActive} /></td>
        <td className="table-td text-slate-400 text-xs">
          {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
        </td>
        <td className="table-td">
          {isAdmin && (
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(u)}
                title="Edit user"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                <Icons.Edit />
              </button>
              {u.id !== me?.id && (
                <button
                  onClick={() => setConfirmToggle(true)}
                  disabled={updateUser.isPending}
                  title={u.isActive ? 'Deactivate' : 'Activate'}
                  className={`p-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${u.isActive ? 'text-slate-400 hover:text-red-500 dark:hover:text-red-400' : 'text-slate-400 hover:text-green-600 dark:hover:text-green-400'}`}
                >
                  <Icons.Toggle />
                </button>
              )}
            </div>
          )}
        </td>
      </tr>

      {/* Activate / Deactivate confirm */}
      <ConfirmDialog
        open={confirmToggle}
        onClose={() => setConfirmToggle(false)}
        onConfirm={handleToggleActive}
        title={u.isActive ? 'Deactivate User' : 'Activate User'}
        description={u.isActive
          ? `Are you sure you want to deactivate ${u.email}? They will immediately lose access.`
          : `Reactivate ${u.email}? They will regain access immediately.`}
        confirmLabel={u.isActive ? 'Deactivate' : 'Activate'}
        danger={u.isActive}
        loading={updateUser.isPending}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuth();
  const isSysAdmin = me?.role === 'SYSTEM_ADMIN';
  const isAdmin = me?.role === 'ADMIN' || isSysAdmin;

  const { data: allOrgs } = useAllOrganizations();
  const [viewOrgId, setViewOrgId] = useState<string>(me?.organizationId ?? '');

  const { data: users = [], isLoading } = useOrgUsers(viewOrgId || undefined);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  
  // ── Filters & Search ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filteredUsers = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.email.toLowerCase().includes(q));
    }
    if (statusFilter === 'active')   list = list.filter(u => u.isActive);
    if (statusFilter === 'inactive') list = list.filter(u => !u.isActive);
    return list;
  }, [users, search, statusFilter]);

  const pg = usePagination(filteredUsers);
  
  const activeCount = users.filter(u => u.isActive).length;
  const adminCount = users.filter(u => u.role === 'ADMIN' || u.role === 'SYSTEM_ADMIN').length;

  // ── Create state ──────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [createOrgId, setCreateOrgId] = useState(me?.organizationId ?? '');

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const openEdit = (u: OrgUser) => {
    setEditUser(u);
    setEditEmail(u.email);
    setEditPassword('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createUser.mutateAsync({
      email: newEmail,
      password: newPassword,
      role: newRole,
      orgId: isSysAdmin ? createOrgId : undefined,
    });
    setCreateOpen(false);
    setNewEmail(''); setNewPassword(''); setNewRole('USER');
    setCreateOrgId(me?.organizationId ?? '');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    await updateUser.mutateAsync({
      userId: editUser.id,
      currentOrgId: editUser.organizationId,
      email: editEmail !== editUser.email ? editEmail : undefined,
      password: editPassword || undefined,
    });
    setEditUser(null);
  };

  const orgName = (orgId: string) => allOrgs?.find((o) => o.id === orgId)?.name ?? orgId.slice(0, 8) + '…';

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      
      {/* Scope Header (System Admin only) */}
      {isSysAdmin && allOrgs && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Context</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Viewing users for organization:</p>
          </div>
          <select
            className="input w-full sm:w-72 font-medium"
            value={viewOrgId}
            onChange={(e) => setViewOrgId(e.target.value)}
          >
            <option value="">-- All (Fallback) --</option>
            {allOrgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={users.length} accent />
        <StatCard label="Active" value={activeCount} sub={`${users.length > 0 ? Math.round((activeCount / users.length) * 100) : 0}% of total`} />
        <StatCard label="Inactive" value={users.length - activeCount} />
        <StatCard label="Admins" value={adminCount} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icons.Search /></span>
            <input
              className="input pl-9 w-52"
              placeholder="Search users…"
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
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Icons.Plus /> Invite User
          </button>
        )}
      </div>

      {/* Table */}
      {filteredUsers.length === 0 ? (
        <div className="card">
          <EmptyState
            title={search ? 'No matching users' : 'No users yet'}
            description={search ? 'Try adjusting your search or filter.' : 'Invite team members to collaborate.'}
            action={!search && isAdmin ? (
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
                <Icons.Plus /> Invite User
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Role</th>
                {isSysAdmin && <th className="table-th">Organization</th>}
                <th className="table-th">Status</th>
                <th className="table-th">Joined</th>
                <th className="table-th w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  me={me}
                  isAdmin={isAdmin}
                  isSysAdmin={isSysAdmin}
                  orgName={orgName}
                  onEdit={openEdit}
                />
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Invite User" width="max-w-md">
        <form onSubmit={handleCreate} className="space-y-4">
          {isSysAdmin && allOrgs && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Organization <span className="text-red-500">*</span>
              </label>
              <select className="input" value={createOrgId} onChange={(e) => setCreateOrgId(e.target.value)} required>
                {allOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input className="input" type="email" placeholder="user@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <input className="input" type="password" placeholder="Temporary password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Role</label>
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {(isSysAdmin ? ALL_ROLES : ROLES).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {createUser.error && (
            <p className="text-sm text-red-600">{(createUser.error as any)?.response?.data?.message ?? 'Failed to create user'}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createUser.isPending} className="btn-primary">
              {createUser.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit User — ${editUser?.email}`} width="max-w-lg">
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input className="input" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              New password
              <span className="ml-1 text-xs font-normal text-slate-400">(leave blank to keep current)</span>
            </label>
            <input className="input" type="password" placeholder="••••••••" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} minLength={8} />
          </div>

          {isSysAdmin && editUser && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mt-5">
              <MembershipPanel userId={editUser.id} isSelf={editUser.id === me?.id && !isSysAdmin} />
            </div>
          )}

          {updateUser.error && (
            <p className="text-sm text-red-600">{(updateUser.error as any)?.response?.data?.message ?? 'Failed to update user'}</p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
            <button type="button" onClick={() => setEditUser(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateUser.isPending} className="btn-primary">
              {updateUser.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
