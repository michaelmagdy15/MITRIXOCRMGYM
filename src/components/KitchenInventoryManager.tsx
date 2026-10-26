import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { InventoryProduct, InventoryMovement, StockStatus } from '../types/inventory';
import { recordInventoryMovement, computeStockStatus } from '../services/inventoryService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Boxes,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  ArrowUpDown,
  History,
  RotateCcw,
  Sparkles,
  DollarSign,
  Coffee,
  PackageCheck
} from 'lucide-react';
import { safeFormatDate } from '../utils/dateUtils';
import { toast } from 'sonner';

const DEFAULT_KITCHEN_CATEGORIES = [
  'Protein Shakes & Smoothies',
  'Beverages & Juices',
  'Coffee & Espresso',
  'Healthy Meals & Bowls',
  'Snacks & Protein Bars',
  'Supplements & Powders',
  'Kitchen Ingredients'
];

export function KitchenInventoryManager() {
  const { currentUser } = useAuth();
  const { branding } = useSettings();
  const currency = branding?.currencySymbol || 'EGP';

  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StockStatus>('ALL');

  // Modals State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);

  // Form states
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState(DEFAULT_KITCHEN_CATEGORIES[0] || 'Beverages & Juices');
  const [newProductSku, setNewProductSku] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newRetailPrice, setNewRetailPrice] = useState('');
  const [newQuantity, setNewQuantity] = useState('10');
  const [newMinThreshold, setNewMinThreshold] = useState('5');
  const [newUnit, setNewUnit] = useState('pcs');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stock Adjustment Form
  const [adjustmentQty, setAdjustmentQty] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('Shipment Received');
  const [adjustmentCost, setAdjustmentCost] = useState('');

  // 1. Subscribe to inventory products
  useEffect(() => {
    const unsubProducts = onSnapshot(
      collection(db, 'inventoryProducts'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as InventoryProduct));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setProducts(list);
        setLoading(false);
      },
      (err) => {
        console.error('[KitchenInventoryManager] Error loading inventory products:', err);
        setLoading(false);
      }
    );

    const unsubMovements = onSnapshot(
      query(collection(db, 'inventoryMovements'), orderBy('timestamp', 'desc'), limit(100)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as InventoryMovement));
        setMovements(list);
      },
      (err) => {
        console.error('[KitchenInventoryManager] Error loading inventory movements:', err);
      }
    );

    return () => {
      unsubProducts();
      unsubMovements();
    };
  }, []);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search.trim() ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));

      const matchCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  // Inventory KPI metrics
  const totalProductsCount = products.length;
  const inStockCount = products.filter((p) => p.status === 'IN_STOCK').length;
  const lowStockCount = products.filter((p) => p.status === 'LOW_STOCK').length;
  const outOfStockCount = products.filter((p) => p.status === 'OUT_OF_STOCK').length;
  const totalValuation = products.reduce((acc, p) => acc + (p.stockQuantity * (p.retailPrice || 0)), 0);

  // Handle Create Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      toast.error('Product name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const qty = parseInt(newQuantity, 10) || 0;
      const threshold = parseInt(newMinThreshold, 10) || 5;
      const cost = parseFloat(newCostPrice) || 0;
      const retail = parseFloat(newRetailPrice) || 0;
      const sku = newProductSku.trim() || `EK-${Math.floor(1000 + Math.random() * 9000)}`;
      const status = computeStockStatus(qty, threshold);

      const productData: Omit<InventoryProduct, 'id'> = {
        name: newProductName.trim(),
        category: newProductCategory,
        sku,
        costPrice: cost,
        retailPrice: retail,
        stockQuantity: qty,
        minThreshold: threshold,
        unit: newUnit,
        status,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'inventoryProducts'), productData);

      // Record initial movement log if quantity > 0
      if (qty > 0) {
        await addDoc(collection(db, 'inventoryMovements'), {
          productId: docRef.id,
          productName: newProductName.trim(),
          type: 'RECEIVE',
          quantityChange: qty,
          quantityBefore: 0,
          quantityAfter: qty,
          unitCost: cost,
          retailPrice: retail,
          reason: 'Initial stock intake',
          recordedBy: currentUser?.id || 'admin',
          recordedByName: currentUser?.name || 'Manager',
          timestamp: new Date().toISOString(),
        });
      }

      toast.success(`Product "${newProductName.trim()}" added to Earth's Kitchen inventory!`);
      setShowAddProductModal(false);
      setNewProductName('');
      setNewProductSku('');
      setNewCostPrice('');
      setNewRetailPrice('');
      setNewQuantity('10');
      setNewMinThreshold('5');
    } catch (err: any) {
      console.error('[KitchenInventoryManager] Failed to create product:', err);
      toast.error(err?.message || 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Receive Shipment
  const handleReceiveStock = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(adjustmentQty, 10);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity to receive');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordInventoryMovement(db, {
        productId: selectedProduct.id,
        type: 'RECEIVE',
        quantity: qty,
        unitCost: adjustmentCost ? parseFloat(adjustmentCost) : selectedProduct.costPrice,
        reason: adjustmentReason || 'Restock delivery received',
        recordedBy: currentUser?.id || 'admin',
        recordedByName: currentUser?.name || 'Staff'
      });

      toast.success(`Successfully received ${qty} ${selectedProduct.unit} of ${selectedProduct.name}!`);
      setShowReceiveModal(false);
      setSelectedProduct(null);
      setAdjustmentQty('');
      setAdjustmentCost('');
      setAdjustmentReason('Shipment Received');
    } catch (err: any) {
      console.error('[KitchenInventoryManager] Receive stock failed:', err);
      toast.error(err?.message || 'Failed to update stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Stock Adjustment / Damage / Waste
  const handleAdjustStock = async (movementType: 'ADJUSTMENT' | 'DAMAGE' | 'SALE') => {
    if (!selectedProduct) return;
    const qty = parseInt(adjustmentQty, 10);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }

    if (qty > selectedProduct.stockQuantity) {
      toast.error(`Cannot deduct ${qty}; only ${selectedProduct.stockQuantity} in stock`);
      return;
    }

    setIsSubmitting(true);
    try {
      await recordInventoryMovement(db, {
        productId: selectedProduct.id,
        type: movementType,
        quantity: qty,
        reason: adjustmentReason || `${movementType} deduction`,
        recordedBy: currentUser?.id || 'admin',
        recordedByName: currentUser?.name || 'Staff'
      });

      toast.success(`Deducted ${qty} ${selectedProduct.unit} (${movementType.toLowerCase()}) for ${selectedProduct.name}`);
      setShowAdjustModal(false);
      setSelectedProduct(null);
      setAdjustmentQty('');
      setAdjustmentReason('');
    } catch (err: any) {
      console.error('[KitchenInventoryManager] Adjust stock failed:', err);
      toast.error(err?.message || 'Failed to adjust stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Coffee className="h-5 w-5 text-primary" /> Earth&apos;s Kitchen Inventory &amp; Stock
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor real-time stock levels, receive kitchen deliveries, manage reorder thresholds, and log ingredient adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs font-semibold gap-1.5"
            onClick={() => setShowHistoryModal(true)}
          >
            <History className="h-4 w-4" /> Movement Logs ({movements.length})
          </Button>
          <Button
            size="sm"
            className="text-xs font-bold gap-1.5 bg-primary text-primary-foreground"
            onClick={() => setShowAddProductModal(true)}
          >
            <Plus className="h-4 w-4" /> Add Kitchen Item
          </Button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Total Menu / Items</p>
            <p className="text-xl font-extrabold mt-1 text-foreground">{totalProductsCount}</p>
          </CardContent>
        </Card>
        <Card className="border bg-emerald-500/5 border-emerald-500/30">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">In Stock</p>
            <p className="text-xl font-extrabold mt-1 text-emerald-600 dark:text-emerald-400">{inStockCount}</p>
          </CardContent>
        </Card>
        <Card className="border bg-amber-500/5 border-amber-500/30">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">Low Stock Alert</p>
            <p className="text-xl font-extrabold mt-1 text-amber-600 dark:text-amber-400">{lowStockCount}</p>
          </CardContent>
        </Card>
        <Card className="border bg-rose-500/5 border-rose-500/30">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">Out of Stock</p>
            <p className="text-xl font-extrabold mt-1 text-rose-600 dark:text-rose-400">{outOfStockCount}</p>
          </CardContent>
        </Card>
        <Card className="border col-span-2 sm:col-span-1">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Stock Value (Retail)</p>
            <p className="text-xl font-extrabold mt-1 text-primary">
              {currency} {Math.round(totalValuation).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="border">
        <CardContent className="p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search items by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={categoryFilter} onValueChange={(val) => val && setCategoryFilter(val)}>
              <SelectTrigger className="h-9 text-xs w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {DEFAULT_KITCHEN_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(val) => val && setStatusFilter(val as any)}>
              <SelectTrigger className="h-9 text-xs w-36">
                <SelectValue placeholder="Stock Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="IN_STOCK">In Stock</SelectItem>
                <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
                <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] border-b">
              <tr>
                <th className="py-3 px-4">Item &amp; Category</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Stock Level</th>
                <th className="py-3 px-4">Min Alert Threshold</th>
                <th className="py-3 px-4">Cost / Retail</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {loading ? 'Loading kitchen inventory...' : 'No inventory items match your search.'}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isLow = product.status === 'LOW_STOCK';
                  const isOut = product.status === 'OUT_OF_STOCK';

                  return (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground text-sm">{product.name}</div>
                        <div className="text-[10px] text-muted-foreground">{product.category}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                        {product.sku || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-bold font-mono text-sm ${isOut ? 'text-rose-500' : isLow ? 'text-amber-500' : 'text-foreground'}`}>
                          {product.stockQuantity}
                        </span>{' '}
                        <span className="text-[10px] text-muted-foreground">{product.unit || 'pcs'}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">
                        {product.minThreshold} {product.unit || 'pcs'}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="text-muted-foreground">{currency} {product.costPrice || 0}</span> /{' '}
                        <span className="font-bold text-emerald-500">{currency} {product.retailPrice || 0}</span>
                      </td>
                      <td className="py-3 px-4">
                        {isOut ? (
                          <Badge variant="outline" className="border-rose-500/40 text-rose-500 bg-rose-500/10">
                            Out of Stock
                          </Badge>
                        ) : isLow ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10">
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10">
                            In Stock
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] font-bold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => {
                            setSelectedProduct(product);
                            setAdjustmentQty('10');
                            setAdjustmentReason('Restock delivery received');
                            setShowReceiveModal(true);
                          }}
                        >
                          <PackageCheck className="h-3.5 w-3.5 mr-1" /> Receive
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setSelectedProduct(product);
                            setAdjustmentQty('1');
                            setAdjustmentReason('Damaged / Expired');
                            setShowAdjustModal(true);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Adjust
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Add New Kitchen Product */}
      <Dialog open={showAddProductModal} onOpenChange={setShowAddProductModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary" /> Add Earth&apos;s Kitchen Product
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a new beverage, meal, supplement, or kitchen ingredient to inventory tracking.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProduct} className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-bold">Product Name *</Label>
              <Input
                placeholder="e.g. Whey Gold Vanilla Shake"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="mt-1 h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Category</Label>
                <Select value={newProductCategory} onValueChange={(val) => val && setNewProductCategory(val)}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_KITCHEN_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">SKU / Code (Optional)</Label>
                <Input
                  placeholder="e.g. EK-SHAKE-01"
                  value={newProductSku}
                  onChange={(e) => setNewProductSku(e.target.value)}
                  className="mt-1 h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Cost Price ({currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={newCostPrice}
                  onChange={(e) => setNewCostPrice(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Retail Price ({currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={newRetailPrice}
                  onChange={(e) => setNewRetailPrice(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs font-bold">Initial Stock</Label>
                <Input
                  type="number"
                  min="0"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Min Threshold</Label>
                <Input
                  type="number"
                  min="1"
                  value={newMinThreshold}
                  onChange={(e) => setNewMinThreshold(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Unit</Label>
                <Input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="mt-1 h-9 text-xs"
                  placeholder="pcs, bottle, kg"
                />
              </div>
            </div>

            <DialogFooter className="mt-4 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddProductModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="font-bold">
                {isSubmitting ? 'Saving...' : 'Save Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Receive Stock */}
      <Dialog open={showReceiveModal} onOpenChange={setShowReceiveModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-500" /> Receive Stock: {selectedProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Log incoming vendor delivery or restock for this item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted/40 rounded-xl flex items-center justify-between text-xs">
              <div>Current Stock:</div>
              <div className="font-bold font-mono text-foreground text-sm">
                {selectedProduct?.stockQuantity} {selectedProduct?.unit}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Quantity Received *</Label>
              <Input
                type="number"
                min="1"
                placeholder="10"
                value={adjustmentQty}
                onChange={(e) => setAdjustmentQty(e.target.value)}
                className="mt-1 h-9 text-xs font-bold"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Delivery / Supplier Note</Label>
              <Input
                placeholder="e.g. Weekly dairy & fruit delivery"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowReceiveModal(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={isSubmitting} onClick={handleReceiveStock} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              {isSubmitting ? 'Updating...' : 'Confirm Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Adjust / Waste Stock */}
      <Dialog open={showAdjustModal} onOpenChange={setShowAdjustModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Log Adjustment or Waste: {selectedProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Deduct expired ingredients, prep waste, or manual inventory corrections.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted/40 rounded-xl flex items-center justify-between text-xs">
              <div>Current Stock:</div>
              <div className="font-bold font-mono text-foreground text-sm">
                {selectedProduct?.stockQuantity} {selectedProduct?.unit}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Quantity to Deduct *</Label>
              <Input
                type="number"
                min="1"
                max={selectedProduct?.stockQuantity || 1}
                placeholder="1"
                value={adjustmentQty}
                onChange={(e) => setAdjustmentQty(e.target.value)}
                className="mt-1 h-9 text-xs font-bold"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Reason *</Label>
              <Input
                placeholder="e.g. Broken bottle, spilled protein powder, expiry"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdjustModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => handleAdjustStock('DAMAGE')}
            >
              Log Waste/Damage
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleAdjustStock('ADJUSTMENT')}
            >
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Movement Logs */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Inventory Movement History (Audit Trail)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Immutable log of all deliveries, sales deductions, and adjustments.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 divide-y divide-border pr-1">
            {movements.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No movements recorded yet.</p>
            ) : (
              movements.map((mov) => {
                const isPositive = mov.quantityChange > 0;
                return (
                  <div key={mov.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-foreground">{mov.productName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {mov.type} • {mov.reason || 'No reason specified'} • By {mov.recordedByName || 'Staff'}
                      </div>
                      <div className="text-[9px] text-muted-foreground/70 font-mono">
                        {safeFormatDate(mov.timestamp, 'dd MMM yyyy HH:mm')}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`font-bold font-mono ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPositive ? `+${mov.quantityChange}` : mov.quantityChange}
                      </span>
                      <div className="text-[10px] text-muted-foreground">
                        Bal: {mov.quantityAfter}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="border-t pt-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setShowHistoryModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default KitchenInventoryManager;
