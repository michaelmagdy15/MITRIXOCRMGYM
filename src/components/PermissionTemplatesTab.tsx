import React, { useState, useMemo } from 'react';
import { PermissionTemplate, User, UserRole } from '../types';
import { 
  PERMISSION_CATEGORIES, 
  PERMISSION_DEFINITIONS, 
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSIONS_TRUE,
  ALL_PERMISSIONS_FALSE
} from '../utils/permissions';
import { PermissionMatrixEditor } from './PermissionMatrixEditor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  ShieldCheck, 
  Plus, 
  Edit3, 
  Copy, 
  Trash2, 
  Users, 
  Sliders, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Lock,
  Layers
} from 'lucide-react';

interface PermissionTemplatesTabProps {
  users: User[];
  currentUser: User | null;
  templates: PermissionTemplate[];
  onCreateTemplate: (data: Omit<PermissionTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  onUpdateTemplate: (id: string, updates: Partial<PermissionTemplate>) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export const PermissionTemplatesTab: React.FC<PermissionTemplatesTabProps> = ({
  users,
  currentUser,
  templates,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateBaseRole, setTemplateBaseRole] = useState<UserRole>('rep');
  const [templatePermissions, setTemplatePermissions] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Compute how many users are assigned to each template
  const usersByTemplateId = useMemo(() => {
    const counts: Record<string, User[]> = {};
    for (const u of users) {
      if (u.permissionTemplateId) {
        const list = counts[u.permissionTemplateId] || [];
        list.push(u);
        counts[u.permissionTemplateId] = list;
      }
    }
    return counts;
  }, [users]);

  const canManageTemplates = currentUser?.role === 'super_admin' || 
                             currentUser?.role === 'crm_admin' || 
                             currentUser?.role === 'manager' ||
                             currentUser?.role === 'admin';

  const handleOpenCreate = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateDescription('');
    setTemplateBaseRole('rep');
    setTemplatePermissions({ ...(DEFAULT_ROLE_PERMISSIONS.rep || ALL_PERMISSIONS_FALSE) });
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (template: PermissionTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description || '');
    setTemplateBaseRole(template.baseRole || 'rep');
    setTemplatePermissions({ ...template.permissions });
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const handleCloneTemplate = async (template: PermissionTemplate) => {
    try {
      setIsSaving(true);
      await onCreateTemplate({
        name: `${template.name} (Copy)`,
        description: `Cloned from ${template.name}. ${template.description || ''}`.trim(),
        isSystem: false,
        baseRole: template.baseRole,
        permissions: { ...template.permissions }
      });
    } catch (err: any) {
      alert(`Failed to clone template: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template: PermissionTemplate) => {
    if (template.isSystem) {
      alert('System templates cannot be deleted.');
      return;
    }

    const assignedCount = usersByTemplateId[template.id]?.length || 0;
    const confirmMessage = assignedCount > 0
      ? `Are you sure you want to delete "${template.name}"?\n\nWarning: ${assignedCount} staff member(s) are currently assigned to this template. They will fall back to their standard role permissions.`
      : `Are you sure you want to delete "${template.name}"?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await onDeleteTemplate(template.id);
    } catch (err: any) {
      alert(`Failed to delete template: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleApplyRoleDefaults = (role: UserRole) => {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] || ALL_PERMISSIONS_FALSE;
    setTemplatePermissions({ ...defaults });
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      setSaveError('Template name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      if (editingTemplateId) {
        await onUpdateTemplate(editingTemplateId, {
          name: templateName.trim(),
          description: templateDescription.trim(),
          baseRole: templateBaseRole,
          permissions: templatePermissions
        });
      } else {
        await onCreateTemplate({
          name: templateName.trim(),
          description: templateDescription.trim(),
          isSystem: false,
          baseRole: templateBaseRole,
          permissions: templatePermissions
        });
      }

      setIsDialogOpen(false);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 sm:p-6 rounded-2xl border shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              Permission Templates & Role Blueprints
            </h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Configure reusable permission templates for gym staff roles. Control operational access, front desk privileges, financial analytics, and client data visibility with granular precision.
          </p>
        </div>

        {canManageTemplates && (
          <Button 
            onClick={handleOpenCreate} 
            className="rounded-xl px-4 py-2 font-medium shadow-sm hover:shadow transition-all shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create New Template
          </Button>
        )}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {templates.map((template) => {
          const assignedUsers = usersByTemplateId[template.id] || [];
          const enabledCount = PERMISSION_DEFINITIONS.filter(d => !!template.permissions?.[d.key]).length;
          const totalCount = PERMISSION_DEFINITIONS.length;
          const percentage = Math.round((enabledCount / totalCount) * 100);

          return (
            <Card 
              key={template.id} 
              className={`rounded-2xl border transition-all duration-200 hover:shadow-md flex flex-col justify-between ${
                template.isSystem ? 'bg-card border-border/80' : 'bg-card border-primary/20 hover:border-primary/50'
              }`}
            >
              <CardHeader className="p-5 pb-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                      {template.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {template.isSystem ? (
                        <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border">
                          <Lock className="h-3 w-3 mr-1" />
                          System Default
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Custom Template
                        </Badge>
                      )}

                      {template.baseRole && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          Role: {template.baseRole}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Badge variant="outline" className="font-mono text-xs shrink-0">
                    {enabledCount} / {totalCount} perms
                  </Badge>
                </div>

                <CardDescription className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                  {template.description || 'No description provided.'}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-0 space-y-4">
                {/* Visual Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Access Coverage</span>
                    <span className="font-medium font-mono">{percentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        percentage === 100 
                          ? 'bg-emerald-500' 
                          : percentage > 50 
                            ? 'bg-primary' 
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {/* Assigned Staff Preview */}
                <div className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-muted/40 border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>Assigned Staff</span>
                  </div>
                  <span className="font-semibold text-foreground">
                    {assignedUsers.length} {assignedUsers.length === 1 ? 'user' : 'users'}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCloneTemplate(template)}
                    title="Clone / Duplicate this template"
                    className="h-8 px-2.5 text-xs rounded-xl"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Clone
                  </Button>

                  {canManageTemplates && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(template)}
                      title="Edit template permissions"
                      className="h-8 px-2.5 text-xs rounded-xl hover:border-primary hover:text-primary"
                    >
                      <Edit3 className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  )}

                  {canManageTemplates && !template.isSystem && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(template)}
                      title="Delete custom template"
                      className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create / Edit Template Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="p-6 pb-4 border-b bg-card">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              {editingTemplateId ? `Edit Template: ${templateName}` : 'Create Permission Template'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Configure name, base role, and activate exact permission checkboxes across 11 gym operational categories.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {saveError && (
              <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Basic Info Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-2xl border">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name" className="text-xs font-semibold">
                  Template Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tpl-name"
                  placeholder="e.g. Weekend Front Desk"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-role" className="text-xs font-semibold">
                  Base System Role
                </Label>
                <div className="flex gap-2">
                  <Select 
                    value={templateBaseRole} 
                    onValueChange={(val: any) => {
                      if (val) setTemplateBaseRole(val as UserRole);
                    }}
                  >
                    <SelectTrigger id="tpl-role" className="h-10 rounded-xl flex-1">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rep">Representative / Front Desk</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="coach">Coach / Trainer</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyRoleDefaults(templateBaseRole)}
                    title="Quick-fill permissions from selected role defaults"
                    className="h-10 text-xs rounded-xl shrink-0"
                  >
                    Load Defaults
                  </Button>
                </div>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="tpl-desc" className="text-xs font-semibold">
                  Description & Operational Scope
                </Label>
                <Input
                  id="tpl-desc"
                  placeholder="e.g. Front desk receptionist focused on member check-in, bookings, and juice bar POS."
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            {/* Embedded Granular Checkbox Matrix */}
            <div className="space-y-2">
              <PermissionMatrixEditor
                permissions={templatePermissions}
                onChange={setTemplatePermissions}
                defaultExpanded={true}
              />
            </div>
          </div>

          <DialogFooter className="p-4 px-6 border-t bg-card/80 flex items-center justify-between">
            <p className="text-xs text-muted-foreground hidden sm:block">
              Changes will take effect immediately for all staff assigned to this template.
            </p>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isSaving}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="rounded-xl font-semibold shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Template'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
