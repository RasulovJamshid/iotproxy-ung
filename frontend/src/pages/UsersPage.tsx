import React, { useState } from 'react';
import { useOrgUsers, useCreateUser, useUpdateUser, useAllOrganizations } from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';
import type { OrgUser } from '../types';

const ROLES = ['VIEWER', 'USER', 'ADMIN', 'SYSTEM_ADMIN'];

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.536-6.536a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 14H9v-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    </svg>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const isSysAdmin = me?.role === 'SYSTEM_ADMIN';
  const isAdmin = me?.role === 'ADMIN' || isSysAdmin;

  const { data: allOrgs } = useAllOrganizations();
  const [viewOrgId, setViewOrgId] = useState<string>(me?.organizationId ?? '');

  const { data: users, isLoading } = useOrgUsers(viewOrgId || undefined);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const pg = usePagination(users);

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
  const [editRole, setEditRole] = useState('');
  const [editOrgId, setEditOrgId] = useState('');

  const openEdit = (u: OrgUser) => {
    setEditUser(u);
    setEditEmail(u.email);
    setEditPassword('');
    setEditRole(u.role);
    setEditOrgId(u.organizationId);
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
      role: editRole !== editUser.role ? editRole : undefined,
      organizationId: isSysAdmin && editOrgId !== editUser.organizationId ? editOrgId : undefined,
    });
    setEditUser(null);
  };

  const handleToggleActive = (u: OrgUser) => {
    updateUser.mutate({ userId: u.id, currentOrgId: u.organizationId, isActive: !u.isActive });
  };

  const orgName = (orgId: string) => allOrgs?.find((o) => o.id === orgId)?.name ?? orgId.slice(0, 8) + '…';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Members of your organization — manage roles and access here.
          </p>
          {isSysAdmin && allOrgs && (
            <select
              className="input h-8 text-sm py-0 pr-8 w-52"
              value={viewOrgId}
              onChange={(e) => setViewOrgId(e.target.value)}
            >
              {allOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <PlusIcon /> Invite User
          </button>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !users?.length ? (
        <div className="card">
          <EmptyState title="No users yet" description="Invite team members to collaborate on this organization." />
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
                {isAdmin && <th className="table-th" />}
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300 flex-shrink-0">
                        {u.email[0]}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">{u.email}</span>
                      {u.id === me?.id && (
                        <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-500/20">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-td"><Badge value={u.role} /></td>
                  {isSysAdmin && (
                    <td className="table-td text-sm text-slate-500">{orgName(u.organizationId)}</td>
                  )}
                  <td className="table-td">
                    <Badge value={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className="table-td text-slate-400 dark:text-slate-500 text-xs">
                    {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                  </td>
                  {isAdmin && (
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-3">
                        {u.id !== me?.id && (
                          <>
                            <button
                              onClick={() => openEdit(u)}
                              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                            >
                              <EditIcon /> Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={updateUser.isPending}
                              className={`text-xs font-medium disabled:opacity-50 ${
                                u.isActive
                                  ? 'text-red-500 hover:text-red-700'
                                  : 'text-emerald-600 hover:text-emerald-800'
                              }`}
                            >
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Invite User">
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
              {ROLES.filter((r) => isSysAdmin || r !== 'SYSTEM_ADMIN').map((r) => <option key={r} value={r}>{r}</option>)}
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
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User">
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
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Role</label>
            <select className="input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
              {ROLES.filter((r) => isSysAdmin || r !== 'SYSTEM_ADMIN').map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isSysAdmin && allOrgs && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Organization</label>
              <select className="input" value={editOrgId} onChange={(e) => setEditOrgId(e.target.value)}>
                {allOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {updateUser.error && (
            <p className="text-sm text-red-600">{(updateUser.error as any)?.response?.data?.message ?? 'Failed to update user'}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditUser(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateUser.isPending} className="btn-primary">
              {updateUser.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
