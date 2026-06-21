import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Coins, Award, ShoppingBag, UserPlus, CreditCard, Scale, Dumbbell, RefreshCw, Bell, Flame, Clock } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { format, parseISO, formatDistanceToNow, isAfter, subDays } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'payment' | 'attendance' | 'badge' | 'points' | 'body' | 'new_member' | 'redemption';
  memberName: string;
  description: string;
  timestamp: string;
  metadata?: any;
}

export default function AdminActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'payments' | 'attendance' | 'gamification'>('all');

  useEffect(() => { loadActivities(); }, []);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const items: ActivityItem[] = [];
      const cutoff = subDays(new Date(), 7);

      // 1. Recent payments
      const paymentsSnap = await getDocs(collection(db, 'payments'));
      paymentsSnap.docs.forEach(d => {
        const p = d.data();
        if (p.date && isAfter(parseISO(p.date), cutoff)) {
          items.push({
            id: `pay-${d.id}`,
            type: 'payment',
            memberName: p.clientName || 'Unknown',
            description: `Paid ${Number(p.amount || 0).toLocaleString()} LE for ${p.packageType || 'package'}`,
            timestamp: p.date,
          });
        }
      });

      // 2. Recent attendance
      const attendanceSnap = await getDocs(collection(db, 'attendance'));
      attendanceSnap.docs.forEach(d => {
        const a = d.data();
        if (a.date && isAfter(parseISO(a.date), cutoff)) {
          items.push({
            id: `att-${d.id}`,
            type: 'attendance',
            memberName: a.clientName || a.memberName || 'Unknown',
            description: `Checked in${a.branch ? ` at ${a.branch}` : ''}`,
            timestamp: a.date,
          });
        }
      });

      // 3. Recent point transactions
      try {
        const txSnap = await getDocs(collection(db, 'pointTransactions'));
        txSnap.docs.forEach(d => {
          const t = d.data();
          if (t.createdAt && isAfter(parseISO(t.createdAt), cutoff)) {
            items.push({
              id: `pts-${d.id}`,
              type: 'points',
              memberName: t.memberName || 'Member',
              description: `${t.type === 'credit' ? '+' : '-'}${t.amount} points — ${t.reason || 'transaction'}`,
              timestamp: t.createdAt,
            });
          }
        });
      } catch {}

      // 4. Recent body records
      try {
        const bodySnap = await getDocs(collection(db, 'bodyRecords'));
        bodySnap.docs.forEach(d => {
          const b = d.data();
          if (b.date && isAfter(parseISO(b.date), cutoff)) {
            items.push({
              id: `body-${d.id}`,
              type: 'body',
              memberName: 'Member',
              description: `Logged body composition: ${b.weight}kg`,
              timestamp: b.date,
            });
          }
        });
      } catch {}

      // Sort by timestamp desc
      items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setActivities(items.slice(0, 100));
    } catch (err) {
      console.error('Failed to load activity feed:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredActivities = activities.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'payments') return a.type === 'payment';
    if (filter === 'attendance') return a.type === 'attendance';
    if (filter === 'gamification') return ['badge', 'points', 'redemption'].includes(a.type);
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'payment': return <CreditCard className="h-3.5 w-3.5 text-emerald-500" />;
      case 'attendance': return <Dumbbell className="h-3.5 w-3.5 text-blue-500" />;
      case 'badge': return <Award className="h-3.5 w-3.5 text-amber-500" />;
      case 'points': return <Coins className="h-3.5 w-3.5 text-purple-500" />;
      case 'body': return <Scale className="h-3.5 w-3.5 text-cyan-500" />;
      case 'new_member': return <UserPlus className="h-3.5 w-3.5 text-pink-500" />;
      case 'redemption': return <ShoppingBag className="h-3.5 w-3.5 text-orange-500" />;
      default: return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'payment': return 'bg-emerald-500/10 border-emerald-500/20';
      case 'attendance': return 'bg-blue-500/10 border-blue-500/20';
      case 'badge': return 'bg-amber-500/10 border-amber-500/20';
      case 'points': return 'bg-purple-500/10 border-purple-500/20';
      case 'body': return 'bg-cyan-500/10 border-cyan-500/20';
      case 'new_member': return 'bg-pink-500/10 border-pink-500/20';
      case 'redemption': return 'bg-orange-500/10 border-orange-500/20';
      default: return 'bg-muted/30 border-border/50';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Activity Feed</CardTitle>
              <CardDescription className="text-[10px]">Last 7 days of member activity</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadActivities}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {/* Filter tabs */}
        <div className="flex gap-1.5 mt-3">
          {[
            { key: 'all', label: 'All', icon: <Activity className="h-3 w-3" /> },
            { key: 'payments', label: 'Payments', icon: <CreditCard className="h-3 w-3" /> },
            { key: 'attendance', label: 'Check-ins', icon: <Dumbbell className="h-3 w-3" /> },
            { key: 'gamification', label: 'Points', icon: <Coins className="h-3 w-3" /> },
          ].map(f => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[9px] font-bold px-2 gap-1"
              onClick={() => setFilter(f.key as any)}
            >
              {f.icon} {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <p className="text-center py-6 text-xs text-muted-foreground italic">No activity in the last 7 days</p>
        ) : (
          filteredActivities.map(a => (
            <div key={a.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${getColor(a.type)}`}>
              <div className="p-1.5 bg-card rounded-lg shadow-sm mt-0.5">
                {getIcon(a.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold truncate">{a.memberName}</span>
                  <Badge variant="outline" className="text-[7px] font-bold px-1 py-0 h-3.5 capitalize shrink-0">
                    {a.type === 'body' ? 'body' : a.type}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.description}</p>
                <p className="text-[8px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {(() => { try { return formatDistanceToNow(parseISO(a.timestamp), { addSuffix: true }); } catch { return ''; } })()}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
