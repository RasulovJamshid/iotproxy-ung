import React, { useState } from 'react';
import { useSensorCategories, useCreateSensorCategory, useUpdateSensorCategory, useDeleteSensorCategory } from '../hooks/useSensorCategories';
import { useAuth } from '../contexts/AuthContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageSpinner } from '../components/ui/Spinner';

export default function SensorCategoriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SYSTEM_ADMIN';
  
  const { data: categories, isLoading } = useSensorCategories();
  const createCategory = useCreateSensorCategory();
  const updateCategory = useUpdateSensorCategory();
  const deleteCategory = useDeleteSensorCategory();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);

  const [formData, setFormData] = useState({ name: '', description: '', color: '#3b82f6' });

  const handleCreate = async () => {
    await createCategory.mutateAsync(formData);
    setCreateOpen(false);
    setFormData({ name: '', description: '', color: '#3b82f6' });
  };

  const handleUpdate = async () => {
    if (!selectedCategory) return;
    await updateCategory.mutateAsync({ id: selectedCategory.id, ...formData });
    setEditOpen(false);
    setSelectedCategory(null);
    setFormData({ name: '', description: '', color: '#3b82f6' });
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;
    await deleteCategory.mutateAsync(selectedCategory.id);
    setDeleteOpen(false);
    setSelectedCategory(null);
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sensor Categories</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage sensor category definitions for your organization
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setFormData({ name: '', description: '', color: '#3b82f6' });
              setCreateOpen(true);
            }}
            className="btn-primary"
          >
            + New Category
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Color
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Status
              </th>
              {isAdmin && (
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {categories?.map((category) => (
              <tr key={category.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                  {category.name}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                  {category.description || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded border border-slate-300 dark:border-slate-600"
                      style={{ backgroundColor: category.color || '#64748b' }}
                    />
                    <span className="text-slate-600 dark:text-slate-300">{category.color || '—'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    category.isActive 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {category.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedCategory(category);
                        setFormData({ name: category.name, description: category.description || '', color: category.color || '#3b82f6' });
                        setEditOpen(true);
                      }}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setSelectedCategory(category);
                        setDeleteOpen(true);
                      }}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {categories?.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">No sensor categories found</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Sensor Category" width="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name *</label>
            <input
              type="text"
              className="input w-full"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Environmental"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
            <textarea
              className="input w-full"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-20 rounded border border-slate-300 dark:border-slate-600"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
              <input
                type="text"
                className="input flex-1"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="#3b82f6"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={!formData.name || createCategory.isPending}
              className="btn-primary"
            >
              {createCategory.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Sensor Category" width="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Name *</label>
            <input
              type="text"
              className="input w-full"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
            <textarea
              className="input w-full"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-20 rounded border border-slate-300 dark:border-slate-600"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
              <input
                type="text"
                className="input flex-1"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditOpen(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleUpdate}
              disabled={!formData.name || updateCategory.isPending}
              className="btn-primary"
            >
              {updateCategory.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Sensor Category"
        description={`Are you sure you want to delete "${selectedCategory?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteCategory.isPending}
      />
    </div>
  );
}
