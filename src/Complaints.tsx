import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAppContext } from './context';
import { useSettings } from './contexts/SettingsContext';
import { db } from './firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { Complaint, ComplaintCategory } from './types';
import { downloadCSV } from './utils/download';
import { format } from 'date-fns';
import { MessageSquare, Plus, AlertTriangle, CheckCircle2, Clock, XCircle, Star, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const priorityBadgeClass = (priority: string) => {
  switch (priority) {
    case 'Low': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'Medium': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'High': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
    case 'Critical': return 'bg-red-500/10 text-red-600 dark:text-red-400';
    default: return 'bg-gray-500/10 text-gray-600';
  }
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'Open': return 'bg-red-500/10 text-red-600 dark:text-red-400';
    case 'In Progress': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'Resolved': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'Closed': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
    default: return 'bg-gray-500/10 text-gray-600';
  }
};

const statusBorderClass = (status: string) => {
  switch (status) {
    case 'Open': return 'border-l-4 border-red-500';
    case 'In Progress': return 'border-l-4 border-amber-500';
    case 'Resolved': return 'border-l-4 border-emerald-500';
    case 'Closed': return 'border-l-4 border-gray-500';
    default: return '';
  }
};

const defaultNewComplaint = {
  title: '',
  description: '',
  category: '',
  priority: 'Medium' as const,
  memberId: '',
  memberName: '',
  branch: '',
  memberSearch: '',
};

export default function Complaints() {
  const { currentUser, clients } = useAppContext();
  const { branches } = useSettings();

  // ── Data state ──
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<'complaints' | 'categories'>('complaints');
  const [addOpen, setAddOpen] = useState(false);
  const [detailComplaint, setDetailComplaint] = useState<Complaint | null>(null);
  const [detailStatus, setDetailStatus] = useState('');
  const [detailResolutionNotes, setDetailResolutionNotes] = useState('');
  const [newComplaint, setNewComplaint] = useState({ ...defaultNewComplaint });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [memberSearchFocused, setMemberSearchFocused] = useState(false);

  // ── Filters ──
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterBranch, setFilterBranch] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');

  // ── Firestore listeners ──
  useEffect(() => {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Complaint));
      setComplaints(data);
    }, (err) => {
      console.error('complaints listener error:', err);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'complaintCategories'), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ComplaintCategory));
      setCategories(data);
    }, (err) => {
      console.error('complaintCategories listener error:', err);
    });
    return () => unsub();
  }, []);

  // ── KPI counts ──
  const openCount = complaints.filter((c) => c.status === 'Open').length;
  const inProgressCount = complaints.filter((c) => c.status === 'In Progress').length;
  const resolvedCount = complaints.filter((c) => c.status === 'Resolved').length;
  const closedCount = complaints.filter((c) => c.status === 'Closed').length;

  // ── Filtered complaints ──
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (filterStatus !== 'All' && c.status !== filterStatus) return false;
      if (filterPriority !== 'All' && c.priority !== filterPriority) return false;
      if (filterBranch !== 'All' && c.branch !== filterBranch) return false;
      if (filterCategory !== 'All' && c.category !== filterCategory) return false;
      return true;
    });
  }, [complaints, filterStatus, filterPriority, filterBranch, filterCategory]);

  // ── Member search for new complaint dialog ──
  const memberMatches = useMemo(() => {
    if (!newComplaint.memberSearch || newComplaint.memberSearch.length < 2) return [];
    const search = newComplaint.memberSearch.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(search)).slice(0, 8);
  }, [newComplaint.memberSearch, clients]);

  // ── Add Complaint ──
  const handleAddComplaint = async () => {
    if (!newComplaint.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!newComplaint.description.trim()) {
      toast.error('Description is required');
      return;
    }
    try {
      await addDoc(collection(db, 'complaints'), {
        title: newComplaint.title.trim(),
        description: newComplaint.description.trim(),
        category: newComplaint.category || '',
        priority: newComplaint.priority,
        status: 'Open',
        memberId: newComplaint.memberId || '',
        memberName: newComplaint.memberName || '',
        branch: newComplaint.branch || '',
        resolutionNotes: '',
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || '',
      });
      toast.success('Complaint submitted successfully');
      setAddOpen(false);
      setNewComplaint({ ...defaultNewComplaint });
    } catch (err: any) {
      toast.error('Failed to submit complaint: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Update Complaint (detail dialog) ──
  const handleUpdateComplaint = async () => {
    if (!detailComplaint) return;
    try {
      const updates: Record<string, any> = {
        status: detailStatus,
        resolutionNotes: detailResolutionNotes,
      };
      if (detailStatus === 'Resolved' && detailComplaint.status !== 'Resolved') {
        updates.resolvedAt = new Date().toISOString();
        updates.resolvedBy = currentUser?.name || '';
      }
      await updateDoc(doc(db, 'complaints', detailComplaint.id), updates);
      toast.success('Complaint updated');
      setDetailComplaint(null);
    } catch (err: any) {
      toast.error('Failed to update: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Delete Complaint ──
  const handleDeleteComplaint = async (complaint: Complaint) => {
    if (!window.confirm(`Delete complaint "${complaint.title}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'complaints', complaint.id));
      toast.success('Complaint deleted');
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Add Category ──
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await addDoc(collection(db, 'complaintCategories'), {
        name: newCategoryName.trim(),
        createdAt: new Date().toISOString(),
      });
      toast.success('Category added');
      setNewCategoryName('');
    } catch (err: any) {
      toast.error('Failed to add category: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Delete Category ──
  const handleDeleteCategory = async (cat: ComplaintCategory) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'complaintCategories', cat.id));
      toast.success('Category deleted');
    } catch (err: any) {
      toast.error('Failed to delete category: ' + (err.message || 'Unknown error'));
    }
  };

  // ── CSV Export ──
  const handleExportCSV = () => {
    const header = 'Title,Category,Priority,Status,Member,Branch,Date,Resolution Notes\n';
    const rows = filteredComplaints.map((c) =>
      `"${c.title}","${c.category || ''}","${c.priority}","${c.status}","${c.memberName || ''}","${c.branch || ''}","${c.createdAt ? format(new Date(c.createdAt), 'yyyy-MM-dd') : ''}","${(c.resolutionNotes || '').replace(/"/g, '""')}"`
    ).join('\n');
    downloadCSV(header + rows, `complaints-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('CSV exported');
  };

  // ── Open detail dialog ──
  const openDetail = (complaint: Complaint) => {
    setDetailComplaint(complaint);
    setDetailStatus(complaint.status);
    setDetailResolutionNotes(complaint.resolutionNotes || '');
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-7 w-7 text-amber-500" />
          <h1 className="text-2xl font-bold">Complaints &amp; Suggestions</h1>
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1">
            <Star className="h-3 w-3" /> Premium
          </Badge>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={statusBorderClass('Open')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{openCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className={statusBorderClass('In Progress')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{inProgressCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className={statusBorderClass('Resolved')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">{resolvedCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card className={statusBorderClass('Closed')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Closed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-gray-500" />
              <span className="text-2xl font-bold">{closedCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Internal Tabs ── */}
      <div className="flex gap-2 border-b pb-1">
        <Button
          variant={activeTab === 'complaints' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('complaints')}
        >
          <MessageSquare className="h-4 w-4 mr-1" /> Complaints
        </Button>
        <Button
          variant={activeTab === 'categories' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('categories')}
        >
          <Tag className="h-4 w-4 mr-1" /> Categories
        </Button>
      </div>

      {/* ════════════════ COMPLAINTS TAB ════════════════ */}
      {activeTab === 'complaints' && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Complaint
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              Export CSV
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterStatus} onValueChange={v => setFilterStatus(v || 'All')}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={v => setFilterPriority(v || 'All')}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Priorities</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterBranch} onValueChange={v => setFilterBranch(v || 'All')}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Branches</SelectItem>
                {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={v => setFilterCategory(v || 'All')}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Complaints Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-left p-3 font-medium">Priority</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Member</th>
                      <th className="text-left p-3 font-medium">Branch</th>
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplaints.length === 0 ? (
                      <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No complaints found</td></tr>
                    ) : (
                      filteredComplaints.map((complaint) => (
                        <tr key={complaint.id} className="border-b hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openDetail(complaint)}>
                          <td className="p-3 font-medium">{complaint.title}</td>
                          <td className="p-3 text-muted-foreground">{complaint.category || '—'}</td>
                          <td className="p-3">
                            <Badge className={priorityBadgeClass(complaint.priority)}>{complaint.priority}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge className={statusBadgeClass(complaint.status)}>{complaint.status}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">{complaint.memberName || '—'}</td>
                          <td className="p-3 text-muted-foreground">{complaint.branch || '—'}</td>
                          <td className="p-3 text-muted-foreground">
                            {complaint.createdAt ? format(new Date(complaint.createdAt), 'MMM dd, yyyy') : '—'}
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openDetail(complaint)} title="View">
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteComplaint(complaint)} title="Delete">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════ CATEGORIES TAB ════════════════ */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Add category inline */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="New category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="max-w-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <Button size="sm" onClick={handleAddCategory}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {/* Categories Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Category Name</th>
                      <th className="text-left p-3 font-medium">Created At</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.length === 0 ? (
                      <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No categories yet</td></tr>
                    ) : (
                      categories.map((cat) => (
                        <tr key={cat.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium">{cat.name}</td>
                          <td className="p-3 text-muted-foreground">
                            {cat.createdAt ? format(new Date(cat.createdAt), 'MMM dd, yyyy') : '—'}
                          </td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteCategory(cat)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════ NEW COMPLAINT DIALOG ════════════════ */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); setNewComplaint({ ...defaultNewComplaint }); } else { setAddOpen(true); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Complaint / Suggestion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="complaint-title">Title *</Label>
              <Input id="complaint-title" value={newComplaint.title} onChange={(e) => setNewComplaint({ ...newComplaint, title: e.target.value })} placeholder="Brief summary of the issue" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="complaint-desc">Description *</Label>
              <Textarea id="complaint-desc" value={newComplaint.description} onChange={(e) => setNewComplaint({ ...newComplaint, description: e.target.value })} placeholder="Detailed description..." rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newComplaint.category} onValueChange={(v) => setNewComplaint({ ...newComplaint, category: v === '__none__' ? '' : (v || '') })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newComplaint.priority} onValueChange={(v) => setNewComplaint({ ...newComplaint, priority: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 relative">
              <Label htmlFor="complaint-member">Member (optional)</Label>
              <Input
                id="complaint-member"
                value={newComplaint.memberSearch}
                onChange={(e) => setNewComplaint({ ...newComplaint, memberSearch: e.target.value, memberId: '', memberName: '' })}
                onFocus={() => setMemberSearchFocused(true)}
                onBlur={() => setTimeout(() => setMemberSearchFocused(false), 200)}
                placeholder="Search member by name..."
              />
              {newComplaint.memberName && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Selected: {newComplaint.memberName}
                </p>
              )}
              {memberSearchFocused && memberMatches.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-40 overflow-y-auto">
                  {memberMatches.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setNewComplaint({
                          ...newComplaint,
                          memberId: client.id,
                          memberName: client.name,
                          memberSearch: client.name,
                        });
                        setMemberSearchFocused(false);
                      }}
                    >
                      {client.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={newComplaint.branch} onValueChange={(v) => setNewComplaint({ ...newComplaint, branch: v === '__none__' ? '' : (v || '') })}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setNewComplaint({ ...defaultNewComplaint }); }}>Cancel</Button>
            <Button onClick={handleAddComplaint}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ DETAIL / UPDATE DIALOG ════════════════ */}
      <Dialog open={!!detailComplaint} onOpenChange={(open) => { if (!open) setDetailComplaint(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complaint Details</DialogTitle>
          </DialogHeader>
          {detailComplaint && (
            <div className="space-y-4">
              {/* Read-only info */}
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Title:</span>
                  <span className="ml-2">{detailComplaint.title}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Description:</span>
                  <p className="mt-1 whitespace-pre-wrap">{detailComplaint.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium text-muted-foreground">Category:</span>
                    <span className="ml-1">{detailComplaint.category || '—'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Priority:</span>
                    <Badge className={`ml-1 ${priorityBadgeClass(detailComplaint.priority)}`}>{detailComplaint.priority}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium text-muted-foreground">Member:</span>
                    <span className="ml-1">{detailComplaint.memberName || '—'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Branch:</span>
                    <span className="ml-1">{detailComplaint.branch || '—'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium text-muted-foreground">Created:</span>
                    <span className="ml-1">{detailComplaint.createdAt ? format(new Date(detailComplaint.createdAt), 'MMM dd, yyyy') : '—'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Created By:</span>
                    <span className="ml-1">{detailComplaint.createdBy || '—'}</span>
                  </div>
                </div>
                {detailComplaint.resolvedAt && (
                  <div className="grid grid-cols-2 gap-2 border-t pt-2">
                    <div>
                      <span className="font-medium text-muted-foreground">Resolved At:</span>
                      <span className="ml-1">{format(new Date(detailComplaint.resolvedAt), 'MMM dd, yyyy')}</span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Resolved By:</span>
                      <span className="ml-1">{detailComplaint.resolvedBy || '—'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Editable status */}
              <div className="border-t pt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={detailStatus} onValueChange={v => setDetailStatus(v || 'Open')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resolution-notes">Resolution Notes</Label>
                  <Textarea
                    id="resolution-notes"
                    value={detailResolutionNotes}
                    onChange={(e) => setDetailResolutionNotes(e.target.value)}
                    placeholder="How was this resolved?"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailComplaint(null)}>Cancel</Button>
            <Button onClick={handleUpdateComplaint}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
