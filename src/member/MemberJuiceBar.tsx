import React, { useState, useEffect } from 'react';
import { Client, JuiceBarOrder } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, ShoppingCart, Plus, Minus, Clock, CheckCircle2, AlertCircle, Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const MENU_ITEMS = [
  { id: 'shake-whey', name: 'Whey Protein Shake', category: 'Shakes', price: 85, description: 'Premium grass-fed whey, almond milk, banana, honey.' },
  { id: 'shake-creatine', name: 'Creatine Punch Shake', category: 'Shakes', price: 90, description: 'Whey protein, creatine monohydrate, berries, oats.' },
  { id: 'shake-pb', name: 'PB & Banana Blast', category: 'Shakes', price: 105, description: 'Whey protein, organic peanut butter, banana, dark chocolate.' },
  { id: 'pre-c4', name: 'C4 Energy Shot', category: 'Pre-workouts', price: 60, description: 'Pre-workout shot with beta-alanine and caffeine.' },
  { id: 'pre-espresso', name: 'Double Espresso', category: 'Pre-workouts', price: 50, description: 'Freshly brewed double shot of premium dark roast.' },
  { id: 'bowl-acai', name: 'Acai Superfood Bowl', category: 'Bowls', price: 150, description: 'Pure acai berry blend topped with strawberries, banana, granola, chia.' },
  { id: 'bowl-oatmeal', name: 'Oatmeal Energy Cup', category: 'Bowls', price: 75, description: 'Warm steel-cut oats topped with almond butter, honey, berries.' },
];

const STATUS_STYLES: Record<string, { badge: string; text: string }> = {
  Pending: { badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', text: 'Pending Approval' },
  Preparing: { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20', text: 'Preparing' },
  Ready: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse', text: 'Ready for Pickup' },
  Completed: { badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', text: 'Completed' },
  Cancelled: { badge: 'bg-red-500/10 text-red-400 border-red-500/20', text: 'Cancelled' },
};

export default function MemberJuiceBar({ client }: { client: Client | null }) {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<JuiceBarOrder[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pickupTime, setPickupTime] = useState<string>('In 15 mins');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

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

      // Sort: newest orders first
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

  const clearCart = () => setCart({});

  const cartItemsList = Object.entries(cart).map(([itemId, qty]) => {
    const item = MENU_ITEMS.find(m => m.id === itemId);
    return {
      item,
      qty,
      subtotal: (item?.price || 0) * qty
    };
  }).filter(x => x.item !== undefined);

  const cartTotal = cartItemsList.reduce((sum, item) => sum + item.subtotal, 0);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || cartTotal === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const itemsToSubmit = cartItemsList.map(ci => ({
        name: ci.item!.name,
        quantity: ci.qty,
        price: ci.item!.price
      }));

      await addDoc(collection(db, 'juiceBarOrders'), {
        clientId: client.id,
        clientName: client.name,
        items: itemsToSubmit,
        totalAmount: cartTotal,
        pickupTime: pickupTime,
        status: 'Pending',
        orderedAt: new Date().toISOString()
      });

      // Write to auditLogs
      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'SYSTEM',
        entityId: client.id,
        details: `Member ${client.name} pre-ordered from Earth's Kitchen. Total: ${t('payments.currency_le')} ${cartTotal}. Pickup: ${pickupTime}`,
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

      // Log Cancel to auditLogs
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

  // Categories
  const categories = ['Shakes', 'Pre-workouts', 'Bowls'];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" /> Earth's Kitchen Juice Bar
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pre-order protein shakes, pre-workouts, and healthy bowls for pickup at the counter.
        </p>
      </div>

      {/* Earth's Kitchen Menu Grid */}
      <div className="space-y-4">
        {categories.map(cat => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary border-b border-white/5 pb-1">
              {cat}
            </h3>
            <div className="space-y-2.5">
              {MENU_ITEMS.filter(m => m.category === cat).map(item => {
                const qtyInCart = cart[item.id] || 0;
                return (
                  <Card key={item.id} className="border bg-card/40 hover:bg-card/75 transition-colors shadow-sm">
                    <CardContent className="p-3.5 flex justify-between items-center gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-bold text-foreground">{item.name}</span>
                          <span className="text-xs font-mono font-bold text-primary">{t('payments.currency_le')} {item.price}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-normal pr-2">
                          {item.description}
                        </p>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        {qtyInCart > 0 ? (
                          <div className="flex items-center gap-2 border bg-zinc-950/50 rounded-lg p-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 rounded-md hover:bg-zinc-900"
                              onClick={() => updateCartQty(item.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="text-xs font-bold font-mono px-1 min-w-[14px] text-center">
                              {qtyInCart}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 rounded-md hover:bg-zinc-900"
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
                            className="text-[10px] font-bold h-7 px-2.5 border-primary/20 hover:bg-primary hover:text-black"
                            onClick={() => updateCartQty(item.id, 1)}
                          >
                            Add to Cart
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Shopping Cart Summary Card */}
      {cartTotal > 0 && (
        <Card className="border-primary/20 bg-zinc-950/60 shadow-lg relative group overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4 text-primary" /> My Pre-order Cart
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="text-[10px] text-muted-foreground hover:text-destructive h-6 font-bold"
                onClick={clearCart}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cart Items Details */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {cartItemsList.map(({ item, qty, subtotal }) => (
                <div key={item!.id} className="flex justify-between items-center text-xs border-b border-white/5 pb-1.5">
                  <div className="space-y-0.5">
                    <span className="font-semibold">{item!.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono block">
                      {qty} x {t('payments.currency_le')} {item!.price}
                    </span>
                  </div>
                  <strong className="font-mono font-bold text-primary">{t('payments.currency_le')} {subtotal}</strong>
                </div>
              ))}
            </div>

            {/* Config: Pickup Time & Subtotal */}
            <form onSubmit={handlePlaceOrder} className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor="pickupTime" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pickup Timing</Label>
                  <Select value={pickupTime} onValueChange={(val) => setPickupTime(val || '')} required>
                    <SelectTrigger id="pickupTime" className="bg-background h-8 text-xs font-bold border-zinc-800">
                      <SelectValue placeholder="Pickup schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="In 15 mins">In 15 minutes</SelectItem>
                      <SelectItem value="In 30 mins">In 30 minutes</SelectItem>
                      <SelectItem value="After my session">After training</SelectItem>
                      <SelectItem value="In 45 mins">In 45 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-right pb-1">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Total Amount</span>
                  <strong className="text-lg font-mono font-extrabold text-white">{t('payments.currency_le')} {cartTotal}</strong>
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full font-bold h-9">
                {isSubmitting ? 'Placing Pre-order...' : 'Confirm Pre-order'} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <p className="text-[9px] text-center text-zinc-500 leading-tight">
                * Pay via cash/card at Earth's Kitchen counter upon pickup. Pre-orders are final once preparing.
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Success banner */}
      {submitSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs font-semibold animate-in zoom-in-95">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Pre-order sent! It will show up on Earth's Kitchen live prep screen.</span>
        </div>
      )}

      {/* Live Pre-orders Monitoring */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary animate-pulse" /> My Pre-order Logs
        </h3>

        {orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map(order => {
              const style = STATUS_STYLES[order.status] || { badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', text: order.status };
              const dateObj = new Date(order.orderedAt);
              return (
                <Card key={order.id} className="border bg-card/40 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-white/5 pb-2">
                      <div className="space-y-0.5">
                        <Badge className={`border text-[10px] px-2 py-0 rounded-full font-bold ${style.badge}`} variant="outline">
                          {style.text}
                        </Badge>
                        <span className="text-[10px] font-mono text-zinc-500 block mt-1">
                          Ordered: {format(dateObj, 'dd MMM h:mm a')}
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

                    {/* Items list */}
                    <div className="space-y-1 text-xs">
                      {order.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-muted-foreground">
                          <span>{it.name} <span className="text-[10px] text-zinc-500">x{it.quantity}</span></span>
                          <span className="font-mono text-[11px]">{t('payments.currency_le')} {it.price * it.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions (Cancel) */}
                    {order.status === 'Pending' && (
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="text-[10px] text-destructive border-destructive/20 hover:bg-destructive hover:text-white h-7 font-bold px-3.5"
                          onClick={() => handleCancelOrder(order.id)}
                        >
                          Cancel Pre-order
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
              No recent Earth's Kitchen pre-orders found.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
