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
import { LostFoundItem, LostFoundCategory } from './types';
import { downloadCSV } from './utils/download';
import { format } from 'date-fns';
import { Search, Plus, Package, CheckCircle2, Trash2, Tag, Star, Eye } from 'lucide-react';
import { toast } from 'sonner';

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'Found': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'Claimed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'Disposed': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
    default: return 'bg-gray-500/10 text-gray-600';
  }
};

const defaultNewItem = {
  name: '',
  description: '',
  category: '',
  foundDate: format(new Date(), 'yyyy-MM-dd'),
  foundBy: '',
  branch: '',
  status: 'Found' as const,
};

export default function LostAndFound() {
  const { currentUser } = useAppContext();
  const { branches } = useSettings();

  // ── Data state ──
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [categories, setCategories] = useState<LostFoundCategory[]>([]);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [addOpen, setAddOpen] = useState(false);
  const [viewItem, setViewItem] = useState<LostFoundItem | null>(null);
  const [claimItem, setClaimItem] = useState<LostFoundItem | null>(null);
  const [claimantName, setClaimantName] = useState('');
  const [newItem, setNewItem] = useState({ ...defaultNewItem });
  const [newCategoryName, setNewCategoryName] = useState('');

  // ── Filters ──
  const [filterBranch, setFilterBranch] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // ── Firestore listeners ──
  useEffect(() => {
    const q = query(collection(db, 'lostFoundItems'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LostFoundItem));
      setItems(data);
    }, (err) => {
      console.error('lostFoundItems listener error:', err);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lostFoundCategories'), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LostFoundCategory));
      setCategories(data);
    }, (err) => {
      console.error('lostFoundCategories listener error:', err);
    });
    return () => unsub();
  }, []);

  // ── KPI counts ──
  const totalCount = items.length;
  const foundCount = items.filter((i) => i.status === 'Found').length;
  const claimedCount = items.filter((i) => i.status === 'Claimed').length;

  // ── Filtered items ──
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterBranch !== 'All' && item.branch !== filterBranch) return false;
      if (filterCategory !== 'All' && item.category !== filterCategory) return false;
      if (filterStatus !== 'All' && item.status !== filterStatus) return false;
      return true;
    });
  }, [items, filterBranch, filterCategory, filterStatus]);

  // ── Add Item ──
  const handleAddItem = async () => {
    if (!newItem.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    try {
      await addDoc(collection(db, 'lostFoundItems'), {
        name: newItem.name.trim(),
        description: newItem.description.trim(),
        category: newItem.category || '',
        foundDate: newItem.foundDate,
        foundBy: newItem.foundBy.trim(),
        branch: newItem.branch,
        status: newItem.status,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || '',
      });
      toast.success('Item added successfully');
      setAddOpen(false);
      setNewItem({ ...defaultNewItem });
    } catch (err: any) {
      toast.error('Failed to add item: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Claim Item ──
  const handleClaim = async () => {
    if (!claimItem || !claimantName.trim()) {
      toast.error('Please enter claimant name');
      return;
    }
    try {
      await updateDoc(doc(db, 'lostFoundItems', claimItem.id), {
        status: 'Claimed',
        claimedByName: claimantName.trim(),
        claimedDate: new Date().toISOString(),
      });
      toast.success('Item marked as claimed');
      setClaimItem(null);
      setClaimantName('');
    } catch (err: any) {
      toast.error('Failed to claim item: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Mark Disposed ──
  const handleDispose = async (item: LostFoundItem) => {
    if (!window.confirm(`Mark "${item.name}" as disposed? This cannot be undone.`)) return;
    try {
      await updateDoc(doc(db, 'lostFoundItems', item.id), {
        status: 'Disposed',
        disposedDate: new Date().toISOString(),
      });
      toast.success('Item marked as disposed');
    } catch (err: any) {
      toast.error('Failed to update item: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Delete Item ──
  const handleDeleteItem = async (item: LostFoundItem) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'lostFoundItems', item.id));
      toast.success('Item deleted');
    } catch (err: any) {
      toast.error('Failed to delete item: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Add Category ──
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await addDoc(collection(db, 'lostFoundCategories'), {
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
  const handleDeleteCategory = async (cat: LostFoundCategory) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'lostFoundCategories', cat.id));
      toast.success('Category deleted');
    } catch (err: any) {
      toast.error('Failed to delete category: ' + (err.message || 'Unknown error'));
    }
  };

  // ── CSV Export ──
  const handleExportCSV = () => {
    const header = 'Name,Category,Found Date,Branch,Found By,Status\n';
    const rows = filteredItems.map((item) =>
      `"${item.name}","${item.category || ''}","${item.foundDate}","${item.branch || ''}","${item.foundBy || ''}","${item.status}"`
    ).join('\n');
    downloadCSV(header + rows, `lost-and-found-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Search className="h-7 w-7 text-amber-500" />
          <h1 className="text-2xl font-bold">Lost &amp; Found</h1>
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1">
            <Star className="h-3 w-3" /> Premium
          </Badge>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{totalCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unclaimed (Found)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{foundCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Claimed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">{claimedCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Internal Tabs ── */}
      <div className="flex gap-2 border-b pb-1">
        <Button
          variant={activeTab === 'items' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('items')}
        >
          <Package className="h-4 w-4 mr-1" /> Items
        </Button>
        <Button
          variant={activeTab === 'categories' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('categories')}
        >
          <Tag className="h-4 w-4 mr-1" /> Categories
        </Button>
      </div>

      {/* ════════════════ ITEMS TAB ════════════════ */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              Export CSV
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
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
            <Select value={filterStatus} onValueChange={v => setFilterStatus(v || 'All')}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Found">Found</SelectItem>
                <SelectItem value="Claimed">Claimed</SelectItem>
                <SelectItem value="Disposed">Disposed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Items Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Item Name</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-left p-3 font-medium">Found Date</th>
                      <th className="text-left p-3 font-medium">Branch</th>
                      <th className="text-left p-3 font-medium">Found By</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No items found</td></tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium">{item.name}</td>
                          <td className="p-3 text-muted-foreground">{item.category || '—'}</td>
                          <td className="p-3 text-muted-foreground">
                            {item.foundDate ? format(new Date(item.foundDate), 'MMM dd, yyyy') : '—'}
                          </td>
                          <td className="p-3 text-muted-foreground">{item.branch || '—'}</td>
                          <td className="p-3 text-muted-foreground">{item.foundBy || '—'}</td>
                          <td className="p-3">
                            <Badge className={statusBadgeClass(item.status)}>{item.status}</Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setViewItem(item)} title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {item.status === 'Found' && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => { setClaimItem(item); setClaimantName(''); }} title="Claim">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDispose(item)} title="Mark Disposed">
                                    <Package className="h-4 w-4 text-gray-500" />
                                  </Button>
                                </>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item)} title="Delete">
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

      {/* ════════════════ ADD ITEM DIALOG ════════════════ */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); setNewItem({ ...defaultNewItem }); } else { setAddOpen(true); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Lost &amp; Found Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-name">Item Name *</Label>
              <Input id="item-name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Water Bottle" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-desc">Description</Label>
              <Textarea id="item-desc" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="Additional details..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v === '__none__' ? '' : (v || '') })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-date">Found Date</Label>
                <Input id="item-date" type="date" value={newItem.foundDate} onChange={(e) => setNewItem({ ...newItem, foundDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-found-by">Found By</Label>
                <Input id="item-found-by" value={newItem.foundBy} onChange={(e) => setNewItem({ ...newItem, foundBy: e.target.value })} placeholder="Staff name" />
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={newItem.branch} onValueChange={(v) => setNewItem({ ...newItem, branch: v === '__none__' ? '' : (v || '') })}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={newItem.status} onValueChange={(v) => setNewItem({ ...newItem, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Found">Found</SelectItem>
                  <SelectItem value="Claimed">Claimed</SelectItem>
                  <SelectItem value="Disposed">Disposed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setNewItem({ ...defaultNewItem }); }}>Cancel</Button>
            <Button onClick={handleAddItem}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ VIEW DETAIL DIALOG ════════════════ */}
      <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-medium text-muted-foreground">Name:</span> <span className="ml-1">{viewItem.name}</span></div>
                <div><span className="font-medium text-muted-foreground">Status:</span> <Badge className={`ml-1 ${statusBadgeClass(viewItem.status)}`}>{viewItem.status}</Badge></div>
              </div>
              {viewItem.description && (
                <div><span className="font-medium text-muted-foreground">Description:</span> <p className="mt-1">{viewItem.description}</p></div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-medium text-muted-foreground">Category:</span> <span className="ml-1">{viewItem.category || '—'}</span></div>
                <div><span className="font-medium text-muted-foreground">Found Date:</span> <span className="ml-1">{viewItem.foundDate ? format(new Date(viewItem.foundDate), 'MMM dd, yyyy') : '—'}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-medium text-muted-foreground">Found By:</span> <span className="ml-1">{viewItem.foundBy || '—'}</span></div>
                <div><span className="font-medium text-muted-foreground">Branch:</span> <span className="ml-1">{viewItem.branch || '—'}</span></div>
              </div>
              {viewItem.status === 'Claimed' && (
                <div className="border-t pt-3 mt-3 space-y-1">
                  <div><span className="font-medium text-muted-foreground">Claimed By:</span> <span className="ml-1">{viewItem.claimedByName || '—'}</span></div>
                  <div><span className="font-medium text-muted-foreground">Claimed Date:</span> <span className="ml-1">{viewItem.claimedDate ? format(new Date(viewItem.claimedDate), 'MMM dd, yyyy') : '—'}</span></div>
                </div>
              )}
              {viewItem.status === 'Disposed' && viewItem.disposedDate && (
                <div className="border-t pt-3 mt-3">
                  <span className="font-medium text-muted-foreground">Disposed Date:</span> <span className="ml-1">{format(new Date(viewItem.disposedDate), 'MMM dd, yyyy')}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewItem(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ CLAIM DIALOG ════════════════ */}
      <Dialog open={!!claimItem} onOpenChange={(open) => { if (!open) { setClaimItem(null); setClaimantName(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Claim Item</DialogTitle>
          </DialogHeader>
          {claimItem && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Mark <strong>{claimItem.name}</strong> as claimed. Enter the name of the person claiming this item.
              </p>
              <div className="space-y-2">
                <Label htmlFor="claimant-name">Claimant Name *</Label>
                <Input
                  id="claimant-name"
                  value={claimantName}
                  onChange={(e) => setClaimantName(e.target.value)}
                  placeholder="Full name of claimant"
                  onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setClaimItem(null); setClaimantName(''); }}>Cancel</Button>
            <Button onClick={handleClaim}>Confirm Claim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
