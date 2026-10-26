import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { JuiceBarOrder, Client } from '../types';
import { notifyClient } from '../services/pushService';
import {
  Coffee,
  Clock,
  CheckCircle2,
  ChefHat,
  Phone,
  Hash,
  User as UserIcon,
  Bell,
  LogOut,
  Search,
  Sparkles,
  Check
} from 'lucide-react';

interface KitchenKioskViewProps {
  onLogout?: () => void;
  isEmbedded?: boolean;
}

export function KitchenKioskView({ onLogout, isEmbedded = false }: KitchenKioskViewProps) {
  const [orders, setOrders] = useState<JuiceBarOrder[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, Client>>({});
  const [filterStatus, setFilterStatus] = useState<'active' | 'Pending' | 'Preparing' | 'Ready' | 'Completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'juiceBarOrders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JuiceBarOrder)));
      },
      (err) => {
        console.error('[KitchenKioskView] Failed to load juiceBarOrders:', err);
      }
    );

    const unsubClients = onSnapshot(
      collection(db, 'clients'),
      (snap) => {
        const map: Record<string, Client> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() } as Client;
        });
        setClientsMap(map);
      },
      (err) => {
        console.error('[KitchenKioskView] Failed to load clients for order enrichment:', err);
      }
    );

    return () => {
      unsubOrders();
      unsubClients();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleUpdateOrderStatus = async (
    order: JuiceBarOrder,
    newStatus: JuiceBarOrder['status']
  ) => {
    setProcessingOrderId(order.id);
    try {
      const nowIso = new Date().toISOString();
      const updates: Record<string, any> = {
        status: newStatus,
      };
      if (newStatus === 'Ready') {
        updates.readyAt = nowIso;
      } else if (newStatus === 'Completed') {
        updates.completedAt = nowIso;
      }

      await updateDoc(doc(db, 'juiceBarOrders', order.id), updates);

      // When the Kitchen marks an order as Done / Ready, notify the member automatically
      if (newStatus === 'Ready' || newStatus === 'Completed') {
        const itemSummary = (order.items || [])
          .map((i) => `${i.quantity}x ${i.name}`)
          .join(', ');

        const notifTitle =
          newStatus === 'Ready'
            ? "Earth's Kitchen: Your Order is Ready! 🥤"
            : "Earth's Kitchen: Order Completed ✅";
        const notifBody =
          newStatus === 'Ready'
            ? `Hi ${order.clientName}, your order (${itemSummary}) is ready for pickup at Earth's Kitchen!`
            : `Hi ${order.clientName}, your Earth's Kitchen order (${itemSummary}) has been completed. Enjoy!`;

        if (order.clientId) {
          try {
            await addDoc(collection(db, 'notifications'), {
              recipientUid: order.clientId,
              clientId: order.clientId,
              title: notifTitle,
              body: notifBody,
              type: 'juice_bar_order',
              orderId: order.id,
              read: false,
              createdAt: nowIso,
            });
          } catch (notifErr) {
            console.error('[KitchenKioskView] Failed to write in-app notification:', notifErr);
          }

          try {
            await notifyClient(order.clientId, notifTitle, notifBody, {
              type: 'juice_bar_order',
              orderId: order.id,
              status: newStatus,
            });
          } catch (pushErr) {
            console.error('[KitchenKioskView] Failed to send push notification:', pushErr);
          }
        }

        showToast(`Order marked ${newStatus} & member ${order.clientName} notified!`);
      } else {
        showToast(`Order #${order.id.slice(-4).toUpperCase()} marked as ${newStatus}`);
      }
    } catch (err) {
      console.error('[KitchenKioskView] Failed to update order status:', err);
      showToast('Failed to update order status. Please try again.');
    } finally {
      setProcessingOrderId(null);
    }
  };

  const enrichedOrders = useMemo(() => {
    return orders.map((o) => {
      const client = o.clientId ? clientsMap[o.clientId] : undefined;
      return {
        ...o,
        memberId: o.memberId || client?.memberId || 'N/A',
        clientPhone: o.clientPhone || client?.phone || 'N/A',
        clientPhotoUrl: o.clientPhotoUrl || client?.photoURL || (client as any)?.avatar || '',
        clientName: o.clientName || client?.name || 'Member',
      };
    });
  }, [orders, clientsMap]);

  const filteredOrders = useMemo(() => {
    return enrichedOrders.filter((order) => {
      if (filterStatus === 'active') {
        if (order.status === 'Completed' || order.status === 'Cancelled') return false;
      } else if (order.status !== filterStatus) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = order.clientName?.toLowerCase().includes(q);
        const matchMemberId = String(order.memberId || '').toLowerCase().includes(q);
        const matchPhone = String(order.clientPhone || '').toLowerCase().includes(q);
        const matchItems = (order.items || []).some((i) => i.name.toLowerCase().includes(q));
        return matchName || matchMemberId || matchPhone || matchItems;
      }

      return true;
    });
  }, [enrichedOrders, filterStatus, searchQuery]);

  const counts = useMemo(() => {
    return {
      active: enrichedOrders.filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled').length,
      Pending: enrichedOrders.filter((o) => o.status === 'Pending').length,
      Preparing: enrichedOrders.filter((o) => o.status === 'Preparing').length,
      Ready: enrichedOrders.filter((o) => o.status === 'Ready').length,
      Completed: enrichedOrders.filter((o) => o.status === 'Completed').length,
    };
  }, [enrichedOrders]);

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen bg-[#0a0a0a] text-white p-4 md:p-8'}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-emerald-500 text-black font-black px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-300 animate-in fade-in slide-in-from-top-3">
          <Bell className="w-5 h-5" />
          <span className="text-sm uppercase tracking-wider">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-5 border-b border-[#222]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg">
            <Coffee className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">
                Earth&apos;s Kitchen Kiosk
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Live Orders
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Real-time mobile app order queue • Member ID, Photo, Name, Phone &amp; Items
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Member ID, Name, Phone..."
              className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#161616] hover:bg-red-500/20 text-gray-300 hover:text-red-400 border border-[#2a2a2a] hover:border-red-500/40 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Exit</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { key: 'active', label: 'Active Queue', count: counts.active, color: 'emerald' },
            { key: 'Pending', label: 'New / Pending', count: counts.Pending, color: 'amber' },
            { key: 'Preparing', label: 'Preparing', count: counts.Preparing, color: 'blue' },
            { key: 'Ready', label: 'Ready for Pickup', count: counts.Ready, color: 'emerald' },
            { key: 'Completed', label: 'Completed', count: counts.Completed, color: 'gray' },
          ] as const
        ).map((tab) => {
          const isActive = filterStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                isActive
                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-[#141414] text-gray-400 border-[#262626] hover:text-white hover:border-[#3a3a3a]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-black/20 text-black' : 'bg-[#222] text-gray-300'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-[#121212] border border-[#222] rounded-3xl p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center mx-auto mb-4 text-gray-500">
            <Coffee className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black uppercase tracking-wide text-white mb-1">
            No Orders in Queue
          </h3>
          <p className="text-sm text-gray-500">
            New mobile app orders from Earth&apos;s Kitchen will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const isPending = order.status === 'Pending';
            const isPreparing = order.status === 'Preparing';
            const isReady = order.status === 'Ready';
            const isCompleted = order.status === 'Completed';
            const isBusy = processingOrderId === order.id;

            return (
              <div
                key={order.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  isPending
                    ? 'bg-[#17140d] border-amber-500/40 shadow-lg shadow-amber-500/5'
                    : isPreparing
                    ? 'bg-[#0f1622] border-blue-500/40 shadow-lg shadow-blue-500/5'
                    : isReady
                    ? 'bg-[#0d1c15] border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                    : 'bg-[#121212] border-[#242424] opacity-80'
                }`}
              >
                <div>
                  {/* Top Bar: Status Badge & Pickup Time */}
                  <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-white/10">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border ${
                        isPending
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : isPreparing
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : isReady
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}
                    >
                      {order.status}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300 bg-black/40 px-3 py-1 rounded-lg border border-white/10">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pickup: {order.pickupTime || 'ASAP'}</span>
                    </div>
                  </div>

                  {/* Member Identity Block: Photo, Name, Member ID, Phone */}
                  <div className="flex items-center gap-3.5 bg-black/30 p-3.5 rounded-xl border border-white/10 mb-4">
                    {order.clientPhotoUrl ? (
                      <img
                        src={order.clientPhotoUrl}
                        alt={order.clientName}
                        className="w-14 h-14 rounded-xl object-cover border-2 border-emerald-500/40 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center text-emerald-400 font-black text-lg shrink-0">
                        {order.clientName ? order.clientName.charAt(0).toUpperCase() : <UserIcon className="w-6 h-6" />}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black text-white truncate">
                        {order.clientName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                          <Hash className="w-3.5 h-3.5" />
                          ID: {order.memberId || 'N/A'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-300">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {order.clientPhone || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ordered Items List */}
                  <div className="space-y-2 mb-5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Ordered Items ({order.items?.reduce((acc, i) => acc + (i.quantity || 1), 0) || 0})
                    </div>
                    <div className="bg-black/40 rounded-xl p-3 border border-white/10 space-y-2.5">
                      {(order.items || []).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2 pb-2 last:pb-0 border-b border-white/5 last:border-none"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black text-xs">
                                {item.quantity}x
                              </span>
                              <span className="font-bold text-sm text-white">{item.name}</span>
                            </div>
                            {item.addons && item.addons.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 pl-8">
                                {item.addons.map((addon, aIdx) => (
                                  <span
                                    key={aIdx}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                  >
                                    + {addon.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                  {isPending && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={isBusy}
                        onClick={() => handleUpdateOrderStatus(order, 'Preparing')}
                        className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                      >
                        <ChefHat className="w-4 h-4" />
                        <span>Preparing</span>
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => handleUpdateOrderStatus(order, 'Ready')}
                        className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                      >
                        <Bell className="w-4 h-4" />
                        <span>Done • Notify</span>
                      </button>
                    </div>
                  )}

                  {isPreparing && (
                    <button
                      disabled={isBusy}
                      onClick={() => handleUpdateOrderStatus(order, 'Ready')}
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                    >
                      <Bell className="w-4 h-4" />
                      <span>Order Ready — Notify Member</span>
                    </button>
                  )}

                  {isReady && (
                    <button
                      disabled={isBusy}
                      onClick={() => handleUpdateOrderStatus(order, 'Completed')}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#222] hover:bg-emerald-500 hover:text-black text-emerald-400 border border-emerald-500/40 font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark Picked Up / Completed</span>
                    </button>
                  )}

                  {isCompleted && (
                    <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-emerald-400">
                      <Check className="w-4 h-4" />
                      <span>Order Completed &amp; Member Notified</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default KitchenKioskView;
