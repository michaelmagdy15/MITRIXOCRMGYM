import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Flame, Trophy, Coins, Lock, Star, Sparkles } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  seedBadgeDefinitions, getAllBadgeDefinitions, getMemberBadges,
  updateBadgeProgress, getOrCreateCoinsWallet, getOrCreateStreak,
  type BadgeDefinition, type MemberBadge, type CoinsWallet, type StreakRecord
} from '../services/gamificationService';

export default function MemberBadges({ client }: { client: Client | null }) {
  const [badges, setBadges] = useState<(BadgeDefinition & { memberBadge?: MemberBadge })[]>([]);
  const [coinsWallet, setCoinsWallet] = useState<CoinsWallet | null>(null);
  const [streak, setStreak] = useState<StreakRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unlocked' | 'in-progress'>('all');

  useEffect(() => {
    if (!client?.id) { setLoading(false); return; }

    const loadAll = async () => {
      try {
        await seedBadgeDefinitions();
        
        const [defs, memberBadges, wallet, streakData] = await Promise.all([
          getAllBadgeDefinitions(),
          getMemberBadges(client.id),
          getOrCreateCoinsWallet(client.id),
          getOrCreateStreak(client.id),
        ]);

        // Get member stats for progress calculation
        const [attendanceSnap, classesSnap] = await Promise.all([
          getDocs(query(collection(db, 'attendance'), where('clientId', '==', client.id))),
          getDocs(query(collection(db, 'classes'), where('attendees', 'array-contains', client.id))),
        ]);
        
        const checkinCount = attendanceSnap.size;
        const classesJoined = classesSnap.size;
        const monthsActive = client.startDate
          ? Math.floor((Date.now() - new Date(client.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
          : 0;

        // Update progress for each badge
        const memberBadgeMap = new Map(memberBadges.map(b => [b.badgeId, b]));
        
        const enriched = await Promise.all(defs.filter(d => d.active).map(async (def) => {
          let currentValue = 0;
          switch (def.criteria.type) {
            case 'checkin_count': currentValue = checkinCount; break;
            case 'checkin_streak': currentValue = streakData.bestStreak; break;
            case 'classes_joined': currentValue = classesJoined; break;
            case 'pt_sessions': currentValue = (client as any).sessionsUsed || 0; break;
            case 'months_active': currentValue = monthsActive; break;
          }
          
          const updated = await updateBadgeProgress(client.id, def, currentValue);
          return { ...def, memberBadge: updated };
        }));

        setBadges(enriched);
        setCoinsWallet(wallet);
        setStreak(streakData);
      } catch (err) {
        console.error('Failed to load badges:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [client?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const unlockedCount = badges.filter(b => b.memberBadge?.unlockedAt).length;
  const totalCoins = coinsWallet?.balance || 0;

  const filteredBadges = badges.filter(b => {
    if (activeFilter === 'unlocked') return !!b.memberBadge?.unlockedAt;
    if (activeFilter === 'in-progress') return !b.memberBadge?.unlockedAt;
    return true;
  });

  const featuredBadges = filteredBadges.filter(b => b.category === 'featured');
  const generalBadges = filteredBadges.filter(b => b.category === 'general');

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Hero Stats ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/20 via-purple-500/5 to-transparent border border-purple-500/20 p-5">
        <div className="absolute top-0 right-0 w-36 h-36 bg-purple-500/5 rounded-full -translate-y-10 translate-x-10" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Trophy className="h-5 w-5 text-purple-500" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">Achievements</span>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-card/50 rounded-xl border">
              <p className="text-2xl font-black text-purple-500">{unlockedCount}</p>
              <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Badges</p>
            </div>
            <div className="text-center p-3 bg-card/50 rounded-xl border">
              <p className="text-2xl font-black text-amber-500 flex items-center justify-center gap-0.5">
                <Coins className="h-4 w-4" />{totalCoins}
              </p>
              <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Coins</p>
            </div>
            <div className="text-center p-3 bg-card/50 rounded-xl border">
              <p className="text-2xl font-black text-orange-500 flex items-center justify-center gap-0.5">
                <Flame className="h-4 w-4" />{streak?.currentStreak || 0}
              </p>
              <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Streak</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Filter Tabs ─── */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {(['all', 'unlocked', 'in-progress'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
              activeFilter === tab ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* ─── Featured Badges ─── */}
      {featuredBadges.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-600">Featured</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {featuredBadges.map(badge => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </div>
      )}

      {/* ─── General Badges ─── */}
      {generalBadges.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary">General</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {generalBadges.map(badge => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </div>
      )}

      {filteredBadges.length === 0 && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-10 text-center text-xs text-muted-foreground italic">
            <Trophy className="h-8 w-8 mx-auto opacity-20 mb-2" />
            No badges match this filter.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BadgeCard({ badge }: { badge: BadgeDefinition & { memberBadge?: MemberBadge } }) {
  const mb = badge.memberBadge;
  const isUnlocked = !!mb?.unlockedAt;
  const progress = mb?.progress || 0;
  const target = badge.criteria.target;
  const progressPercent = Math.min(100, Math.round((progress / target) * 100));

  return (
    <div className={`relative p-3 rounded-xl border transition-all ${
      isUnlocked
        ? 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30 shadow-sm'
        : 'bg-card/40 opacity-80'
    }`}>
      {isUnlocked && (
        <div className="absolute top-1.5 right-1.5">
          <Sparkles className="h-3 w-3 text-primary animate-pulse" />
        </div>
      )}
      
      <div className="text-center space-y-1.5">
        <div className={`text-3xl ${!isUnlocked ? 'grayscale opacity-40' : ''}`}>
          {badge.icon}
        </div>
        <h4 className="text-[11px] font-extrabold leading-tight">{badge.name}</h4>
        <p className="text-[9px] text-muted-foreground leading-snug">{badge.description}</p>
        
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isUnlocked ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between text-[8px]">
          <span className={`font-mono font-bold ${isUnlocked ? 'text-primary' : 'text-muted-foreground'}`}>
            {isUnlocked ? '✓ Unlocked' : `${progress}/${target}`}
          </span>
          <span className="text-amber-500 font-bold flex items-center gap-0.5">
            +{badge.coinsReward} <Coins className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
