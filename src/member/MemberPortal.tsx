import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Lock, Globe, UserPlus, User, LogOut, Sun, Moon, Calendar, Users, History, TrendingUp, Package, ShoppingBag, Bell, Coins } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, doc, documentId, getDoc, getDocs } from 'firebase/firestore';
import { Client } from '../types';

import MemberHome from './MemberHome';
import MemberSessions from './MemberSessions';
import MemberPackages from './MemberPackages';
import MemberAttendance from './MemberAttendance';
import MemberProfile from './MemberProfile';
import MemberClasses from './MemberClasses';
import MemberSubscription from './MemberSubscription';
import MemberProgress from './MemberProgress';
import MemberLocker from './MemberLocker';
import MemberJuiceBar from './MemberJuiceBar';
import MemberInvites from './MemberInvites';
import GuestPortal from './GuestPortal';
import CartDrawer from './CartDrawer';
import MemberNotificationBell from './MemberNotificationBell';
import MemberWallet from './MemberWallet';
import MemberBadges from './MemberBadges';
import MemberRewards from './MemberRewards';
import MemberBodyTracker from './MemberBodyTracker';


type MemberTab = 'home' | 'booking' | 'juicebar' | 'wallet' | 'locker' | 'invites' | 'profile';

const NAV_ITEMS: { tab: MemberTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'home',     label: 'Pass',       icon: <QrCode className="h-5 w-5" /> },
  { tab: 'booking',  label: 'Bookings',   icon: <Calendar className="h-5 w-5" /> },
  { tab: 'juicebar', label: 'Juice Bar',  icon: <Globe className="h-5 w-5" /> },
  { tab: 'wallet',   label: 'Wallet',     icon: <Coins className="h-5 w-5" /> },
  { tab: 'locker',   label: 'Locker',     icon: <Lock className="h-5 w-5" /> },
  { tab: 'invites',  label: 'Invites',    icon: <UserPlus className="h-5 w-5" /> },
  { tab: 'profile',  label: 'Profile',    icon: <User className="h-5 w-5" /> },
];

interface MemberPortalProps {
  isGuest?: boolean;
  onSwitchToCRM?: () => void;
  onSwitchToStore?: () => void;
}

export default function MemberPortal({ isGuest = false, onSwitchToCRM, onSwitchToStore }: MemberPortalProps = {}) {
  const { currentUser, logout } = useAuth();
  const { branding } = useSettings();
  const { theme, toggleTheme } = useTheme();
  
  const [activeTab, setActiveTab] = useState<MemberTab>('home');
  const [primaryClient, setPrimaryClient] = useState<Client | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [linkedClients, setLinkedClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Booking and Profile Sub-tabs state
  const [bookingSubTab, setBookingSubTab] = useState<'pt' | 'group'>('pt');
  const [profileSubTab, setProfileSubTab] = useState<'settings' | 'progress' | 'membership' | 'attendance' | 'badges' | 'rewards'>('settings');


  // Navigation handler for quick shortcuts from MemberHome
  const handleNavigate = (target: string) => {
    if (target === 'booking') setActiveTab('booking');
    else if (target === 'profile') setActiveTab('profile');
    else if (target === 'profile-progress') {
      setActiveTab('profile');
      setProfileSubTab('progress');
    } else if (target === 'profile-membership') {
      setActiveTab('profile');
      setProfileSubTab('membership');
    } else if (target === 'profile-attendance') {
      setActiveTab('profile');
      setProfileSubTab('attendance');
    } else if (target === 'juicebar') setActiveTab('juicebar');
    else if (target === 'wallet') setActiveTab('wallet');
    else if (target === 'locker') setActiveTab('locker');
    else if (target === 'invites') setActiveTab('invites');
  };

  // 1. Fetch primary client record
  useEffect(() => {
    if (!currentUser?.clientRecordId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'clients'),
      where('memberId', '==', currentUser.clientRecordId.trim())
    );

    getDocs(q)
      .then((snapshot) => {
        if (!snapshot.empty && snapshot.docs[0]) {
          const docSnap = snapshot.docs[0];
          const pClient = { ...docSnap.data(), id: docSnap.id } as Client;
          setPrimaryClient(pClient);
          setActiveClient(pClient);
          setSelectedClientId(prev => prev || pClient.id);
        } else {
          console.warn("No client document found matching member ID:", currentUser.clientRecordId);
        }
      })
      .catch((err) => {
        console.warn("Could not load client record (may be a permissions issue):", err.code || err.message);
      })
      .finally(() => setLoading(false));
  }, [currentUser?.clientRecordId]);

  // 2. Fetch active client record when switched
  useEffect(() => {
    if (!selectedClientId) return;
    // Skip if already loaded as primary
    if (activeClient?.id === selectedClientId) return;

    const docRef = doc(db, 'clients', selectedClientId);
    getDoc(docRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          setActiveClient({ ...docSnap.data(), id: docSnap.id } as Client);
        }
      })
      .catch((err) => {
        console.warn("Could not load active client (may be a permissions issue):", err.code || err.message);
      });
  }, [selectedClientId]);

  // 3. Fetch linked clients (family members)
  useEffect(() => {
    if (!primaryClient) {
      setLinkedClients([]);
      return;
    }

    const linkedIds = primaryClient.linkedClientIds || [];
    if (linkedIds.length === 0) {
      setLinkedClients([]);
      return;
    }

    const q = query(
      collection(db, 'clients'),
      where(documentId(), 'in', linkedIds)
    );

    getDocs(q)
      .then((snapshot) => {
        const list = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        } as Client));
        setLinkedClients(list);
      })
      .catch((err) => {
        console.warn("Could not load linked clients:", err.code || err.message);
      });
  }, [primaryClient?.linkedClientIds]);

  if (isGuest) {
    return <GuestPortal onSwitchToCRM={onSwitchToCRM || (() => {})} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (primaryClient?.status === 'Lead') {
    return (
      <GuestPortal 
        onSwitchToCRM={onSwitchToCRM || logout} 
        isLeadPending={true} 
        client={primaryClient} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b bg-card shadow-sm h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName} className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
          ) : (
            <h1 className="text-lg font-extralight tracking-[0.2em] uppercase text-primary font-logo">{branding.companyName}</h1>
          )}
          <Badge variant="outline" className="text-[10px] font-bold tracking-widest uppercase text-primary border-primary/30 hidden sm:inline-flex">
            Member
          </Badge>
        </div>

        {/* Profile Switcher dropdown next to theme toggle */}
        <div className="flex items-center gap-2">
          {primaryClient && linkedClients.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-zinc-400 shrink-0" />
              <Select value={selectedClientId} onValueChange={(val) => setSelectedClientId(val || '')}>
                <SelectTrigger className="h-8 text-[11px] font-bold bg-background border-zinc-800 w-32 sm:w-40">
                  <SelectValue placeholder="Select Profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={primaryClient.id}>
                    {primaryClient.name} (You)
                  </SelectItem>
                  {linkedClients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {onSwitchToStore && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onSwitchToStore} 
              title="Shop Packages" 
              className="h-8 w-8 text-zinc-400 hover:text-white"
            >
              <ShoppingBag className="h-4 w-4" />
            </Button>
          )}

          <CartDrawer />

          <MemberNotificationBell clientId={activeClient?.id} />

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8 text-zinc-400 hover:text-white">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 pb-24 max-w-md">
        {activeTab === 'home' && <MemberHome client={activeClient} onSwitchToStore={onSwitchToStore} onNavigate={handleNavigate} />}
        
        {activeTab === 'booking' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border">
              <button 
                onClick={() => setBookingSubTab('pt')} 
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${bookingSubTab === 'pt' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                PT Sessions
              </button>
              <button 
                onClick={() => setBookingSubTab('group')} 
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${bookingSubTab === 'group' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Group Classes
              </button>
            </div>
            {bookingSubTab === 'pt' ? <MemberSessions client={activeClient} /> : <MemberClasses client={activeClient} />}
          </div>
        )}

        {activeTab === 'juicebar' && <MemberJuiceBar client={activeClient} />}
        {activeTab === 'wallet' && <MemberWallet client={activeClient} />}
        {activeTab === 'locker' && <MemberLocker client={activeClient} />}
        {activeTab === 'invites' && <MemberInvites client={activeClient} />}
        
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 p-1 bg-muted/60 rounded-xl border gap-0.5">

              <button 
                onClick={() => setProfileSubTab('settings')} 
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === 'settings' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Settings
              </button>
              <button 
                onClick={() => setProfileSubTab('progress')} 
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === 'progress' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Progress
              </button>
              <button 
                onClick={() => setProfileSubTab('membership')} 
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === 'membership' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Membership
              </button>
              <button 
                onClick={() => setProfileSubTab('attendance')} 
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === 'attendance' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                History
              </button>
              <button 
                onClick={() => setProfileSubTab('badges')} 
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === 'badges' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Badges
              </button>
              <button 
                onClick={() => setProfileSubTab('rewards')} 
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === 'rewards' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Rewards
              </button>
            </div>

            {profileSubTab === 'settings' && <MemberProfile client={activeClient} />}
            {profileSubTab === 'progress' && (
              <div className="space-y-6">
                <MemberProgress client={activeClient} />
                <MemberBodyTracker client={activeClient} />
              </div>
            )}
            {profileSubTab === 'membership' && (
              <div className="space-y-6 animate-in fade-in">
                <MemberPackages client={activeClient} onSwitchToStore={onSwitchToStore} />
                <MemberSubscription client={activeClient} />
              </div>
            )}
            {profileSubTab === 'attendance' && <MemberAttendance client={activeClient} />}
            {profileSubTab === 'badges' && <MemberBadges client={activeClient} />}
            {profileSubTab === 'rewards' && <MemberRewards client={activeClient} />}

          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50 flex justify-around py-1.5 shadow-lg backdrop-blur-md bg-opacity-90">
        {NAV_ITEMS.map(({ tab, label, icon }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 min-w-[56px] transition-colors rounded-xl ${
              activeTab === tab ? 'text-primary font-bold' : 'text-muted-foreground font-semibold'
            }`}
          >
            {icon}
            <span className="text-[9px] tracking-wide">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
