import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Lock, Globe, UserPlus, User, LogOut, Sun, Moon, Calendar, Users, History, TrendingUp, Package, ShoppingBag, Bell, Coins } from 'lucide-react';
import { db, getTenantId } from '../firebase';
import { collection, query, where, doc, documentId, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
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
  onSwitchToCRM?: (tab?: string) => void;
  onSwitchToStore?: () => void;
  initialTab?: string;
}

export default function MemberPortal({ isGuest = false, onSwitchToCRM, onSwitchToStore, initialTab }: MemberPortalProps = {}) {
  const { currentUser, logout } = useAuth();
  const { branding, features } = useSettings();
  const { theme, toggleTheme } = useTheme();

  const isStrike = useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  }, [branding?.companyName]);

  const isMobile = useMemo(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|mitrixogymcrmCRM/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);
  
  const filteredNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.tab === 'home' && features.qrCheckin === false) return false;
      if (item.tab === 'juicebar') {
        if (isStrike && isMobile) return false;
        if (features.juiceBar === false) return false;
      }
      if (item.tab === 'locker') {
        if (isStrike && isMobile) return false;
        if (features.locker === false) return false;
      }
      if (item.tab === 'wallet' && features.wallet === false) return false;
      if (item.tab === 'invites' && features.operations === false) return false;
      return true;
    }).map(item => {
      if (item.tab === 'home' && isStrike && isMobile) {
        return { ...item, label: 'Home Screen' };
      }
      return item;
    });
  }, [features, isStrike, isMobile]);

  const [activeTab, setActiveTab] = useState<MemberTab>((initialTab as MemberTab) || 'home');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as MemberTab);
    }
  }, [initialTab]);

  const [primaryClient, setPrimaryClient] = useState<Client | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [linkedClients, setLinkedClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Booking and Profile Sub-tabs state
  const [bookingSubTab, setBookingSubTab] = useState<'pt' | 'group'>(isStrike ? 'group' : 'pt');
  
  const profileSubTabsList = useMemo(() => {
    const list = [
      { id: 'settings', label: 'Settings' },
      { id: 'progress', label: 'Progress', pointSystemRequired: true },
      { id: 'membership', label: 'Membership' },
      { id: 'attendance', label: 'History' },
      { id: 'badges', label: 'Badges', pointSystemRequired: true },
      { id: 'rewards', label: 'Rewards', pointSystemRequired: true },
    ];
    return list.filter(tab => !tab.pointSystemRequired || features.pointsSystem !== false);
  }, [features.pointsSystem]);

  const [profileSubTab, setProfileSubTab] = useState<'settings' | 'progress' | 'membership' | 'attendance' | 'badges' | 'rewards'>('settings');

  // Ensure active tab resets if current active tab gets disabled
  useEffect(() => {
    if (features.qrCheckin === false && activeTab === 'home') {
      setActiveTab('booking');
    }
  }, [features.qrCheckin, activeTab]);

  // Ensure profile sub-tab resets if current subtab gets disabled
  useEffect(() => {
    const isAllowed = profileSubTabsList.some(tab => tab.id === profileSubTab);
    if (!isAllowed) {
      setProfileSubTab('settings');
    }
  }, [profileSubTabsList, profileSubTab]);

  // Navigation handler for quick shortcuts from MemberHome
  const handleNavigate = (target: string) => {
    if (target === 'booking') setActiveTab('booking');
    else if (target === 'profile') setActiveTab('profile');
    else if (target === 'profile-progress') {
      if (features.pointsSystem !== false) {
        setActiveTab('profile');
        setProfileSubTab('progress');
      }
    } else if (target === 'profile-membership') {
      setActiveTab('profile');
      setProfileSubTab('membership');
    } else if (target === 'profile-attendance') {
      setActiveTab('profile');
      setProfileSubTab('attendance');
    } else if (target === 'juicebar') {
      if (features.juiceBar !== false) setActiveTab('juicebar');
    } else if (target === 'wallet') {
      if (features.wallet !== false) setActiveTab('wallet');
    } else if (target === 'locker') {
      if (features.locker !== false) setActiveTab('locker');
    } else if (target === 'invites') {
      if (features.operations !== false) setActiveTab('invites');
    }
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

  // 2. Listen to active client record in real-time
  useEffect(() => {
    if (!selectedClientId) return;

    const docRef = doc(db, 'clients', selectedClientId);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setActiveClient({ ...docSnap.data(), id: docSnap.id } as Client);
      }
    }, (err) => {
      console.warn("Could not listen to active client record:", err.code || err.message);
    });

    return () => unsub();
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
    <div className="h-screen overflow-hidden bg-background flex flex-col font-sans relative">
      {/* Decorative Premium Glow Blobs */}
      <div className="absolute top-[5%] right-[-20%] w-[320px] h-[320px] rounded-full bg-primary/10 dark:bg-primary/20 blur-[100px] pointer-events-none z-0" />
      <div className="absolute bottom-[15%] left-[-20%] w-[320px] h-[320px] rounded-full bg-orange-500/10 dark:bg-orange-500/15 blur-[100px] pointer-events-none z-0" />

      <header className="border-b bg-card/60 backdrop-blur-xl h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity"
            onClick={() => setActiveTab('home')}
          >
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.companyName} className="h-8 w-auto object-contain dark:brightness-0 dark:invert" referrerPolicy="no-referrer" />
            ) : (
              <h1 className="text-lg font-extralight tracking-[0.2em] uppercase text-primary font-logo">{branding.companyName}</h1>
            )}
          </div>
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
                    {primaryClient.name.toUpperCase()} (You)
                  </SelectItem>
                  {linkedClients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <MemberNotificationBell clientId={activeClient?.id} />

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-foreground">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8 text-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28 max-w-md mx-auto w-full overscroll-contain">
        {activeTab === 'home' && <MemberHome client={activeClient} onSwitchToStore={onSwitchToStore} onNavigate={handleNavigate} />}
        
        {activeTab === 'booking' && (
          <div className="space-y-4">
            {!isStrike && features.ptPackages !== false && (
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
            )}
            {isStrike || features.ptPackages === false || bookingSubTab === 'group' ? <MemberClasses client={activeClient} onSwitchToStore={onSwitchToStore} /> : <MemberSessions client={activeClient} onSwitchToStore={onSwitchToStore} />}
          </div>
        )}

        {activeTab === 'juicebar' && <MemberJuiceBar client={activeClient} />}
        {activeTab === 'wallet' && <MemberWallet client={activeClient} />}
        {activeTab === 'locker' && <MemberLocker client={activeClient} />}
        {activeTab === 'invites' && <MemberInvites client={activeClient} />}
        
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 p-1 bg-muted/60 rounded-xl border gap-0.5">
              {profileSubTabsList.map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => setProfileSubTab(tab.id as any)}
                  className={`py-1.5 text-[10px] font-bold rounded-lg transition-colors truncate ${profileSubTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/80 dark:text-zinc-400 hover:text-foreground'}`}
                >
                  {tab.label}
                </button>
              ))}
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

      <nav className="fixed bottom-0 left-0 right-0 bg-card/90 border-t z-50 flex justify-around pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md">
        {filteredNavItems.map(({ tab, label, icon }) => (
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
