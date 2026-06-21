import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Award, Plus, Trash2, Edit, Save, X, Trophy, Coins, Gift, Target, Flame, Star, TrendingUp, Users, Dumbbell, RefreshCw } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

interface RewardItem {
  id: string;
  name: string;
  description: string;
  coinCost: number;
  emoji: string;
  isActive: boolean;
}

interface BadgeConfig {
  id: string;
  name: string;
  description: string;
  emoji: string;
  target: number;
  category: string;
  coinsReward: number;
}

export default function AdminGamificationManager() {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [badges, setBadges] = useState<BadgeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'rewards' | 'badges'>('rewards');
  
  // Reward form
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [rewardForm, setRewardForm] = useState({ name: '', description: '', coinCost: '', emoji: '🎁' });
  const [saving, setSaving] = useState(false);

  // Badge form
  const [showBadgeForm, setShowBadgeForm] = useState(false);
  const [badgeForm, setBadgeForm] = useState({ name: '', description: '', emoji: '🏆', target: '', category: 'general', coinsReward: '10' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load rewards
      const rewardsSnap = await getDocs(collection(db, 'rewardsConfig'));
      setRewards(rewardsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RewardItem)));

      // Load badge configs
      const badgesSnap = await getDocs(collection(db, 'badgeConfigs'));
      setBadges(badgesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BadgeConfig)));
    } catch (err) {
      console.error('Failed to load gamification data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReward = async () => {
    if (!rewardForm.name || !rewardForm.coinCost) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'rewardsConfig'), {
        name: rewardForm.name,
        description: rewardForm.description,
        coinCost: Number(rewardForm.coinCost),
        emoji: rewardForm.emoji,
        isActive: true
      });
      setRewardForm({ name: '', description: '', coinCost: '', emoji: '🎁' });
      setShowRewardForm(false);
      await loadData();
    } catch (err) {
      console.error('Failed to add reward:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReward = async (id: string) => {
    if (!confirm('Delete this reward?')) return;
    try {
      await deleteDoc(doc(db, 'rewardsConfig', id));
      await loadData();
    } catch (err) {
      console.error('Failed to delete reward:', err);
    }
  };

  const handleToggleReward = async (id: string, currentActive: boolean) => {
    try {
      await updateDoc(doc(db, 'rewardsConfig', id), { isActive: !currentActive });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle reward:', err);
    }
  };

  const handleAddBadge = async () => {
    if (!badgeForm.name || !badgeForm.target) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'badgeConfigs'), {
        name: badgeForm.name,
        description: badgeForm.description,
        emoji: badgeForm.emoji,
        target: Number(badgeForm.target),
        category: badgeForm.category,
        coinsReward: Number(badgeForm.coinsReward)
      });
      setBadgeForm({ name: '', description: '', emoji: '🏆', target: '', category: 'general', coinsReward: '10' });
      setShowBadgeForm(false);
      await loadData();
    } catch (err) {
      console.error('Failed to add badge:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBadge = async (id: string) => {
    if (!confirm('Delete this badge?')) return;
    try {
      await deleteDoc(doc(db, 'badgeConfigs', id));
      await loadData();
    } catch (err) {
      console.error('Failed to delete badge:', err);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-500/10 rounded-xl">
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Gamification Manager</h2>
            <p className="text-xs text-muted-foreground">Configure badges, rewards & coin economy</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={loadData} className="h-8 w-8">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* View Toggle */}
      <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border">
        <button 
          onClick={() => setActiveView('rewards')}
          className={`py-2 text-sm font-bold rounded-lg transition-colors ${activeView === 'rewards' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          <Gift className="h-4 w-4 inline mr-1.5" /> Rewards ({rewards.length})
        </button>
        <button 
          onClick={() => setActiveView('badges')}
          className={`py-2 text-sm font-bold rounded-lg transition-colors ${activeView === 'badges' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          <Award className="h-4 w-4 inline mr-1.5" /> Badges ({badges.length})
        </button>
      </div>

      {/* ─── Rewards Management ─── */}
      {activeView === 'rewards' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Rewards Shop Items</h3>
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowRewardForm(!showRewardForm)}>
              {showRewardForm ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              {showRewardForm ? 'Cancel' : 'Add Reward'}
            </Button>
          </div>

          {showRewardForm && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Name *</Label>
                    <Input value={rewardForm.name} onChange={e => setRewardForm(f => ({ ...f, name: e.target.value }))} placeholder="Free Protein Shake" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Coin Cost *</Label>
                    <Input type="number" value={rewardForm.coinCost} onChange={e => setRewardForm(f => ({ ...f, coinCost: e.target.value }))} placeholder="50" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold">Description</Label>
                  <Input value={rewardForm.description} onChange={e => setRewardForm(f => ({ ...f, description: e.target.value }))} placeholder="Redeem for a free protein shake at the juice bar" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold">Emoji</Label>
                  <Input value={rewardForm.emoji} onChange={e => setRewardForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🥤" maxLength={4} className="w-20" />
                </div>
                <Button className="w-full font-bold" onClick={handleAddReward} disabled={saving || !rewardForm.name || !rewardForm.coinCost}>
                  {saving ? 'Saving...' : 'Add Reward'}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {rewards.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground italic">No custom rewards configured. Members see default rewards.</p>
            ) : (
              rewards.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-card border">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{r.emoji}</span>
                    <div>
                      <p className="text-sm font-bold">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                      <Coins className="h-3 w-3 mr-0.5" /> {r.coinCost}
                    </Badge>
                    <Button 
                      variant={r.isActive ? 'outline' : 'ghost'} 
                      size="sm" 
                      className="h-6 text-[9px]"
                      onClick={() => handleToggleReward(r.id, r.isActive)}
                    >
                      {r.isActive ? 'Active' : 'Disabled'}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteReward(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── Badges Management ─── */}
      {activeView === 'badges' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Custom Badge Definitions</h3>
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowBadgeForm(!showBadgeForm)}>
              {showBadgeForm ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              {showBadgeForm ? 'Cancel' : 'Add Badge'}
            </Button>
          </div>

          {showBadgeForm && (
            <Card className="border-purple-500/20 bg-purple-500/5">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Name *</Label>
                    <Input value={badgeForm.name} onChange={e => setBadgeForm(f => ({ ...f, name: e.target.value }))} placeholder="Gym Warrior" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Target Value *</Label>
                    <Input type="number" value={badgeForm.target} onChange={e => setBadgeForm(f => ({ ...f, target: e.target.value }))} placeholder="30" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold">Description</Label>
                  <Input value={badgeForm.description} onChange={e => setBadgeForm(f => ({ ...f, description: e.target.value }))} placeholder="Complete 30 sessions" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Emoji</Label>
                    <Input value={badgeForm.emoji} onChange={e => setBadgeForm(f => ({ ...f, emoji: e.target.value }))} maxLength={4} className="w-full" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Category</Label>
                    <select 
                      value={badgeForm.category} 
                      onChange={e => setBadgeForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full h-9 rounded-md border px-2 text-xs bg-background"
                    >
                      <option value="general">General</option>
                      <option value="featured">Featured</option>
                      <option value="streak">Streak</option>
                      <option value="social">Social</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold">Coin Reward</Label>
                    <Input type="number" value={badgeForm.coinsReward} onChange={e => setBadgeForm(f => ({ ...f, coinsReward: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full font-bold" onClick={handleAddBadge} disabled={saving || !badgeForm.name || !badgeForm.target}>
                  {saving ? 'Saving...' : 'Add Badge'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Default badges info */}
          <Card className="bg-muted/30">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium">
                <Star className="h-3 w-3 inline mr-1 text-amber-500" />
                10 default badges are always active (First Timer, Bronze, Silver, Gold, Platinum, 7-Day Streak, 30-Day Streak, Social Butterfly, Marathoner, Champion).
                Custom badges below are added on top of defaults.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {badges.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground italic">No custom badges. Only default badges are shown to members.</p>
            ) : (
              badges.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-card border">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{b.emoji}</span>
                    <div>
                      <p className="text-sm font-bold">{b.name}</p>
                      <p className="text-[10px] text-muted-foreground">{b.description} · Target: {b.target}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] font-bold capitalize">{b.category}</Badge>
                    <Badge className="bg-purple-500/10 text-purple-600 text-[10px] font-bold">
                      +{b.coinsReward} coins
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteBadge(b.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
