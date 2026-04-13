import React, { useState, useEffect } from 'react';
import { useOrganization, useUpdateOrganization, useOrgUsers } from '../hooks/useOrganization';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.536-6.536a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 14H9v-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    </svg>
  );
}

export default function SettingsPage() {
  const { data: org, isLoading: orgLoading } = useOrganization();
  const { data: users, isLoading: usersLoading } = useOrgUsers();
  const updateOrg = useUpdateOrganization();
  const { user } = useAuth();

  const isSysAdmin = user?.role === 'SYSTEM_ADMIN';

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rateLimitRpm, setRateLimitRpm] = useState('');
  const [rawRetentionDays, setRawRetentionDays] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (org && editOpen) {
      setName(org.name);
      setSlug(org.slug);
      setRateLimitRpm(String(org.rateLimitRpm));
      setRawRetentionDays(org.rawRetentionDays != null ? String(org.rawRetentionDays) : '');
      setIsActive(org.isActive);
    }
  }, [org, editOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateOrg.mutateAsync({
      name: name.trim(),
      slug: slug.trim(),
      rateLimitRpm: parseInt(rateLimitRpm, 10),
      rawRetentionDays: rawRetentionDays !== '' ? parseInt(rawRetentionDays, 10) : null,
      isActive,
    });
    setEditOpen(false);
  };

  if (orgLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Org details */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Organization</h3>
          {isSysAdmin && org && (
            <button
              onClick={() => setEditOpen(true)}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-2.5"
            >
              <EditIcon /> Edit
            </button>
          )}
        </div>
        {org ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { label: 'Name',        value: org.name },
              { label: 'Slug',        value: <span className="font-mono text-xs">{org.slug}</span> },
              { label: 'Rate limit',  value: `${org.rateLimitRpm.toLocaleString()} rpm` },
              { label: 'Retention',   value: org.rawRetentionDays != null ? `${org.rawRetentionDays} days` : 'Default' },
              { label: 'Status',      value: <Badge value={org.isActive} label={org.isActive ? 'Active' : 'Inactive'} /> },
              { label: 'ID',          value: <span className="font-mono text-xs break-all">{org.id}</span> },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">Unable to load organization details.</p>
        )}
      </div>

      {/* Current user */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Your Account</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Email', value: user?.email },
            { label: 'Role',  value: <Badge value={user?.role ?? ''} label={user?.role ?? ''} /> },
            { label: 'ID',    value: <span className="font-mono text-xs">{user?.id}</span> },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Users */}
      <div className="card-flush">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Team Members</h3>
        </div>
        {usersLoading ? (
          <PageSpinner />
        ) : !users || users.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No users found.</p>
        ) : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Email</th>
                <th className="table-th">Role</th>
                <th className="table-th">Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td font-medium text-slate-800 dark:text-slate-200">{u.email}</td>
                  <td className="table-td"><Badge value={u.role} label={u.role} /></td>
                  <td className="table-td">
                    <Badge value={u.isActive} label={u.isActive ? 'Active' : 'Inactive'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit org modal — SYSTEM_ADMIN only */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Organization">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Slug <span className="text-red-500">*</span>
              </label>
              <input
                className="input font-mono"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, and hyphens only"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Rate limit (rpm) <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                type="number"
                min={1}
                value={rateLimitRpm}
                onChange={(e) => setRateLimitRpm(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Raw retention (days)
              </label>
              <input
                className="input"
                type="number"
                min={1}
                placeholder="Default (unlimited)"
                value={rawRetentionDays}
                onChange={(e) => setRawRetentionDays(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Active</label>
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {updateOrg.error && (
            <p className="text-sm text-red-600">
              {(updateOrg.error as any)?.response?.data?.message ?? 'Failed to update organization'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateOrg.isPending} className="btn-primary">
              {updateOrg.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
