import React, { useState, useEffect, useMemo } from 'react';
import { Client, JuiceBarOrder } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, ShoppingCart, Plus, Minus, Clock, CheckCircle2, Trash2, ArrowRight, Search, Sparkles, Flame, Wallet, Coins } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getOrCreateWallet,
  spendCashBalance,
  debitPoints,
  type PointsWallet,
} from '../services/pointsService';
import {
  EARTHS_KITCHEN_MENU,
  EARTHS_KITCHEN_CATEGORIES,
  EARTHS_KITCHEN_ADDONS,
  EarthsKitchenCategory,
} from '../data/earthsKitchenMenu';

const STATUS_STYLES: Record<string, { badge: string; text: string }> = {
  Pending: { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', text: 'Order Received' },
  Preparing: { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20', text: 'Preparing in Kitchen' },
  Ready: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse', text: 'Ready for Pickup! 🥤' },
  Completed: { badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', text: 'Picked Up / Done' },
  Cancelled: { badge: 'bg-secondary text-muted-foreground border-border', text: 'Cancelled' },
};

export default function MemberJuiceBar({ client }: { client: Client | null }) {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<JuiceBarOrder[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedAddonsByItem, setSelectedAddonsByItem] = useState<Record<string, string[]>>({});
  const [activeCategory, setActiveCategory] = useState<'All' | EarthsKitchenCategory>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [pickupTime, setPickupTime] = useState<string>('In 15 mins');
  const [paymentMethod, setPaymentMethod] = useState<'counter' | 'wallet_cash' | 'points'>('counter');
  const [memberWallet, setMemberWallet] = useState<PointsWallet | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client?.id) return;
    getOrCreateWallet(client.id).then(setMemberWallet).catch(() => {});
  }, [client?.id]);

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'juiceBarOrders'),
      where('clientId', '==', client.id)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as JuiceBarOrder));

      list.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading juice bar orders:", err);
      setLoading(false);
    });

    return unsub;
  }, [client?.id]);

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => {
      const current = prev[id] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const toggleItemAddon = (itemId: string, addonId: string) => {
    setSelectedAddonsByItem(prev => {
      const cur = prev[itemId] || [];
      const next = cur.includes(addonId) ? cur.filter(a => a !== addonId) : [...cur, addonId];
      return { ...prev, [itemId]: next };
    });
  };

  const clearCart = () => {
    setCart({});
    setSelectedAddonsByItem({});
  };

  const cartItemsList = useMemo(() => {
    return Object.entries(cart).map(([itemId, qty]) => {
      const item = EARTHS_KITCHEN_MENU.find(m => m.id === itemId);
      const addonIds = selectedAddonsByItem[itemId] || [];
      const addons = addonIds
        .map(aid => EARTHS_KITCHEN_ADDONS.find(a => a.id === aid))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      const addonsTotalPerUnit = addons.reduce((acc, a) => acc + a.price, 0);
      const unitPrice = (item?.price || 0) + addonsTotalPerUnit;
      return {
        item,
        qty,
        addons,
        unitPrice,
        subtotal: unitPrice * qty
      };
    }).filter(x => x.item !== undefined);
  }, [cart, selectedAddonsByItem]);

  const cartTotal = cartItemsList.reduce((sum, item) => sum + item.subtotal, 0);

  const visibleCategories = useMemo(() => {
    if (activeCategory === 'All') return EARTHS_KITCHEN_CATEGORIES;
    return [activeCategory];
  }, [activeCategory]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || cartTotal === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const pointsCost = Math.ceil(cartTotal / 10); // 1 Point = 10 EGP in gym services
      if (paymentMethod === 'wallet_cash') {
        const cashAvail = memberWallet?.cashBalance || 0;
        if (cashAvail < cartTotal) {
          alert(`Insufficient Wallet Cash Balance. Available: ${cashAvail.toLocaleString()} LE, Order Total: ${cartTotal.toLocaleString()} LE.`);
          setIsSubmitting(false);
          return;
        }
        await spendCashBalance(
          client.id,
          cartTotal,
          'juice_bar',
          `Earth's Kitchen Order (${cartItemsList.map(c => `${c.qty}x ${c.item?.name}`).join(', ')})`,
          client.name
        );
      } else if (paymentMethod === 'points') {
        const ptsAvail = memberWallet?.balance || 0;
        if (ptsAvail < pointsCost) {
          alert(`Insufficient Points Balance. Available: ${ptsAvail} PTS, Order Cost: ${pointsCost} PTS.`);
          setIsSubmitting(false);
          return;
        }
        await debitPoints(
          client.id,
          pointsCost,
          'juice_bar',
          `Earth's Kitchen Order (${cartItemsList.map(c => `${c.qty}x ${c.item?.name}`).join(', ')})`,
          client.name
        );
      }

      const itemsToSubmit = cartItemsList.map(ci => {
        const addonLabel = ci.addons.length > 0 ? ` (+ ${ci.addons.map(a => a.name).join(', ')})` : '';
        return {
          name: `${ci.item!.name}${addonLabel}`,
          quantity: ci.qty,
          price: ci.unitPrice,
          ...(ci.addons.length > 0 ? { addons: ci.addons.map(a => ({ name: a.name, price: a.price })) } : {})
        };
      });

      await addDoc(collection(db, 'juiceBarOrders'), {
        clientId: client.id,
        clientName: client.name,
        memberId: client.memberId || client.id,
        clientPhone: client.phone || '',
        clientPhotoUrl: client.photoURL || '',
        items: itemsToSubmit,
        totalAmount: cartTotal,
        paymentMethod: paymentMethod === 'wallet_cash' ? 'Wallet Balance' : paymentMethod === 'points' ? `Points (${pointsCost} PTS)` : 'Pay at Counter',
        isPaid: paymentMethod !== 'counter',
        pickupTime: pickupTime,
        status: 'Pending',
        orderedAt: new Date().toISOString()
      });

      if (paymentMethod !== 'counter') {
        const updatedW = await getOrCreateWallet(client.id);
        setMemberWallet(updatedW);
      }

      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'SYSTEM',
        entityId: client.id,
        details: `Member ${client.name} (${client.memberId || client.id}) ordered from Earth's Kitchen. Total: ${t('payments.currency_le')} ${cartTotal}. Pickup: ${pickupTime}`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      clearCart();
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err) {
      console.error("Failed to place juice bar order:", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!window.confirm("Are you sure you want to cancel this pre-order?")) return;

    try {
      const orderRef = doc(db, 'juiceBarOrders', orderId);
      await updateDoc(orderRef, {
        status: 'Cancelled'
      });

      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'SYSTEM',
        entityId: orderId,
        details: `Juice Bar Order ${orderId} cancelled by member ${client?.name}`,
        timestamp: new Date().toISOString(),
        userId: client?.portalUserId || client?.id || '',
        userName: client?.name || '',
      });
    } catch (err) {
      console.error("Failed to cancel order:", err);
      alert("Failed to cancel order. Please try again.");
    }
  };

  if (!client) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" /> Earth's Kitchen Drinks Menu
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pre-order pre-workout shakes, collagen blends, protein shakes, specialty coffee, matcha & mocktails for counter pickup.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search drinks or ingredients..."
            className="pl-8 h-8 text-xs bg-card/60"
          />
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveCategory('All')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
            activeCategory === 'All'
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-card/60 text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          All Menu ({EARTHS_KITCHEN_MENU.length})
        </button>
        {EARTHS_KITCHEN_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card/60 text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Earth's Kitchen Menu Grid */}
      <div className="space-y-5">
        {visibleCategories.map(cat => {
          const itemsInCat = EARTHS_KITCHEN_MENU.filter(m => {
            if (m.category !== cat) return false;
            if (!searchTerm.trim()) return true;
            const q = searchTerm.toLowerCase();
            return (
              m.name.toLowerCase().includes(q) ||
              (m.description || '').toLowerCase().includes(q)
            );
          });

          if (itemsInCat.length === 0) return null;

          return (
            <div key={cat} className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary border-b border-border/60 pb-1.5 flex items-center justify-between">
                <span>{cat}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{itemsInCat.length} items</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {itemsInCat.map(item => {
                  const qtyInCart = cart[item.id] || 0;
                  const itemAddons = selectedAddonsByItem[item.id] || [];
                  return (
                    <Card key={item.id} className="border bg-card/40 hover:bg-card/75 transition-colors shadow-sm">
                      <CardContent className="p-3.5 space-y-2.5">
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className="text-xs font-bold text-foreground">{item.name}</span>
                              <span className="text-xs font-mono font-extrabold text-primary shrink-0">
                                {t('payments.currency_le')} {item.price}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-[10px] text-muted-foreground leading-normal">
                                {item.description}
                              </p>
                            )}
                            {item.macros && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {item.macros.calories !== undefined && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                    <Flame className="h-2.5 w-2.5" /> {item.macros.calories} cal
                                  </span>
                                )}
                                {item.macros.protein !== undefined && (
                                  <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">
                                    {item.macros.protein}g protein
                                  </span>
                                )}
                                {item.macros.fat !== undefined && (
                                  <span className="text-[9px] font-mono bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 px-1.5 py-0.5 rounded">
                                    {item.macros.fat}g fat
                                  </span>
                                )}
                                {item.macros.carbs !== undefined && (
                                  <span className="text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                                    {item.macros.carbs}g carb
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Controls */}
                          <div className="flex items-center gap-2 shrink-0">
                            {qtyInCart > 0 ? (
                              <div className="flex items-center gap-1.5 border bg-muted/60 dark:bg-zinc-950/50 rounded-lg p-0.5">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-md hover:bg-muted dark:hover:bg-zinc-900"
                                  onClick={() => updateCartQty(item.id, -1)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-xs font-bold font-mono px-1 min-w-[16px] text-center">
                                  {qtyInCart}
                                </span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-md hover:bg-muted dark:hover:bg-zinc-900"
                                  onClick={() => updateCartQty(item.id, 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-[10px] font-bold h-7 px-2.5 border-primary/30 hover:bg-primary hover:text-primary-foreground"
                                onClick={() => updateCartQty(item.id, 1)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Add-ons selector when item is in cart and supports add-ons */}
                        {qtyInCart > 0 && item.supportsAddons && (
                          <div className="pt-2 border-t border-border/50 space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5 text-primary" /> Customize Add-ons:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {EARTHS_KITCHEN_ADDONS.map(addon => {
                                const isSelected = itemAddons.includes(addon.id);
                                return (
                                  <button
                                    key={addon.id}
                                    type="button"
                                    onClick={() => toggleItemAddon(item.id, addon.id)}
                                    className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
                                      isSelected
                                        ? 'bg-primary/20 text-primary border-primary'
                                        : 'bg-background/60 text-muted-foreground border-border hover:text-foreground'
                                    }`}
                                  >
                                    + {addon.name} ({addon.price} LE)
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Shopping Cart Summary Card */}
      {cartTotal > 0 && (
        <Card className="border-2 border-primary/50 bg-white dark:bg-[#09090b] shadow-[0_-12px_40px_rgba(0,0,0,0.85)] relative group overflow-hidden sticky bottom-3 z-30 rounded-2xl">
          <CardHeader className="pb-2 bg-muted/30 dark:bg-zinc-900/90 border-b border-border/60">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4 text-primary" /> Earth's Kitchen Pre-order Cart
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="text-[10px] text-muted-foreground hover:text-foreground h-6 font-bold"
                onClick={clearCart}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {cartItemsList.map(({ item, qty, addons, unitPrice, subtotal }) => (
                <div key={item!.id} className="flex justify-between items-center text-xs border-b border-border/50 pb-1.5">
                  <div className="space-y-0.5">
                    <span className="font-semibold">{item!.name}</span>
                    {addons.length > 0 && (
                      <span className="text-[10px] text-primary block">
                        + {addons.map(a => `${a.name} (${a.price} LE)`).join(', ')}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono block">
                      {qty} x {t('payments.currency_le')} {unitPrice}
                    </span>
                  </div>
                  <strong className="font-mono font-bold text-primary">{t('payments.currency_le')} {subtotal}</strong>
                </div>
              ))}
            </div>

            <form onSubmit={handlePlaceOrder} className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor="pickupTime" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pickup Timing</Label>
                  <Select value={pickupTime} onValueChange={(val) => setPickupTime(val || '')} required>
                    <SelectTrigger id="pickupTime" className="bg-background h-8 text-xs font-bold border-border">
                      <SelectValue placeholder="Pickup schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASAP (Now)">ASAP (Now)</SelectItem>
                      <SelectItem value="In 15 mins">In 15 minutes</SelectItem>
                      <SelectItem value="In 30 mins">In 30 minutes</SelectItem>
                      <SelectItem value="After my session">After training</SelectItem>
                      <SelectItem value="In 45 mins">In 45 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-right pb-1">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Total Amount</span>
                  <strong className="text-lg font-mono font-extrabold text-foreground">
                    {paymentMethod === 'points'
                      ? `${Math.ceil(cartTotal / 10)} PTS`
                      : `${t('payments.currency_le')} ${cartTotal}`}
                  </strong>
                </div>
              </div>

              {/* Payment Method Selector (Counter / Wallet Cash Balance / Gym Points) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Method</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('counter')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      paymentMethod === 'counter'
                        ? 'bg-primary/20 border-primary text-foreground'
                        : 'bg-muted/40 dark:bg-zinc-900/60 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <p className="text-[10px] font-extrabold">Pay at Counter</p>
                    <p className="text-[9px] opacity-80 font-mono">{cartTotal} LE</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wallet_cash')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      paymentMethod === 'wallet_cash'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                        : 'bg-muted/40 dark:bg-zinc-900/60 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <p className="text-[10px] font-extrabold flex items-center gap-1">
                      <Wallet className="h-3 w-3" /> Wallet Cash
                    </p>
                    <p className="text-[9px] opacity-80 font-mono">
                      Bal: {(memberWallet?.cashBalance || 0).toLocaleString()} LE
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('points')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      paymentMethod === 'points'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300'
                        : 'bg-muted/40 dark:bg-zinc-900/60 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <p className="text-[10px] font-extrabold flex items-center gap-1">
                      <Coins className="h-3 w-3" /> Gym Points
                    </p>
                    <p className="text-[9px] opacity-80 font-mono">
                      {Math.ceil(cartTotal / 10)} PTS (Bal: {memberWallet?.balance || 0})
                    </p>
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full font-bold h-9">
                {isSubmitting ? 'Sending Order to Kitchen...' : 'Send Order to Earth\'s Kitchen'} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <p className="text-[9px] text-center text-zinc-500 leading-tight">
                * You will receive an instant notification when Earth's Kitchen marks your order ready for pickup.
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Success banner */}
      {submitSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg flex items-center gap-2.5 text-xs font-semibold animate-in zoom-in-95">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Order sent to Earth's Kitchen! We'll notify you as soon as it's ready.</span>
        </div>
      )}

      {/* Live Pre-orders Monitoring */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary animate-pulse" /> My Earth's Kitchen Orders
        </h3>

        {orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map(order => {
              const style = STATUS_STYLES[order.status] || { badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', text: order.status };
              const dateObj = new Date(order.orderedAt);
              return (
                <Card key={order.id} className="border bg-card/40 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start border-b border-white/5 pb-2">
                      <div className="space-y-0.5">
                        <Badge className={`border text-[10px] px-2 py-0 rounded-full font-bold ${style.badge}`} variant="outline">
                          {style.text}
                        </Badge>
                        <span className="text-[10px] font-mono text-zinc-500 block mt-1">
                          Ordered: {isNaN(dateObj.getTime()) ? order.orderedAt : format(dateObj, 'dd MMM h:mm a')}
                        </span>
                      </div>
                      <div className="text-right">
                        <strong className="text-sm font-mono font-extrabold text-foreground block">
                          {t('payments.currency_le')} {order.totalAmount}
                        </strong>
                        <span className="text-[9px] text-zinc-400 font-medium block">
                          Pickup: {order.pickupTime}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      {order.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-muted-foreground">
                          <span>{it.name} <span className="text-[10px] text-zinc-500">x{it.quantity}</span></span>
                          <span className="font-mono text-[11px]">{t('payments.currency_le')} {it.price * it.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {order.status === 'Pending' && (
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="text-[10px] text-muted-foreground border-border hover:bg-secondary hover:text-foreground h-7 font-bold px-3.5"
                          onClick={() => handleCancelOrder(order.id)}
                        >
                          Cancel Order
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              No recent Earth's Kitchen orders found.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
