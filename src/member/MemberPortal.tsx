import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Lock, Globe, UserPlus, User, LogOut, Sun, Moon, Calendar, Users, History, TrendingUp, Package, ShoppingBag, Bell, Coins, AlertCircle } from 'lucide-react';
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
import { MemberScreenSkeleton } from './components/Skeleton';


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
    let active = true;

    const findClient = async () => {
      try {
        // Option A: Match by memberId (clientRecordId)
        if (currentUser?.clientRecordId) {
          const q = query(
            collection(db, 'clients'),
            where('memberId', '==', currentUser.clientRecordId.trim())
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty && snapshot.docs[0]) {
            const docSnap = snapshot.docs[0];
            const pClient = { ...docSnap.data(), id: docSnap.id } as Client;
            if (active) {
              setPrimaryClient(pClient);
              setActiveClient(pClient);
              setSelectedClientId(prev => prev || pClient.id);
              setLoading(false);
            }
            return;
          }
        }

        // Option B: Match by portalUserId (user's auth UID)
        if (currentUser?.id) {
          const qUid = query(
            collection(db, 'clients'),
            where('portalUserId', '==', currentUser.id)
          );
          const uidSnap = await getDocs(qUid);
          if (!uidSnap.empty && uidSnap.docs[0]) {
            const docSnap = uidSnap.docs[0];
            const pClient = { ...docSnap.data(), id: docSnap.id } as Client;
            if (active) {
              setPrimaryClient(pClient);
              setActiveClient(pClient);
              setSelectedClientId(prev => prev || pClient.id);
              setLoading(false);
            }
            return;
          }
        }

        // Option C: Match by Phone Number (normalized digits)
        const userPhone = currentUser?.phone || '';
        if (userPhone) {
          const cleanPhone = userPhone.replace(/\D/g, '').slice(-9);
          if (cleanPhone) {
            const allSnap = await getDocs(collection(db, 'clients'));
            const matched = allSnap.docs.find(d => {
              const cPhone = (d.data().phone || '').replace(/\D/g, '').slice(-9);
              return cPhone && cPhone === cleanPhone;
            });
            if (matched && active) {
              const pClient = { ...matched.data(), id: matched.id } as Client;
              setPrimaryClient(pClient);
              setActiveClient(pClient);
              setSelectedClientId(prev => prev || pClient.id);
              setLoading(false);
              return;
            }
          }
        }

        // Option D: Match by Email
        if (currentUser?.email) {
          const qEmail = query(
            collection(db, 'clients'),
            where('email', '==', currentUser.email.trim().toLowerCase())
          );
          const emailSnap = await getDocs(qEmail);
          if (!emailSnap.empty && emailSnap.docs[0] && active) {
            const docSnap = emailSnap.docs[0];
            const pClient = { ...docSnap.data(), id: docSnap.id } as Client;
            setPrimaryClient(pClient);
            setActiveClient(pClient);
            setSelectedClientId(prev => prev || pClient.id);
            setLoading(false);
            return;
          }
        }
      } catch (err: any) {
        console.warn("Could not load client record:", err.code || err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    findClient();

    return () => {
      active = false;
    };
  }, [currentUser?.clientRecordId, currentUser?.id, currentUser?.phone, currentUser?.email]);

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
      <div className="min-h-screen bg-background">
        <div className="h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]" />
        <main className="px-4 py-6 max-w-md mx-auto w-full">
          <MemberScreenSkeleton />
        </main>
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
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-xl h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity"
            onClick={() => setActiveTab('home')}
          >
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.companyName} className="h-7 w-auto object-contain dark:brightness-0 dark:invert" referrerPolicy="no-referrer" />
            ) : (
              <h1 className="text-base font-bold tracking-tight uppercase text-foreground">{branding.companyName}</h1>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground border-border hidden sm:inline-flex">
            Member
          </Badge>
        </div>

        {/* Profile Switcher dropdown next to theme toggle */}
        <div className="flex items-center gap-1.5">
          {primaryClient && linkedClients.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedClientId} onValueChange={(val) => setSelectedClientId(val || '')}>
                <SelectTrigger className="h-8 text-[11px] font-semibold bg-background border-border w-32 sm:w-40">
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

          <MemberNotificationBell clientId={activeClient?.id} />

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 max-w-md mx-auto w-full overscroll-contain">
        {activeClient?.status === 'Expired' && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm">
            <span>Membership Expired</span>
            <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent border-amber-500/30 text-amber-600 dark:text-amber-400" onClick={() => setActiveTab('profile')}>
              Renew Plan
            </Button>
          </div>
        )}

        {activeTab === 'home' && (
          <MemberHome 
            client={activeClient} 
            onSwitchToStore={onSwitchToStore} 
            onNavigate={handleNavigate} 
            onClientLinked={(linked) => {
              setPrimaryClient(linked);
              setActiveClient(linked);
              setSelectedClientId(linked.id);
            }}
          />
        )}
        
        {activeTab === 'booking' && (
          <div className="space-y-4">
            {features.ptPackages !== false && !isStrike && (
              <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/60 gap-1">
                <button 
                  onClick={() => setBookingSubTab('pt')} 
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${bookingSubTab === 'pt' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  PT Sessions
                </button>
                <button 
                  onClick={() => setBookingSubTab('group')} 
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${bookingSubTab === 'group' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
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
            <div className="grid grid-cols-3 p-1 bg-muted/60 rounded-xl border border-border/60 gap-1">
              {profileSubTabsList.map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => setProfileSubTab(tab.id as any)}
                  className={`py-1.5 text-[11px] font-semibold rounded-lg transition-colors truncate ${profileSubTab === tab.id ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
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

      <nav className="fixed bottom-0 left-0 right-0 bg-background/90 border-t border-border/60 z-50 backdrop-blur-xl pb-safe">
        <div className="flex justify-around items-stretch max-w-md mx-auto h-16">
          {filteredNavItems.map(({ tab, label, icon }) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 flex-1 px-2 pt-1 transition-colors duration-150 ${
                  isActive ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="relative">
                  {icon}
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                  )}
                </span>
                <span className={`text-[10px] tracking-tight ${
                  isActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                }`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
