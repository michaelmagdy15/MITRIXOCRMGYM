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
import { UserRole, User } from './types';
import { Shield, User as UserIcon, Plus, Trash2, Edit, BarChart, Clock, KeyRound, Loader2, CheckCircle2, RotateCcw, Search } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { UserPerformanceDialog } from './components/UserPerformanceDialog';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export default function Users() {
  const { users, currentUser, updateUser, inviteUser, deleteUser, activatePendingUser, passwordResetRequests, approvePasswordResetRequest, denyPasswordResetRequest } = useAuth();
  const { branches } = useSettings();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('rep');
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
  const [editCanDeletePayments, setEditCanDeletePayments] = useState(false);
  const [editCanViewGlobalDashboard, setEditCanViewGlobalDashboard] = useState(false);
  const [editCanAccessSettings, setEditCanAccessSettings] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editClientRecordId, setEditClientRecordId] = useState('');
  const [editStatus, setEditStatus] = useState<'working' | 'nonworking'>('working');

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
    setEditCanDeletePayments(user.can_delete_payments || false);
    setEditCanViewGlobalDashboard(user.can_view_global_dashboard || false);
    setEditCanAccessSettings(user.can_access_settings_and_history || false);
    setEditPhone(user.phone || '');
    setEditClientRecordId(user.clientRecordId || '');
    setEditStatus(user.status || 'working');
  };

  const handleUpdateUserDetails = () => {
    if (editingUser) {
      const updates: Partial<User> = {
        name: editName,
        email: editEmail
      };

      if (editingUser.role === 'client') {
        updates.phone = editPhone || undefined;
        updates.clientRecordId = editClientRecordId || undefined;
      } else {
        updates.branch = editBranch || undefined;
        updates.salesTarget = editTarget ? parseFloat(editTarget) : undefined;
        updates.can_delete_payments = editCanDeletePayments;
        updates.can_view_global_dashboard = editCanViewGlobalDashboard;
        updates.can_access_settings_and_history = editCanAccessSettings;
        updates.status = editStatus;
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
      const results: User[] = [];
      const usersRef = collection(db, 'users');
      
      // 1. If it's a number, query by clientRecordId
      if (/^\d+$/.test(term)) {
        const q1 = query(usersRef, where('role', '==', 'client'), where('clientRecordId', '==', term));
        const snap1 = await getDocs(q1);
        snap1.forEach(doc => {
          results.push({ ...doc.data(), id: doc.id } as User);
        });
      }
      
      // 2. Query by email (exact match)
      const q2 = query(usersRef, where('role', '==', 'client'), where('email', '==', term.toLowerCase()));
      const snap2 = await getDocs(q2);
      snap2.forEach(doc => {
        if (!results.some(r => r.id === doc.id)) {
          results.push({ ...doc.data(), id: doc.id } as User);
        }
      });

      // 3. Query by Name (prefix search - title cased prefix)
      const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
      const q3 = query(
        usersRef, 
        where('name', '>=', capitalizedTerm),
        where('name', '<=', capitalizedTerm + '\uf8ff')
      );
      const snap3 = await getDocs(q3);
      snap3.forEach(doc => {
        const data = doc.data();
        if (data.role === 'client' && !results.some(r => r.id === doc.id)) {
          results.push({ ...data, id: doc.id } as User);
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
      const functions = getFunctions();
      const forceReset = httpsCallable(functions, 'forcePasswordReset');
      await forceReset({ userId: user.id });
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

  const handleInvite = async () => {
    if (inviteEmail) {
      await inviteUser(inviteEmail, inviteRole, inviteName || undefined);
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('rep');
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
        </TabsList>

        <TabsContent value="staff" className="space-y-6 m-0 outline-none">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Manage CRM access and target metrics for gym staff.</p>
            {canInviteUsers && (
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger render={<Button />}>
                  <Plus className="mr-2 h-4 w-4" /> Invite User
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite New User</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input 
                        placeholder="e.g. Maison Mohamed" 
                        value={inviteName} 
                        onChange={(e) => setInviteName(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input 
                        type="email" 
                        placeholder="user@example.com" 
                        value={inviteEmail} 
                        onChange={(e) => setInviteEmail(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                        <SelectTrigger>
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
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                    <Button onClick={handleInvite}>Send Invitation</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Current Role</TableHead>
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
                        {user.branch ? (
                          <Badge variant="outline" className="font-normal">{user.branch}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">All</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.lastSeen ? formatDistanceToNow(parseISO(user.lastSeen), { addSuffix: true }) : 'Never'}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
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
                          {formatDistanceToNow(parseISO(req.requestedAt), { addSuffix: true })}
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
            <p className="text-sm text-muted-foreground">Search and manage client access credentials for the member app portal.</p>
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
                      <TableHead>Member ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email (Login Username)</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-sm">{user.clientRecordId || '—'}</TableCell>
                        <TableCell className="font-semibold">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.phone || '—'}</TableCell>
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
                                if (window.confirm(`Delete client portal account for ${user.name}?\n\nThis removes their login access and cannot be undone.`)) {
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
              No member accounts found matching "{searchQuery}".
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground border border-dashed rounded-xl bg-card flex flex-col items-center justify-center gap-2">
              <Search className="h-8 w-8 opacity-20" />
              <p className="text-sm font-medium">Enter a Member ID or full name to view portal account status.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser?.role === 'client' ? 'Edit Member Portal Credentials' : 'Edit User Profile'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)} 
                placeholder="User's full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                value={editEmail} 
                onChange={(e) => setEditEmail(e.target.value)} 
                placeholder="User's email"
              />
            </div>

            {editingUser?.role === 'client' ? (
              <>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input 
                    value={editPhone} 
                    onChange={(e) => setEditPhone(e.target.value)} 
                    placeholder="e.g. +201234567890"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Member ID (clientRecordId)</Label>
                  <Input 
                    value={editClientRecordId} 
                    onChange={(e) => setEditClientRecordId(e.target.value)} 
                    placeholder="e.g. 1043"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select value={editBranch} onValueChange={(v) => setEditBranch(v || '')}>
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label>Personal Sales Target (Optional)</Label>
                  <Input 
                    type="number"
                    value={editTarget} 
                    onChange={(e) => setEditTarget(e.target.value)} 
                    placeholder="Leave blank to use global target"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Employment Status</Label>
                  <Select value={editStatus} onValueChange={(val: any) => val && setEditStatus(val)}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working">Working</SelectItem>
                      <SelectItem value="nonworking">Non-Working</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base">Granular Permissions</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="can_delete" 
                      checked={editCanDeletePayments} 
                      onCheckedChange={(checked) => setEditCanDeletePayments(!!checked)} 
                    />
                    <Label htmlFor="can_delete" className="font-normal cursor-pointer">Can delete payments</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="can_global" 
                      checked={editCanViewGlobalDashboard} 
                      onCheckedChange={(checked) => setEditCanViewGlobalDashboard(!!checked)} 
                    />
                    <Label htmlFor="can_global" className="font-normal cursor-pointer">Can view global dashboard</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="can_settings" 
                      checked={editCanAccessSettings} 
                      onCheckedChange={(checked) => setEditCanAccessSettings(!!checked)} 
                    />
                    <Label htmlFor="can_settings" className="font-normal cursor-pointer">Can access settings & history logs</Label>
                  </div>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground pt-2">
              Note: Updating their email here allows them to login with the new email address.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleUpdateUserDetails}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
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
