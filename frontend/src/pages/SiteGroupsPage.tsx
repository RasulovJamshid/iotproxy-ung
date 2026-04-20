import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useSiteGroups, useCreateSiteGroup, useUpdateSiteGroup, useDeleteSiteGroup,
} from '../hooks/useSiteGroups';
import { useSites } from '../hooks/useSites';
import { useAssignSiteToGroup, useUnassignSiteFromGroup } from '../hooks/useSiteGroups';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { SiteGroup, Site } from '../types';

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#f43f5e', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#64748b', '#94a3b8',
];

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icons = {
  Plus:   () => <Icon d="M12 5v14M5 12h14" />,
  Edit:   () => <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
  Trash:  () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
  Folder: () => <Icon d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" className="w-5 h-5" />,
  Unlink: () => <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
  Site:   () => <Icon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
};

// ── Color dot ────────────────────────────────────────────────────────────────
function ColorDot({ color, size = 'md' }: { color?: string; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-2.5 h-2.5' : 'w-4 h-4';
  return (
    <span
      className={`${sz} rounded-full flex-shrink-0 border border-black/10`}
      style={{ backgroundColor: color ?? '#64748b' }}
    />
  );
}

// ── Group Form Modal ──────────────────────────────────────────────────────────
function GroupFormModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: SiteGroup;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const create = useCreateSiteGroup();
  const update = useUpdateSiteGroup();
  const isPending = create.isPending || update.isPending;

  const reset = () => { setName(''); setDescription(''); setColor(COLORS[0]); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (initial) {
      await update.mutateAsync({ id: initial.id, name, description: description || undefined, color });
    } else {
      await create.mutateAsync({ name, description: description || undefined, color });
      reset();
    }
    onClose();
  };

  // Sync initial values when editing a different group
  React.useEffect(() => {
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setColor(initial?.color ?? COLORS[0]);
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Group' : 'New Group'} width="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Production Sites"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Saving…' : initial ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Manage Sites Modal ────────────────────────────────────────────────────────
function ManageSitesModal({
  group,
  allSites,
  open,
  onClose,
}: {
  group: SiteGroup;
  allSites: Site[];
  open: boolean;
  onClose: () => void;
}) {
  const assign = useAssignSiteToGroup();
  const unassign = useUnassignSiteFromGroup();
  const [search, setSearch] = useState('');

  const inGroup = allSites.filter((s) => s.groupId === group.id);
  const available = allSites.filter(
    (s) => s.groupId !== group.id &&
    (search === '' || s.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <Modal open={open} onClose={onClose} title={`Manage Sites — ${group.name}`} width="max-w-2xl">
      <div className="space-y-5">
        {/* Current members */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            In this group ({inGroup.length})
          </p>
          {inGroup.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No sites assigned yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {inGroup.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400"><Icons.Site /></span>
                    <span className="text-sm font-medium truncate">{s.name}</span>
                  </div>
                  <button
                    onClick={() => unassign.mutate({ groupId: group.id, siteId: s.id })}
                    disabled={unassign.isPending}
                    className="ml-2 flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Remove from group"
                  >
                    <Icons.Unlink /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add sites */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Add sites</p>
          <input
            className="input mb-2"
            placeholder="Search sites…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {available.length === 0 ? (
            <p className="text-sm text-slate-400 italic">{search ? 'No matching sites.' : 'All sites are already in this group.'}</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {available.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400"><Icons.Site /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {s.groupId && (
                        <p className="text-[10px] text-slate-400">Currently in another group</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => assign.mutate({ groupId: group.id, siteId: s.id })}
                    disabled={assign.isPending}
                    className="ml-2 btn-secondary text-xs py-1 px-2.5 flex-shrink-0"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="btn-secondary">Done</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteConfirmModal({
  group,
  open,
  onClose,
}: {
  group: SiteGroup | null;
  open: boolean;
  onClose: () => void;
}) {
  const del = useDeleteSiteGroup();

  if (!group) return null;

  return (
    <Modal open={open} onClose={onClose} title="Delete Group" width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to delete <strong>{group.name}</strong>?
          The {group.siteCount ?? 0} site{group.siteCount !== 1 ? 's' : ''} in this group will become ungrouped.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={del.isPending}
            onClick={async () => { await del.mutateAsync(group.id); onClose(); }}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {del.isPending ? 'Deleting…' : 'Delete Group'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({
  group,
  sites,
  onEdit,
  onDelete,
  onManageSites,
}: {
  group: SiteGroup;
  sites: Site[];
  onEdit: (g: SiteGroup) => void;
  onDelete: (g: SiteGroup) => void;
  onManageSites: (g: SiteGroup) => void;
}) {
  const groupSites = sites.filter((s) => s.groupId === group.id).slice(0, 3);
  const extras = (group.siteCount ?? 0) - groupSites.length;

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 text-white"
            style={{ backgroundColor: group.color ?? '#64748b' }}
          >
            <Icons.Folder />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{group.name}</h3>
            {group.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(group)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Edit group"
          >
            <Icons.Edit />
          </button>
          <button
            onClick={() => onDelete(group)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            title="Delete group"
          >
            <Icons.Trash />
          </button>
        </div>
      </div>

      {/* Site count badge */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: group.color ?? '#64748b' }}
        >
          <Icons.Site /> {group.siteCount ?? 0} site{group.siteCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Sites preview */}
      {groupSites.length > 0 && (
        <div className="space-y-1">
          {groupSites.map((s) => (
            <Link
              key={s.id}
              to={`/sites/${s.id}`}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 truncate"
            >
              <ColorDot color={group.color} size="sm" />
              {s.name}
            </Link>
          ))}
          {extras > 0 && (
            <p className="text-xs text-slate-400 pl-4">+{extras} more</p>
          )}
        </div>
      )}

      {/* Manage button */}
      <button
        onClick={() => onManageSites(group)}
        className="w-full btn-secondary text-sm"
      >
        Manage Sites
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SiteGroupsPage() {
  const { data: groups = [], isLoading: groupsLoading } = useSiteGroups();
  const { data: sitesResponse } = useSites(1, 500);
  const sites = sitesResponse?.data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SiteGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteGroup | null>(null);
  const [manageSitesTarget, setManageSitesTarget] = useState<SiteGroup | null>(null);

  if (groupsLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Organise your sites into logical groups for easier navigation.
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Icons.Plus /> New Group
        </button>
      </div>

      {/* Grid */}
      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No groups yet"
            description="Create your first site group to organise your sites."
            action={
              <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
                <Icons.Plus /> New Group
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              sites={sites}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onManageSites={setManageSitesTarget}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <GroupFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <GroupFormModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        initial={editTarget ?? undefined}
      />
      <DeleteConfirmModal
        group={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
      {manageSitesTarget && (
        <ManageSitesModal
          group={manageSitesTarget}
          allSites={sites}
          open={!!manageSitesTarget}
          onClose={() => setManageSitesTarget(null)}
        />
      )}
    </div>
  );
}
