import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePackageCategories } from '../../hooks/usePackageCategories';
import { PackageCategoryItem } from '../../types';
import { useAppContext } from '../../context';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  FolderKanban,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export interface PackageCategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackageCategoryManagerDialog({
  open,
  onOpenChange,
}: PackageCategoryManagerDialogProps) {
  const {
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
  } = usePackageCategories();
  const { currentUser } = useAppContext();

  // Add new category form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Inline delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      toast.error('Category name is required.');
      return;
    }

    setIsAdding(true);
    try {
      const createdBy = currentUser?.name || currentUser?.email || 'Manager';
      await addCategory(trimmedName, newDescription.trim() || undefined, createdBy);
      setNewName('');
      setNewDescription('');
    } catch (err) {
      console.error('[PackageCategoryManagerDialog] Failed to add category:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const startEditing = (cat: PackageCategoryItem) => {
    setConfirmDeleteId(null);
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = async (id: string) => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast.error('Category name cannot be empty.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateCategory(id, trimmedName, editDescription.trim() || undefined);
      setEditingId(null);
    } catch (err) {
      console.error('[PackageCategoryManagerDialog] Failed to update category:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async (cat: PackageCategoryItem) => {
    setIsDeletingId(cat.id);
    try {
      await deleteCategory(cat.id);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('[PackageCategoryManagerDialog] Failed to delete category:', err);
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-card text-foreground border border-border shadow-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FolderKanban className="h-5 w-5 text-primary" />
            Manage Package Categories
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create, rename, or remove package categories (e.g., Membership, Classes, SGF (Small Group Fitness), Personal Training, Nutrition).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Add New Category Form */}
          <form
            onSubmit={handleAddCategory}
            className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add New Category
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-category-name" className="text-xs text-foreground">
                  Category Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="new-category-name"
                  placeholder="e.g. SGF (Small Group Fitness)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isAdding}
                  className="bg-card text-foreground border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-category-description" className="text-xs text-foreground">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="new-category-description"
                  placeholder="Short description or notes"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  disabled={isAdding}
                  className="bg-card text-foreground border-border"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={isAdding || !newName.trim()}
                className="gap-1.5"
              >
                {isAdding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Category
              </Button>
            </div>
          </form>

          {/* Existing Categories List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Existing Categories
              </span>
              <Badge variant="secondary" className="text-xs">
                {categories.length} {categories.length === 1 ? 'category' : 'categories'}
              </Badge>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2 rounded-lg border border-border bg-muted/30">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading categories...
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                No package categories found. Add your first category above.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                {categories.map((cat) => {
                  const isEditing = editingId === cat.id;
                  const isConfirmingDelete = confirmDeleteId === cat.id;
                  const isDeleting = isDeletingId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="p-3 transition-colors hover:bg-muted/30"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Category Name
                              </Label>
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Category name"
                                disabled={isSavingEdit}
                                className="h-8 bg-card text-foreground border-border"
                                autoFocus
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Description
                              </Label>
                              <Input
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="Optional description"
                                disabled={isSavingEdit}
                                className="h-8 bg-card text-foreground border-border"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={cancelEditing}
                              disabled={isSavingEdit}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSaveEdit(cat.id)}
                              disabled={isSavingEdit || !editName.trim()}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              {isSavingEdit ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : isConfirmingDelete ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md bg-destructive/10 border border-destructive/30 p-2.5">
                          <div className="flex items-start gap-2 text-xs text-foreground">
                            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold">Delete "{cat.name}"?</span>{' '}
                              <span className="text-muted-foreground">
                                Existing packages using this category will keep their label until reassigned.
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting}
                              className="h-7 px-2.5 text-xs"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleConfirmDelete(cat)}
                              disabled={isDeleting}
                              className="h-7 px-2.5 text-xs gap-1"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Confirm Delete
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-foreground truncate">
                                {cat.name}
                              </span>
                            </div>
                            {cat.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {cat.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditing(cat)}
                              title={`Edit ${cat.name}`}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit {cat.name}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingId(null);
                                setConfirmDeleteId(cat.id);
                              }}
                              title={`Delete ${cat.name}`}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete {cat.name}</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PackageCategoryManagerDialog;
