import React, { useState } from 'react';
import { useAllOrganizations, useCreateOrganization } from '../hooks/useOrganization';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { usePagination } from '../hooks/usePagination';
import { formatDistanceToNow } from 'date-fns';

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function OrganizationsPage() {
  const { data: orgs, isLoading } = useAllOrganizations();
  const createOrg = useCreateOrganization();
  const pg = usePagination(orgs);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rateLimitRpm, setRateLimitRpm] = useState('10000');
  const [rawRetentionDays, setRawRetentionDays] = useState('');

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createOrg.mutateAsync({
      name: name.trim(),
      slug: slug.trim(),
      rateLimitRpm: parseInt(rateLimitRpm, 10),
      rawRetentionDays: rawRetentionDays !== '' ? parseInt(rawRetentionDays, 10) : null,
    });
    setOpen(false);
    setName('');
    setSlug('');
    setRateLimitRpm('10000');
    setRawRetentionDays('');
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">System</p>
          <p className="text-sm text-slate-500">{pg.total} organization{pg.total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <PlusIcon /> New Organization
        </button>
      </div>

      {orgs?.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No organizations"
            description="Create the first organization to get started."
            action={
              <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
                <PlusIcon /> New Organization
              </button>
            }
          />
        </div>
      ) : (
        <div className="card-flush">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Slug</th>
                <th className="table-th">Rate limit</th>
                <th className="table-th">Retention</th>
                <th className="table-th">Status</th>
                <th className="table-th">Created</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map((org) => (
                <tr key={org.id} className="table-row">
                  <td className="table-td">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{org.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{org.id}</p>
                  </td>
                  <td className="table-td font-mono text-xs text-slate-600 dark:text-slate-300">{org.slug}</td>
                  <td className="table-td text-slate-500">{org.rateLimitRpm.toLocaleString()} rpm</td>
                  <td className="table-td text-slate-500">
                    {org.rawRetentionDays != null ? `${org.rawRetentionDays} days` : 'Default'}
                  </td>
                  <td className="table-td">
                    <Badge value={org.isActive} label={org.isActive ? 'Active' : 'Inactive'} />
                  </td>
                  <td className="table-td text-slate-400">
                    {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 dark:border-slate-800 px-4">
            <Pagination {...pg} onPage={pg.goTo} onPageSize={pg.changePageSize} />
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Organization">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              className="input font-mono"
              placeholder="acme-corp"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
            />
            <p className="mt-1 text-xs text-slate-400">Lowercase letters, numbers, and hyphens only</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Rate limit (rpm)
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
          {createOrg.error && (
            <p className="text-sm text-red-600">
              {(createOrg.error as any)?.response?.data?.message ?? 'Failed to create organization'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createOrg.isPending} className="btn-primary">
              {createOrg.isPending ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
