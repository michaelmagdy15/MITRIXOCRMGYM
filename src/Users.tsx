import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useSettings } from './contexts/SettingsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { UserRole, User, InzanDepartment, InzanJobTitle } from './types';
import { Shield, User as UserIcon, Plus, Trash2, Edit, BarChart, Clock, KeyRound, Loader2, CheckCircle2, RotateCcw, Search, Building2, Sliders, SlidersHorizontal, Sparkles, Lock, Layers } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { safeFormatDistanceToNow } from './utils/dateUtils';
import { UserPerformanceDialog } from './components/UserPerformanceDialog';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { auth, db, getTenantId } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

import { INZAN_DEPARTMENTS, INZAN_JOB_TITLES } from './utils/inzanOrg';
import { useAppContext } from './context';
import { PermissionTemplatesTab } from './components/PermissionTemplatesTab';
import { PermissionMatrixEditor } from './components/PermissionMatrixEditor';
import { 
  syncLegacyFlags, 
  DEFAULT_ROLE_PERMISSIONS, 
  ALL_PERMISSIONS_FALSE 
} from './utils/permissions';

export default function Users() {
  const { users, currentUser, updateUser, inviteUser, deleteUser, activatePendingUser, passwordResetRequests, approvePasswordResetRequest, denyPasswordResetRequest } = useAuth();
  const { 
    permissionTemplates, 
    createPermissionTemplate, 
    updatePermissionTemplate, 
    deletePermissionTemplate,
    can 
  } = useAppContext();
  const { branches } = useSettings();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('rep');
  const [inviteBranch, setInviteBranch] = useState('');
  const [inviteTarget, setInviteTarget] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'working' | 'nonworking'>('working');
  const [inviteDepartment, setInviteDepartment] = useState<string>('');
  const [inviteJobTitle, setInviteJobTitle] = useState<string>('');
  const [inviteTrainerType, setInviteTrainerType] = useState<string>('Full-Time');
  const [invitePermissionTemplateId, setInvitePermissionTemplateId] = useState<string>('');
  const [inviteUseCustomOverrides, setInviteUseCustomOverrides] = useState<boolean>(false);
  const [inviteCustomPermissions, setInviteCustomPermissions] = useState<Record<string, boolean>>({});
  const [isInviting, setIsInviting] = useState(false);
  const [activatingUserId, setActivatingUserId] = useState<string | null>(null);
  const [activatedUserId, setActivatedUserId] = useState<string | null>(null);
  const [approvingResetId, setApprovingResetId] = useState<string | null>(null);
  const [approvedResetId, setApprovedResetId] = useState<string | null>(null);
  const [forcingResetUserId, setForcingResetUserId] = useState<string | null>(null);
  
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editPermissionTemplateId, setEditPermissionTemplateId] = useState<string>('');
  const [editUseCustomOverrides, setEditUseCustomOverrides] = useState<boolean>(false);
  const [editCustomPermissions, setEditCustomPermissions] = useState<Record<string, boolean>>({});
  const [editCanDeletePayments, setEditCanDeletePayments] = useState(false);
  const [editCanViewGlobalDashboard, setEditCanViewGlobalDashboard] = useState(false);
  const [editCanAccessSettings, setEditCanAccessSettings] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editClientRecordId, setEditClientRecordId] = useState('');
  const [editStatus, setEditStatus] = useState<'working' | 'nonworking'>('working');
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [editJobTitle, setEditJobTitle] = useState<string>('');
  const [editTrainerType, setEditTrainerType] = useState<string>('Full-Time');

  const isInzan = getTenantId() === 'inzanathletics';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [performanceUser, setPerformanceUser] = useState<User | null>(null);

  if (currentUser?.role !== 'manager' && currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin' && currentUser?.role !== 'crm_admin') {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  const canChangeRoles = currentUser?.role === 'super_admin' || currentUser?.role === 'crm_admin' || currentUser?.role === 'admin';
  const canInviteUsers = canChangeRoles || currentUser?.role === 'manager';

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    updateUser(userId, { role: newRole });
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditBranch(user.branch || '');
    setEditTarget(user.salesTarget?.toString() || '');
    setEditPhone(user.phone || '');
    setEditClientRecordId(user.clientRecordId || '');
    setEditStatus(user.status || 'working');
    setEditDepartment(user.department || '');
    setEditJobTitle(user.jobTitle || '');
    setEditTrainerType(user.trainerType || 'Full-Time');

    // Granular Permissions & Templates
    const templateId = user.permissionTemplateId || '';
    setEditPermissionTemplateId(templateId);

    const hasCustom = !!(user.customPermissions && Object.keys(user.customPermissions).length > 0);
    setEditUseCustomOverrides(hasCustom);

    if (hasCustom && user.customPermissions) {
      setEditCustomPermissions({ ...user.customPermissions });
    } else {
      const template = permissionTemplates.find(t => t.id === templateId);
      const initialPerms = template?.permissions || DEFAULT_ROLE_PERMISSIONS[user.role] || ALL_PERMISSIONS_FALSE;
      setEditCustomPermissions({ ...initialPerms });
    }

    setEditCanDeletePayments(user.can_delete_payments || false);
    setEditCanViewGlobalDashboard(user.can_view_global_dashboard || false);
    setEditCanAccessSettings(user.can_access_settings_and_history || false);
  };

  const handleUpdateUserDetails = () => {
    if (editingUser) {
      const updates: Partial<User> = {
        name: editName,
        email: editEmail,
        phone: editPhone.trim() || undefined
      };

      if (editingUser.role === 'client') {
        updates.clientRecordId = editClientRecordId || undefined;
      } else {
        updates.branch = editBranch || undefined;
        updates.salesTarget = editTarget ? parseFloat(editTarget) : undefined;
        updates.status = editStatus;

        // Granular Permissions & Templates
        updates.permissionTemplateId = editPermissionTemplateId || undefined;
        if (editUseCustomOverrides) {
          updates.customPermissions = editCustomPermissions;
          const legacy = syncLegacyFlags(editCustomPermissions);
          Object.assign(updates, legacy);
        } else {
          updates.customPermissions = undefined;
          const template = permissionTemplates.find(t => t.id === editPermissionTemplateId);
          const effective = template?.permissions || DEFAULT_ROLE_PERMISSIONS[editingUser.role] || {};
          const legacy = syncLegacyFlags(effective);
          Object.assign(updates, legacy);
        }

        if (isInzan) {
          updates.department = (editDepartment as InzanDepartment) || undefined;
          updates.jobTitle = (editJobTitle as InzanJobTitle) || undefined;
          if (editDepartment === 'Fitness') {
            updates.trainerType = (editTrainerType as 'Full-Time' | 'Part-Time') || undefined;
          }
        }
      }

      updateUser(editingUser.id, updates);
      
      // Update in searchResults state so the UI reflects the changes immediately
      setSearchResults(prev => prev.map(r => r.id === editingUser.id ? { ...r, ...updates } : r));
      
      setEditingUser(null);
    }
  };

  const handleMemberSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = searchQuery.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const allUsers: User[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));

      const results: User[] = [];
      const termLower = term.toLowerCase();
      const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);

      allUsers.forEach((u: User) => {
        if (u.role !== 'client' && u.role !== 'coach') return;
        let match = false;
        
        if (/^\d+$/.test(term)) {
          match = String(u.clientRecordId) === term || String(u.coachId) === term;
        } else if (u.email?.toLowerCase() === termLower) {
          match = true;
        } else if (u.name?.startsWith(capitalizedTerm)) {
          match = true;
        }

        if (match && !results.some(r => r.id === u.id)) {
          results.push(u);
        }
      });
      
      setSearchResults(results);
    } catch (err: any) {
      console.error("Error searching member portal users:", err);
      window.alert("Failed to search members: " + (err.message || String(err)));
    } finally {
      setIsSearching(false);
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (window.confirm("Are you sure you want to delete this user? This revokes their access.")) {
      deleteUser(userId);
    }
  };

  const handleForcePasswordReset = async (user: User) => {
    if (!window.confirm(`Force reset password for ${user.name}?\n\nThis will reset their password to "12345678" and they will be required to change it on next login.`)) return;

    setForcingResetUserId(user.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authorization token found. You must be signed in.");

      const response = await fetch('/api/tenant/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: user.id })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${response.status}`);
      }

      window.alert(`Done! ${user.name}'s password has been reset to "12345678". They will be prompted to change it on next login.`);
    } catch (err: any) {
      window.alert(`Failed to reset password: ${err?.message || 'Unknown error'}`);
    } finally {
      setForcingResetUserId(null);
    }
  };

  const handleActivatePending = async (user: User) => {
    if (!window.confirm(`Create a login account for ${user.name} (${user.email})?\n\nThey will be able to sign in with email + password \"12345678\". They should change this after first login.`)) return;
    setActivatingUserId(user.id);
    try {
      await activatePendingUser(user.id, user.email, user.role, user.name);
      setActivatedUserId(user.id);
      setTimeout(() => setActivatedUserId(null), 3000);
    } catch (err: any) {
      window.alert(`Failed to activate account: ${err?.message || 'Unknown error'}`);
    } finally {
      setActivatingUserId(null);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'manager': return <Badge className="bg-purple-500"><Shield className="w-3 h-3 mr-1" /> Manager</Badge>;
      case 'admin': return <Badge className="bg-blue-500">Admin</Badge>;
      case 'super_admin': return <Badge className="bg-red-500"><Shield className="w-3 h-3 mr-1" /> Super Admin</Badge>;
      case 'crm_admin': return <Badge className="bg-emerald-500"><Shield className="w-3 h-3 mr-1" /> CRM Admin</Badge>;
      case 'rep': return <Badge variant="secondary">Rep</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  const openInviteModal = () => {
    setInviteEmail('');
    setInviteName('');
    setInvitePhone('');
    setInviteRole('rep');
    setInviteBranch('');
    setInviteTarget('');
    setInviteStatus('working');
    setInviteDepartment('');
    setInviteJobTitle('');
    setInviteTrainerType('Full-Time');

    const repTemplate = permissionTemplates.find(t => t.baseRole === 'rep') || permissionTemplates.find(t => t.id === 'sales-rep');
    const templateId = repTemplate?.id || '';
    setInvitePermissionTemplateId(templateId);
    setInviteUseCustomOverrides(false);

    const basePerms = repTemplate?.permissions || DEFAULT_ROLE_PERMISSIONS['rep'] || ALL_PERMISSIONS_FALSE;
    setInviteCustomPermissions({ ...basePerms });
    setIsInviteOpen(true);
  };

  const handleInviteRoleChange = (newRole: UserRole) => {
    setInviteRole(newRole);
    if (!inviteUseCustomOverrides) {
      const matchingTpl = permissionTemplates.find(t => t.baseRole === newRole);
      if (matchingTpl) {
        setInvitePermissionTemplateId(matchingTpl.id);
        setInviteCustomPermissions({ ...matchingTpl.permissions });
      } else {
        setInvitePermissionTemplateId('');
        setInviteCustomPermissions({ ...(DEFAULT_ROLE_PERMISSIONS[newRole] || ALL_PERMISSIONS_FALSE) });
      }
    }
  };

  const handleInviteTemplateChange = (tplId: string) => {
    setInvitePermissionTemplateId(tplId);
    if (!inviteUseCustomOverrides) {
      const template = permissionTemplates.find(t => t.id === tplId);
      const basePerms = template?.permissions || (inviteRole ? DEFAULT_ROLE_PERMISSIONS[inviteRole] : undefined) || ALL_PERMISSIONS_FALSE;
      setInviteCustomPermissions({ ...basePerms });
    }
  };

  const handleInvite = async () => {
    const cleanEmail = inviteEmail.trim().toLowerCase();
    const cleanName = inviteName.trim();

    if (!cleanEmail) {
      window.alert("Please enter a valid email address.");
      return;
    }
    if (!cleanName) {
      window.alert("Please enter the user's full name.");
      return;
    }

    setIsInviting(true);
    try {
      let customPermissions: Record<string, boolean> | undefined = undefined;
      let legacy: any = {};

      if (inviteUseCustomOverrides) {
        customPermissions = inviteCustomPermissions;
        legacy = syncLegacyFlags(inviteCustomPermissions);
      } else {
        const template = permissionTemplates.find(t => t.id === invitePermissionTemplateId);
        const effective = template?.permissions || DEFAULT_ROLE_PERMISSIONS[inviteRole] || {};
        legacy = syncLegacyFlags(effective);
      }

      await inviteUser(
        cleanEmail, 
        inviteRole, 
        cleanName, 
        invitePhone.trim() || undefined,
        invitePermissionTemplateId || undefined,
        {
          branch: inviteBranch || undefined,
          salesTarget: inviteTarget ? parseFloat(inviteTarget) : undefined,
          status: inviteStatus,
          department: isInzan ? (inviteDepartment as InzanDepartment) || undefined : undefined,
          jobTitle: isInzan ? (inviteJobTitle as InzanJobTitle) || undefined : undefined,
          trainerType: (isInzan && inviteDepartment === 'Fitness') ? (inviteTrainerType as 'Full-Time' | 'Part-Time') : undefined,
          customPermissions,
          ...legacy
        }
      );

      setIsInviteOpen(false);
      window.alert(`Successfully invited ${cleanName}! An account has been created with default password "12345678".`);
    } catch (err: any) {
      console.error("Invite user failed:", err);
      window.alert(`Failed to invite user: ${err?.message || String(err)}`);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
      </div>

      <Tabs defaultValue="staff" className="space-y-6">
        <TabsList className="flex w-fit bg-muted rounded-lg p-1">
          <TabsTrigger value="staff" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-1.5 text-sm">
            Staff Accounts
          </TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-1.5 text-sm">
            Member Portal Accounts
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-1.5 text-sm">
            <Shield className="w-3.5 h-3.5 mr-1.5 inline-block" />
            Permission Templates & Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-6 m-0 outline-none">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Manage CRM access, phone numbers, and target metrics for gym staff.</p>
            {canInviteUsers && (
              <>
                <Button onClick={openInviteModal} className="h-10 rounded-xl">
                  <Plus className="mr-2 h-4 w-4" /> Invite User
                </Button>

                <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                  <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[94vw] md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] h-[92vh] max-h-[92vh] p-0 flex flex-col gap-0 rounded-3xl border shadow-2xl bg-background overflow-hidden">
                    {/* Sticky Header */}
                    <div className="px-6 py-4 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between shrink-0 pr-14">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0">
                          {inviteName ? inviteName.charAt(0).toUpperCase() : <UserIcon className="h-5 w-5" />}
                        </div>
                        <div>
                          <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            Invite New Staff Member
                            <Badge variant="outline" className="text-xs font-mono uppercase tracking-wider">
                              {inviteRole}
                            </Badge>
                          </DialogTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Create staff profile, configure branch & sales target, and customize granular permissions.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Main Workbench Body: 2 Columns on Desktop */}
                    <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
                      <div className="grid grid-cols-1 lg:grid-cols-12 h-full divide-y lg:divide-y-0 lg:divide-x">
                        
                        {/* Left Column: Staff Identity & Profile */}
                        <div className="lg:col-span-5 xl:col-span-4 p-5 sm:p-6 overflow-y-auto space-y-5 bg-muted/15">
                          {/* Role Selection */}
                          <div className="space-y-1.5 p-3.5 rounded-2xl bg-card border shadow-xs">
                            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                              <span>System Role</span>
                              <span className="text-[10px] text-muted-foreground font-mono">Access Level</span>
                            </Label>
                            <Select value={inviteRole} onValueChange={(v) => handleInviteRoleChange(v as UserRole)}>
                              <SelectTrigger className="h-10 rounded-xl bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="rep">Rep</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                {canInviteUsers && (
                                  <SelectItem value="admin">Admin</SelectItem>
                                )}
                                {canChangeRoles && (
                                  <>
                                    <SelectItem value="crm_admin">CRM Admin</SelectItem>
                                    <SelectItem value="super_admin">Super Admin</SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Personal Information Group */}
                          <div className="space-y-3.5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <UserIcon className="h-3.5 w-3.5 text-primary" /> Personal Information
                            </h4>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Full Name *</Label>
                              <Input 
                                value={inviteName} 
                                onChange={(e) => setInviteName(e.target.value)} 
                                placeholder="e.g. Maison Mohamed"
                                className="h-10 rounded-xl bg-background"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Email Address *</Label>
                              <Input 
                                type="email"
                                value={inviteEmail} 
                                onChange={(e) => setInviteEmail(e.target.value)} 
                                placeholder="user@gymdomain.com"
                                className="h-10 rounded-xl bg-background"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Mobile Phone Number</Label>
                              <Input 
                                type="tel"
                                value={invitePhone} 
                                onChange={(e) => setInvitePhone(e.target.value)} 
                                placeholder="e.g. +201000680580"
                                className="h-10 rounded-xl bg-background"
                              />
                              <p className="text-[11px] text-muted-foreground">Used for SMS password resets and OTP verification.</p>
                            </div>
                          </div>

                          {/* Branch & Employment Group */}
                          <div className="space-y-3.5 pt-4 border-t">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-primary" /> Branch & Targets
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Assigned Branch</Label>
                                <Select value={inviteBranch} onValueChange={(v) => setInviteBranch(v || '')}>
                                  <SelectTrigger className="h-10 rounded-xl bg-background">
                                    <SelectValue placeholder="All Branches" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">All Branches</SelectItem>
                                    {branches.map(b => (
                                      <SelectItem key={b} value={b}>{b}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Employment Status</Label>
                                <Select value={inviteStatus} onValueChange={(val: any) => val && setInviteStatus(val)}>
                                  <SelectTrigger className="h-10 rounded-xl bg-background">
                                    <SelectValue placeholder="Select Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="working">Working</SelectItem>
                                    <SelectItem value="nonworking">Non-Working</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Personal Sales Target (Optional)</Label>
                              <Input 
                                type="number"
                                value={inviteTarget} 
                                onChange={(e) => setInviteTarget(e.target.value)} 
                                placeholder="Leave blank to use global target"
                                className="h-10 rounded-xl bg-background"
                              />
                            </div>
                          </div>

                          {/* INZAN Org Structure */}
                          {isInzan && (
                            <div className="space-y-3.5 pt-4 border-t">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-primary" /> INZAN Organization
                              </h4>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Department</Label>
                                <Select 
                                  value={inviteDepartment} 
                                  onValueChange={(val: any) => {
                                    setInviteDepartment(val || '');
                                    setInviteJobTitle('');
                                  }}
                                >
                                  <SelectTrigger className="h-10 rounded-xl bg-background">
                                    <SelectValue placeholder="Select Department" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">None / Unassigned</SelectItem>
                                    {INZAN_DEPARTMENTS.map(dept => (
                                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {inviteDepartment && (
                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold">Job Title / Position</Label>
                                  <Select value={inviteJobTitle} onValueChange={(val: any) => setInviteJobTitle(val || '')}>
                                    <SelectTrigger className="h-10 rounded-xl bg-background">
                                      <SelectValue placeholder="Select Job Title" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="">None / Unassigned</SelectItem>
                                      {(INZAN_JOB_TITLES[inviteDepartment as InzanDepartment] || []).map(title => (
                                        <SelectItem key={title} value={title}>{title}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {inviteDepartment === 'Fitness' && (
                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold">Trainer Contract Type</Label>
                                  <Select value={inviteTrainerType} onValueChange={(val: any) => setInviteTrainerType(val || 'Full-Time')}>
                                    <SelectTrigger className="h-10 rounded-xl bg-background">
                                      <SelectValue placeholder="Select Contract Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Full-Time">Full-Time Trainer (1-12)</SelectItem>
                                      <SelectItem value="Part-Time">Part-Time Trainer (1-10)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-[11px] text-muted-foreground pt-1">
                            Note: Account created with default password <span className="font-mono font-semibold text-foreground">12345678</span>. User is prompted to change on first login.
                          </p>
                        </div>

                        {/* Right Column: Permissions & Access Engine */}
                        <div className="lg:col-span-7 xl:col-span-8 p-5 sm:p-6 overflow-y-auto space-y-5 bg-background">
                          {/* Banner Card */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border shadow-xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-primary" />
                                <h4 className="font-bold text-sm text-foreground">Operational Permissions & Access</h4>
                                <Badge variant="outline" className="text-xs font-semibold border-primary/30 text-primary bg-primary/5">
                                  {Object.values(inviteUseCustomOverrides ? inviteCustomPermissions : (permissionTemplates.find(t => t.id === invitePermissionTemplateId)?.permissions || DEFAULT_ROLE_PERMISSIONS[inviteRole] || {})).filter(Boolean).length} / 88 active
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Assign an operational template or customize specific user-level permission overrides.
                              </p>
                            </div>

                            <div className="flex items-center gap-2 bg-muted/60 p-1.5 rounded-xl border shrink-0">
                              <span className={`text-xs ${!inviteUseCustomOverrides ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                                Template
                              </span>
                              <Switch
                                checked={inviteUseCustomOverrides}
                                onCheckedChange={(checked) => {
                                  setInviteUseCustomOverrides(checked);
                                  if (checked && Object.keys(inviteCustomPermissions).length === 0) {
                                    const template = permissionTemplates.find(t => t.id === invitePermissionTemplateId);
                                    const basePerms = template?.permissions || DEFAULT_ROLE_PERMISSIONS[inviteRole] || ALL_PERMISSIONS_FALSE;
                                    setInviteCustomPermissions({ ...basePerms });
                                  }
                                }}
                              />
                              <span className={`text-xs ${inviteUseCustomOverrides ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                                Custom Overrides
                              </span>
                            </div>
                          </div>

                          {/* Template Selection Dropdown */}
                          <div className="space-y-1.5 p-3.5 rounded-2xl bg-muted/30 border">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold text-foreground">Assigned Permission Template</Label>
                              {invitePermissionTemplateId && (
                                <span className="text-[11px] text-muted-foreground">
                                  {permissionTemplates.find(t => t.id === invitePermissionTemplateId)?.description || ''}
                                </span>
                              )}
                            </div>
                            <Select 
                              value={invitePermissionTemplateId} 
                              onValueChange={(val: any) => handleInviteTemplateChange(val || '')}
                            >
                              <SelectTrigger className="h-10 rounded-xl bg-background">
                                <SelectValue placeholder="Select a Permission Template..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Role Defaults (Inherit from {inviteRole})</SelectItem>
                                {permissionTemplates.map(tpl => (
                                  <SelectItem key={tpl.id} value={tpl.id}>
                                    {tpl.name} {tpl.isSystem ? '• (System Default)' : '• (Custom Template)'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Permission Matrix or Preview */}
                          {inviteUseCustomOverrides ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
                                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                  Custom overrides are active. Adjust any of the 88 checkboxes below.
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const template = permissionTemplates.find(t => t.id === invitePermissionTemplateId);
                                    const basePerms = template?.permissions || DEFAULT_ROLE_PERMISSIONS[inviteRole] || ALL_PERMISSIONS_FALSE;
                                    setInviteCustomPermissions({ ...basePerms });
                                  }}
                                  className="h-7 text-xs text-primary hover:underline px-2.5 rounded-lg"
                                >
                                  Reset to Template Defaults
                                </Button>
                              </div>

                              <PermissionMatrixEditor
                                permissions={inviteCustomPermissions}
                                onChange={setInviteCustomPermissions}
                                defaultExpanded={false}
                              />
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="text-xs text-muted-foreground px-1">
                                Permissions are currently inherited from{' '}
                                <strong className="text-foreground">
                                  {permissionTemplates.find(t => t.id === invitePermissionTemplateId)?.name || `Default ${inviteRole} role`}
                                </strong>. Toggle <strong>"Custom Overrides"</strong> above to adjust individual permissions.
                              </div>
                              <PermissionMatrixEditor
                                permissions={
                                  (permissionTemplates.find(t => t.id === invitePermissionTemplateId)?.permissions) ||
                                  (inviteRole ? DEFAULT_ROLE_PERMISSIONS[inviteRole] : undefined) ||
                                  ALL_PERMISSIONS_FALSE
                                }
                                onChange={() => {}}
                                readOnly={true}
                                defaultExpanded={false}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sticky Footer */}
                    <div className="px-6 py-3.5 border-t bg-card/90 backdrop-blur-sm flex items-center justify-between shrink-0">
                      <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-primary" /> Changes will be saved to the staff registry.
                      </div>
                      <div className="flex items-center gap-2.5 ml-auto">
                        <Button variant="outline" onClick={() => setIsInviteOpen(false)} disabled={isInviting} className="h-9 rounded-xl px-4">
                          Cancel
                        </Button>
                        <Button onClick={handleInvite} disabled={isInviting} className="h-9 rounded-xl px-5">
                          {isInviting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating Account...
                            </>
                          ) : (
                            'Send Invitation'
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Current Role</TableHead>
                    <TableHead>Permissions</TableHead>
                    {isInzan && <TableHead>Department & Title</TableHead>}
                    <TableHead>Change Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{user.name}</span>
                          {user.id === currentUser.id && <Badge variant="outline" className="ml-1">You</Badge>}
                          {user.status === 'nonworking' && (
                            <Badge variant="destructive" className="ml-1 bg-red-50 text-red-700 border-red-200">Non-Working</Badge>
                          )}
                          {user.isPending && (
                            <Badge variant="outline" className="ml-1 text-amber-600 border-amber-400 bg-amber-50 gap-1">
                              <Clock className="h-3 w-3" /> Pending Invite
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.phone ? (
                          <span className="font-mono text-sm">{user.phone}</span>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50/50 text-xs font-normal">
                            No Phone
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.branch ? (
                          <Badge variant="outline" className="font-normal">{user.branch}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">All</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {safeFormatDistanceToNow(user.lastSeen, { addSuffix: true }, 'Never')}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        {user.permissionTemplateId ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit text-xs font-medium border-primary/40 text-primary bg-primary/5">
                              <Sliders className="w-3 h-3 mr-1" />
                              {permissionTemplates.find(t => t.id === user.permissionTemplateId)?.name || 'Assigned Template'}
                            </Badge>
                            {user.customPermissions && Object.keys(user.customPermissions).length > 0 && (
                              <Badge className="w-fit text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                Custom Overrides
                              </Badge>
                            )}
                          </div>
                        ) : user.customPermissions && Object.keys(user.customPermissions).length > 0 ? (
                          <Badge className="w-fit text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            Custom Overrides
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Role Defaults</span>
                        )}
                      </TableCell>
                      {isInzan && (
                        <TableCell>
                          {user.department ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="secondary" className="w-fit text-[11px] font-semibold">{user.department}</Badge>
                              {user.jobTitle && <span className="text-[10px] text-muted-foreground font-medium">{user.jobTitle}</span>}
                              {user.trainerType && <span className="text-[9px] text-primary font-mono">{user.trainerType}</span>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {canChangeRoles ? (
                          <Select 
                            defaultValue={user.role} 
                            onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                            disabled={user.id === currentUser.id} // Prevent self-demotion
                          >
                            <SelectTrigger className="w-[150px]">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rep">Rep</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="crm_admin">CRM Admin</SelectItem>
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-muted-foreground">Restricted</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Activate button for pending-invite users */}
                          {user.isPending && canChangeRoles && user.id !== currentUser.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleActivatePending(user)}
                              disabled={activatingUserId === user.id}
                              title="Activate account — creates login with password 12345678"
                              className="text-amber-600 hover:bg-amber-50"
                            >
                              {activatingUserId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : activatedUserId === user.id ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <KeyRound className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {(user.role === 'rep' || user.role === 'manager') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPerformanceUser(user)}
                              title="View Performance & Save Targets"
                            >
                              <BarChart className="h-4 w-4 text-blue-500" />
                            </Button>
                          )}
                          {canChangeRoles && user.id !== currentUser.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(user)}
                              >
                                <Edit className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-amber-600 hover:bg-amber-50"
                                onClick={() => handleForcePasswordReset(user)}
                                disabled={forcingResetUserId === user.id}
                                title="Force password reset on next login"
                              >
                                {forcingResetUserId === user.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <RotateCcw className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteUser(user.id)}
                                disabled={user.role === 'super_admin'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Password Reset Requests */}
          {passwordResetRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  Password Reset Requests
                  <span className="ml-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                    {passwordResetRequests.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {passwordResetRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.name || '—'}</TableCell>
                        <TableCell>{req.email}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {safeFormatDistanceToNow(req.requestedAt, { addSuffix: true }, 'Recently')}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={approvingResetId === req.id || approvedResetId === req.id}
                              onClick={async () => {
                                setApprovingResetId(req.id);
                                try {
                                  await approvePasswordResetRequest(req.id, req.email);
                                  setApprovedResetId(req.id);
                                  setTimeout(() => setApprovedResetId(null), 3000);
                                } catch (err: any) {
                                  window.alert(`Failed to send reset email: ${err?.message || 'Unknown error'}`);
                                } finally {
                                  setApprovingResetId(null);
                                }
                              }}
                            >
                              {approvingResetId === req.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : approvedResetId === req.id ? (
                                <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                              ) : (
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                              )}
                              {approvedResetId === req.id ? 'Sent!' : 'Approve & Send Email'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => { await denyPasswordResetRequest(req.id); }}
                            >
                              Deny
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4 m-0 outline-none">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Look up member or coach portal credentials and account access status by ID, email, or name.</p>
          </div>

          <form onSubmit={handleMemberSearch} className="flex gap-2 max-w-md">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search member ID or name..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isSearching}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Search
            </Button>
          </form>

          {searchResults.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Email (Login Username)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-sm">{user.clientRecordId || user.coachId || '—'}</TableCell>
                        <TableCell className="font-semibold">{user.name}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                            {user.role === 'coach' ? 'Coach' : 'Member'}
                          </span>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                              user.isPending
                                ? 'text-amber-600'
                                : user.status === 'nonworking'
                                  ? 'text-muted-foreground'
                                  : 'text-green-600'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                user.isPending
                                  ? 'bg-amber-500'
                                  : user.status === 'nonworking'
                                    ? 'bg-muted-foreground'
                                    : 'bg-green-500'
                              }`} />
                              {user.isPending ? 'Pending (not logged in yet)' : user.status === 'nonworking' ? 'Non-Working' : 'Active'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {user.lastSeen ? `Last seen ${safeFormatDistanceToNow(user.lastSeen, { addSuffix: true })}` : 'Never logged in'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(user)}
                              title="Edit member credentials"
                            >
                              <Edit className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-amber-600 hover:bg-amber-50"
                              onClick={() => handleForcePasswordReset(user)}
                              disabled={forcingResetUserId === user.id}
                              title="Reset portal password to default (12345678)"
                            >
                              {forcingResetUserId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (window.confirm(`Delete ${user.role === 'coach' ? 'coach' : 'client'} portal account for ${user.name}?\n\nThis removes their login access and cannot be undone.`)) {
                                  deleteUser(user.id);
                                  setSearchResults(prev => prev.filter(r => r.id !== user.id));
                                }
                              }}
                              title="Delete portal account"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : searchQuery && !isSearching ? (
            <div className="py-12 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              No portal accounts found matching "{searchQuery}".
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground border border-dashed rounded-xl bg-card flex flex-col items-center justify-center gap-2">
              <Search className="h-8 w-8 opacity-20" />
              <p className="text-sm font-medium">Enter a Member ID, Coach ID, email, or full name to view portal account status.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-6 m-0 outline-none">
          <PermissionTemplatesTab
            users={users}
            currentUser={currentUser}
            templates={permissionTemplates}
            onCreateTemplate={createPermissionTemplate}
            onUpdateTemplate={updatePermissionTemplate}
            onDeleteTemplate={deletePermissionTemplate}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        {editingUser?.role === 'client' ? (
          <DialogContent className="w-[95vw] sm:max-w-lg rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle>Edit Member Portal Credentials</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)} 
                  placeholder="User's full name"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={editEmail} 
                  onChange={(e) => setEditEmail(e.target.value)} 
                  placeholder="User's email"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile Phone Number</Label>
                <Input 
                  type="tel"
                  value={editPhone} 
                  onChange={(e) => setEditPhone(e.target.value)} 
                  placeholder="e.g. +201000680580"
                  className="h-10 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Used for SMS password resets and login verification.</p>
              </div>
              <div className="space-y-2">
                <Label>Member ID (clientRecordId)</Label>
                <Input 
                  value={editClientRecordId} 
                  onChange={(e) => setEditClientRecordId(e.target.value)} 
                  placeholder="e.g. 1043"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button onClick={handleUpdateUserDetails}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[94vw] md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] h-[92vh] max-h-[92vh] p-0 flex flex-col gap-0 rounded-3xl border shadow-2xl bg-background overflow-hidden">
            {/* Sticky Header */}
            <div className="px-6 py-4 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between shrink-0 pr-14">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0">
                  {editName ? editName.charAt(0).toUpperCase() : <UserIcon className="h-5 w-5" />}
                </div>
                <div>
                  <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    {editingUser?.name || 'Edit Staff Profile'}
                    {editingUser?.role && (
                      <Badge variant="outline" className="text-xs font-mono uppercase tracking-wider">
                        {editingUser.role}
                      </Badge>
                    )}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manage staff profile, branch assignments, sales targets, and granular permission access.
                  </p>
                </div>
              </div>
            </div>

            {/* Main Workbench Body: 2 Columns on Desktop */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12 h-full divide-y lg:divide-y-0 lg:divide-x">
                
                {/* Left Column: Staff Identity & Profile */}
                <div className="lg:col-span-5 xl:col-span-4 p-5 sm:p-6 overflow-y-auto space-y-5 bg-muted/15">
                  {/* Identity Preview Card */}
                  <div className="p-4 rounded-2xl border bg-card/60 shadow-xs flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                      {editName ? editName.charAt(0).toUpperCase() : <UserIcon className="h-6 w-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base text-foreground truncate">{editName || 'Staff Member'}</h3>
                      <p className="text-xs text-muted-foreground truncate">{editEmail || 'No email'}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {editingUser?.role && getRoleBadge(editingUser.role)}
                        <Badge variant={editStatus === 'working' ? 'outline' : 'secondary'} className={`text-[10px] ${editStatus === 'working' ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10' : 'text-muted-foreground'}`}>
                          {editStatus === 'working' ? 'Working' : 'Non-Working'}
                        </Badge>
                        {editBranch && (
                          <Badge variant="outline" className="text-[10px]">
                            {editBranch}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Personal Information Group */}
                  <div className="space-y-3.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5 text-primary" /> Personal Information
                    </h4>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Full Name *</Label>
                      <Input 
                        value={editName} 
                        onChange={(e) => setEditName(e.target.value)} 
                        placeholder="User's full name"
                        className="h-10 rounded-xl bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Email Address *</Label>
                      <Input 
                        type="email"
                        value={editEmail} 
                        onChange={(e) => setEditEmail(e.target.value)} 
                        placeholder="User's email"
                        className="h-10 rounded-xl bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Mobile Phone Number</Label>
                      <Input 
                        type="tel"
                        value={editPhone} 
                        onChange={(e) => setEditPhone(e.target.value)} 
                        placeholder="e.g. +201000680580"
                        className="h-10 rounded-xl bg-background"
                      />
                      <p className="text-[11px] text-muted-foreground">Used for SMS password resets and login verification.</p>
                    </div>
                  </div>

                  {/* Branch & Employment Group */}
                  <div className="space-y-3.5 pt-4 border-t">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-primary" /> Branch & Targets
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Assigned Branch</Label>
                        <Select value={editBranch} onValueChange={(v) => setEditBranch(v || '')}>
                          <SelectTrigger className="h-10 rounded-xl bg-background">
                            <SelectValue placeholder="All Branches" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">All Branches</SelectItem>
                            {branches.map(b => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Employment Status</Label>
                        <Select value={editStatus} onValueChange={(val: any) => val && setEditStatus(val)}>
                          <SelectTrigger className="h-10 rounded-xl bg-background">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="working">Working</SelectItem>
                            <SelectItem value="nonworking">Non-Working</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Personal Sales Target (Optional)</Label>
                      <Input 
                        type="number"
                        value={editTarget} 
                        onChange={(e) => setEditTarget(e.target.value)} 
                        placeholder="Leave blank to use global target"
                        className="h-10 rounded-xl bg-background"
                      />
                    </div>
                  </div>

                  {/* INZAN Org Structure */}
                  {isInzan && (
                    <div className="space-y-3.5 pt-4 border-t">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" /> INZAN Organization
                      </h4>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Department</Label>
                        <Select 
                          value={editDepartment} 
                          onValueChange={(val: any) => {
                            setEditDepartment(val || '');
                            setEditJobTitle('');
                          }}
                        >
                          <SelectTrigger className="h-10 rounded-xl bg-background">
                            <SelectValue placeholder="Select Department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None / Unassigned</SelectItem>
                            {INZAN_DEPARTMENTS.map(dept => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {editDepartment && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Job Title / Position</Label>
                          <Select value={editJobTitle} onValueChange={(val: any) => setEditJobTitle(val || '')}>
                            <SelectTrigger className="h-10 rounded-xl bg-background">
                              <SelectValue placeholder="Select Job Title" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None / Unassigned</SelectItem>
                              {(INZAN_JOB_TITLES[editDepartment as InzanDepartment] || []).map(title => (
                                <SelectItem key={title} value={title}>{title}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {editDepartment === 'Fitness' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Trainer Contract Type</Label>
                          <Select value={editTrainerType} onValueChange={(val: any) => setEditTrainerType(val || 'Full-Time')}>
                            <SelectTrigger className="h-10 rounded-xl bg-background">
                              <SelectValue placeholder="Select Contract Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Full-Time">Full-Time Trainer (1-12)</SelectItem>
                              <SelectItem value="Part-Time">Part-Time Trainer (1-10)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground pt-1">
                    Note: Updating email allows user to login with the new email address.
                  </p>
                </div>

                {/* Right Column: Permissions & Access Engine */}
                <div className="lg:col-span-7 xl:col-span-8 p-5 sm:p-6 overflow-y-auto space-y-5 bg-background">
                  {/* Banner Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <h4 className="font-bold text-sm text-foreground">Operational Permissions & Access</h4>
                        <Badge variant="outline" className="text-xs font-semibold border-primary/30 text-primary bg-primary/5">
                          {Object.values(editUseCustomOverrides ? editCustomPermissions : (permissionTemplates.find(t => t.id === editPermissionTemplateId)?.permissions || (editingUser?.role ? DEFAULT_ROLE_PERMISSIONS[editingUser.role] : undefined) || {})).filter(Boolean).length} / 88 active
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Select a gym permission template or customize granular user overrides.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-muted/60 p-1.5 rounded-xl border shrink-0">
                      <span className={`text-xs ${!editUseCustomOverrides ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                        Template
                      </span>
                      <Switch
                        checked={editUseCustomOverrides}
                        onCheckedChange={(checked) => {
                          setEditUseCustomOverrides(checked);
                          if (checked && Object.keys(editCustomPermissions).length === 0) {
                            const template = permissionTemplates.find(t => t.id === editPermissionTemplateId);
                            const basePerms = template?.permissions || (editingUser?.role ? DEFAULT_ROLE_PERMISSIONS[editingUser.role] : undefined) || ALL_PERMISSIONS_FALSE;
                            setEditCustomPermissions({ ...basePerms });
                          }
                        }}
                      />
                      <span className={`text-xs ${editUseCustomOverrides ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                        Custom Overrides
                      </span>
                    </div>
                  </div>

                  {/* Template Selection Dropdown */}
                  <div className="space-y-1.5 p-3.5 rounded-2xl bg-muted/30 border">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">Assigned Permission Template</Label>
                      {editPermissionTemplateId && (
                        <span className="text-[11px] text-muted-foreground">
                          {permissionTemplates.find(t => t.id === editPermissionTemplateId)?.description || ''}
                        </span>
                      )}
                    </div>
                    <Select 
                      value={editPermissionTemplateId} 
                      onValueChange={(val: any) => {
                        const newTplId = val || '';
                        setEditPermissionTemplateId(newTplId);
                        if (!editUseCustomOverrides) {
                          const template = permissionTemplates.find(t => t.id === newTplId);
                          const basePerms = template?.permissions || (editingUser?.role ? DEFAULT_ROLE_PERMISSIONS[editingUser.role] : undefined) || ALL_PERMISSIONS_FALSE;
                          setEditCustomPermissions({ ...basePerms });
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-background">
                        <SelectValue placeholder="Select a Permission Template..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Role Defaults (Inherit from {editingUser?.role || 'role'})</SelectItem>
                        {permissionTemplates.map(tpl => (
                          <SelectItem key={tpl.id} value={tpl.id}>
                            {tpl.name} {tpl.isSystem ? '• (System Default)' : '• (Custom Template)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Permission Matrix or Preview */}
                  {editUseCustomOverrides ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          Custom overrides are active. Adjust any of the 88 checkboxes below.
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const template = permissionTemplates.find(t => t.id === editPermissionTemplateId);
                            const basePerms = template?.permissions || (editingUser?.role ? DEFAULT_ROLE_PERMISSIONS[editingUser.role] : undefined) || ALL_PERMISSIONS_FALSE;
                            setEditCustomPermissions({ ...basePerms });
                          }}
                          className="h-7 text-xs text-primary hover:underline px-2.5 rounded-lg"
                        >
                          Reset to Template Defaults
                        </Button>
                      </div>

                      <PermissionMatrixEditor
                        permissions={editCustomPermissions}
                        onChange={setEditCustomPermissions}
                        defaultExpanded={false}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground px-1">
                        Permissions are currently inherited from{' '}
                        <strong className="text-foreground">
                          {permissionTemplates.find(t => t.id === editPermissionTemplateId)?.name || `Default ${editingUser?.role || 'role'} role`}
                        </strong>. Toggle <strong>"Custom Overrides"</strong> above to adjust individual permissions.
                      </div>
                      <PermissionMatrixEditor
                        permissions={
                          (permissionTemplates.find(t => t.id === editPermissionTemplateId)?.permissions) ||
                          (editingUser?.role ? DEFAULT_ROLE_PERMISSIONS[editingUser.role] : undefined) ||
                          ALL_PERMISSIONS_FALSE
                        }
                        onChange={() => {}}
                        readOnly={true}
                        defaultExpanded={false}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="px-6 py-3.5 border-t bg-card/90 backdrop-blur-sm flex items-center justify-between shrink-0">
              <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" /> Changes will be saved and recorded to audit logs.
              </div>
              <div className="flex items-center gap-2.5 ml-auto">
                <Button variant="outline" onClick={() => setEditingUser(null)} className="h-9 rounded-xl px-4">
                  Cancel
                </Button>
                <Button onClick={handleUpdateUserDetails} className="h-9 rounded-xl px-5">
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {performanceUser && (
        <UserPerformanceDialog
          user={performanceUser}
          isOpen={!!performanceUser}
          onClose={() => setPerformanceUser(null)}
        />
      )}
    </div>
  );
}
