import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Lock, Globe, UserPlus, User, LogOut, Sun, Moon, Calendar, Users, History, TrendingUp, Package, ShoppingBag, Bell, Coins, AlertCircle, Activity, Dumbbell } from 'lucide-react';
import { auth, db, getTenantId } from '../firebase';
import { collection, query, where, doc, documentId, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Client } from '../types';
import { normalizeEgyptPhone, getEgyptPhoneVariants } from '../utils/phoneUtils';

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
import MemberNutrition from './MemberNutrition';
import GuestPortal from './GuestPortal';
import CartDrawer from './CartDrawer';
import MemberNotificationBell from './MemberNotificationBell';
import MemberWallet from './MemberWallet';
import MemberBadges from './MemberBadges';
import MemberRewards from './MemberRewards';
import MemberBodyTracker from './MemberBodyTracker';
import ExerciseLibraryHub from '../components/ExerciseLibraryHub';
import { MemberScreenSkeleton } from './components/Skeleton';


type MemberTab = 'home' | 'booking' | 'workouts' | 'juicebar' | 'wallet' | 'locker' | 'invites' | 'nutrition' | 'profile';

const NAV_ITEMS: { tab: MemberTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'home',     label: 'Pass',       icon: <QrCode className="h-5 w-5" /> },
  { tab: 'booking',  label: 'Bookings',   icon: <Calendar className="h-5 w-5" /> },
  { tab: 'workouts', label: 'Workouts',   icon: <Dumbbell className="h-5 w-5" /> },
  { tab: 'juicebar', label: 'Juice Bar',  icon: <Globe className="h-5 w-5" /> },
  { tab: 'wallet',   label: 'Wallet',     icon: <Coins className="h-5 w-5" /> },
  { tab: 'locker',   label: 'Locker',     icon: <Lock className="h-5 w-5" /> },
  { tab: 'invites',  label: 'Invites',    icon: <UserPlus className="h-5 w-5" /> },
  { tab: 'nutrition', label: 'Nutrition', icon: <Activity className="h-5 w-5" /> },
  { tab: 'profile',  label: 'Profile',    icon: <User className="h-5 w-5" /> },
];

interface MemberPortalProps {
  isGuest?: boolean;
  onSwitchToCRM?: (tab?: string) => void;
  onSwitchToStore?: (packageId?: string) => void;
  initialTab?: string;
}

const getClientTierBadge = (client?: Client | null): string => {
  if (!client) return 'Adult';
  const packages: any[] = Array.isArray(client.packages) ? client.packages : [];
  const activePackage = packages.find((pkg) => {
    const status = String(pkg?.status || '').toLowerCase();
    return status !== 'expired' && status !== 'inactive' && status !== 'cancelled';
  }) || packages[0];
  const raw = [
    activePackage?.tier,
    activePackage?.category,
    activePackage?.type,
    activePackage?.name,
    activePackage?.packageName,
    client.packageType,
    (client as any).memberCategory,
    (client as any).category
  ].filter(Boolean).join(' ').toLowerCase();

  if (raw.includes('kids pro') || raw.includes('kid pro')) return 'Kids Pro';
  if (raw.includes('junior')) return 'Juniors';
  if (raw.includes('kid')) return 'Kids';
  return 'Adult';
};

const formatSwitcherLabel = (client: Client, primaryClient?: Client | null): string => {
  const memberId = client.memberId ? ` #${client.memberId}` : '';
  const you = primaryClient && client.id === primaryClient.id ? ' (You)' : '';
  return `${client.name}${memberId} - ${getClientTierBadge(client)}${you}`;
};

export default function MemberPortal({ isGuest = false, onSwitchToCRM, onSwitchToStore, initialTab }: MemberPortalProps = {}) {
  const { currentUser, logout } = useAuth();
  const { branding, features } = useSettings();
  const { theme, toggleTheme, themeLocked } = useTheme();
  const { language, toggleLanguage, isRtl } = useLanguage();

  const isStrike = useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  }, [branding?.companyName]);

  const isInzan = useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('inzan') || (branding?.companyName || '').toLowerCase().includes('inzan');
  }, [branding?.companyName]);

  const isMobile = useMemo(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|mitrixogymcrmCRM-Mobile|Strike.*Mobile|Inzan.*Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);
  
  const filteredNavItems = useMemo(() => {
    const arLabels: Record<MemberTab, string> = {
      home: 'بطاقتي',
      booking: 'الحجوزات',
      workouts: 'التمارين',
      juicebar: 'الكافيتريا',
      wallet: 'المحفظة',
      locker: 'الخزنة',
      invites: 'الدعوات',
      nutrition: 'التغذية',
      profile: 'حسابي',
    };
    return NAV_ITEMS.filter((item) => {
      if (item.tab === 'home' && features.qrCheckin === false) return false;
      if (item.tab === 'workouts' && features.workoutLibrary === false) return false;
      if (item.tab === 'juicebar') {
        if (isStrike && isMobile && features.juiceBar !== true) return false;
        if (features.juiceBar === false) return false;
      }
      if (item.tab === 'locker') {
        const smartLockersOn = features.inzanSmartLockers !== undefined ? features.inzanSmartLockers : isInzan;
        if (features.locker === false && !smartLockersOn) return false;
      }
      if (item.tab === 'wallet' && features.wallet === false) return false;
      if (item.tab === 'invites' && (features.operations === false || features.guestInvites === false)) return false;
      if (item.tab === 'nutrition') {
        const nutritionOn = features.nutrition !== undefined ? features.nutrition : isInzan;
        if (!nutritionOn) return false;
      }
      return true;
    }).map(item => {
      if (language === 'ar') {
        return { ...item, label: arLabels[item.tab] || item.label };
      }
      if (item.tab === 'home' && isStrike && isMobile) {
        return { ...item, label: 'Home Screen' };
      }
      return item;
    });
  }, [features, isStrike, isInzan, isMobile, language]);

  const [activeTab, setActiveTab] = useState<MemberTab>((initialTab as MemberTab) || 'home');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as MemberTab);
    }
  }, [initialTab]);

  useEffect(() => {
    (window as any).__dismissMobileSplash?.();
  }, []);

  const [primaryClient, setPrimaryClient] = useState<Client | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [linkedClients, setLinkedClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Booking and Profile Sub-tabs state (default to group classes schedule, or PT if member has PT package)
  const [bookingSubTab, setBookingSubTab] = useState<'pt' | 'group'>('group');

  useEffect(() => {
    if (activeClient) {
      const packages: any[] = Array.isArray(activeClient.packages) ? activeClient.packages : [];
      const hasActivePt = packages.some(p => {
        const pStatus = (p.status || '').toLowerCase();
        if (pStatus === 'expired' || pStatus === 'inactive' || pStatus === 'cancelled') return false;
        return p.type === 'pt' || p.isPT === true || 
          (p.name || '').toLowerCase().includes('pt') || 
          (p.packageName || '').toLowerCase().includes('pt') ||
          (p.name || '').toLowerCase().includes('private') || 
          (p.packageName || '').toLowerCase().includes('private');
      });
      const hasActiveClass = packages.some(p => {
        const pStatus = (p.status || '').toLowerCase();
        if (pStatus === 'expired' || pStatus === 'inactive' || pStatus === 'cancelled') return false;
        const isPt = p.type === 'pt' || p.isPT === true || 
          (p.name || '').toLowerCase().includes('pt') || 
          (p.packageName || '').toLowerCase().includes('pt') ||
          (p.name || '').toLowerCase().includes('private') || 
          (p.packageName || '').toLowerCase().includes('private');
        return !isPt;
      });

      if (hasActivePt && !hasActiveClass) {
        setBookingSubTab('pt');
      }
    }
  }, [activeClient]);
  
  const profileSubTabsList = useMemo(() => {
    const list = [
      { id: 'settings', label: language === 'ar' ? 'الإعدادات' : 'Settings' },
      { id: 'progress', label: language === 'ar' ? 'التقدم و InBody' : 'Progress', pointSystemRequired: true },
      { id: 'membership', label: language === 'ar' ? 'العضوية' : 'Membership' },
      { id: 'attendance', label: language === 'ar' ? 'الحضور' : 'History' },
      { id: 'badges', label: language === 'ar' ? 'الأوسمة' : 'Badges', pointSystemRequired: true },
      { id: 'rewards', label: language === 'ar' ? 'المكافآت' : 'Rewards', pointSystemRequired: true },
    ];
    return list.filter(tab => !tab.pointSystemRequired || features.pointsSystem !== false);
  }, [features.pointsSystem, language]);

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

  // Navigation handler for quick shortcuts from MemberHome and MemberProfile
  const handleNavigate = (target: string) => {
    const isPendingOnboarding = String(activeClient?.status || '').toUpperCase() === 'PENDING_ONBOARDING';
    if (isPendingOnboarding && target.startsWith('booking')) {
      setActiveTab('home');
      return;
    }

    if (target === 'booking') {
      setActiveTab('booking');
      const packages: any[] = Array.isArray(activeClient?.packages) ? activeClient!.packages : [];
      const pkgType = (activeClient?.packageType || '').toLowerCase();
      const hasPt = pkgType.includes('pt') || pkgType.includes('private') || 
        packages.some(p => (p.packageName || '').toLowerCase().includes('pt') || p.type === 'pt' || (p.name || '').toLowerCase().includes('pt'));
      if (hasPt) {
        setBookingSubTab('pt');
      }
    } else if (target === 'booking-pt') {
      setActiveTab('booking');
      setBookingSubTab('pt');
    } else if (target === 'booking-group') {
      setActiveTab('booking');
      setBookingSubTab('group');
    } else if (target === 'profile') setActiveTab('profile');
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
    } else if (target === 'profile-settings' || target === 'profile-photo') {
      setActiveTab('profile');
      setProfileSubTab('settings');
    } else if (target === 'packages' || target === 'store' || target === 'renew') {
      if (onSwitchToStore) {
        onSwitchToStore();
      } else {
        setActiveTab('profile');
        setProfileSubTab('membership');
      }
    } else if (target === 'juicebar') {
      if (features.juiceBar !== false) setActiveTab('juicebar');
    } else if (target === 'wallet') {
      if (features.wallet !== false) setActiveTab('wallet');
    } else if (target === 'locker') {
      if (features.locker !== false || isInzan) setActiveTab('locker');
    } else if (target === 'invites') {
      if (features.operations !== false) setActiveTab('invites');
    } else if (target === 'nutrition') {
      if (features.nutrition !== false || isInzan) setActiveTab('nutrition');
    } else if (target === 'workouts') {
      setActiveTab('workouts');
    }
  };

  // Listen for deep link URL query params and custom navigation events
  useEffect(() => {
    const handleUrlAndParams = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get('tab');
        const urlSubTab = params.get('subtab');
        const urlAction = params.get('action');

        if (urlAction === 'upload_photo') {
          setActiveTab('profile');
          setProfileSubTab('settings');
          setTimeout(() => {
            const input = document.getElementById('member-photo-upload');
            input?.click();
          }, 350);
          return;
        }

        if (urlTab) {
          handleNavigate(urlSubTab ? `${urlTab}-${urlSubTab}` : urlTab);
        }
      } catch (err) {
        console.warn('[MemberPortal] Error parsing URL params:', err);
      }
    };

    handleUrlAndParams();

    const onCustomNav = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (typeof detail === 'string') {
        handleNavigate(detail);
      } else if (typeof detail === 'object') {
        const { tab, subtab, action } = detail;
        if (action === 'upload_photo') {
          setActiveTab('profile');
          setProfileSubTab('settings');
          setTimeout(() => {
            const input = document.getElementById('member-photo-upload');
            input?.click();
          }, 350);
        } else if (action === 'renew') {
          if (onSwitchToStore) {
            onSwitchToStore();
          } else {
            setActiveTab('profile');
            setProfileSubTab('membership');
          }
        } else if (tab) {
          handleNavigate(subtab ? `${tab}-${subtab}` : tab);
        }
      }
    };

    window.addEventListener('member:navigate-tab', onCustomNav);
    window.addEventListener('popstate', handleUrlAndParams);

    return () => {
      window.removeEventListener('member:navigate-tab', onCustomNav);
      window.removeEventListener('popstate', handleUrlAndParams);
    };
  }, [onSwitchToStore]);

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

        // Option C: Match by Phone Number
        const userPhone = currentUser?.phone || '';
        if (userPhone) {
          const normPhone = normalizeEgyptPhone(userPhone);
          if (normPhone) {
            try {
              const normQ = query(collection(db, 'clients'), where('normalized_phone', '==', normPhone));
              const normSnap = await getDocs(normQ);
              if (!normSnap.empty && normSnap.docs[0] && active) {
                const docSnap = normSnap.docs[0];
                const pClient = { ...docSnap.data(), id: docSnap.id } as Client;
                setPrimaryClient(pClient);
                setActiveClient(pClient);
                setSelectedClientId(prev => prev || pClient.id);
                setLoading(false);
                return;
              }
            } catch {}
          }

          const cleanPhone = userPhone.replace(/\D/g, '').slice(-9);
          if (cleanPhone) {
            // Try exact Firestore where query first (cheap, indexed)
            try {
              const phoneQ = query(collection(db, 'clients'), where('phone', '==', userPhone));
              const phoneSnap = await getDocs(phoneQ);
              if (!phoneSnap.empty && phoneSnap.docs[0] && active) {
                const docSnap = phoneSnap.docs[0];
                const pClient = { ...docSnap.data(), id: docSnap.id } as Client;
                setPrimaryClient(pClient);
                setActiveClient(pClient);
                setSelectedClientId(prev => prev || pClient.id);
                setLoading(false);
                return;
              }
            } catch {
              // where('phone') may fail if no index exists; fall through to fallback
            }

            // Fallback: limited scan over active statuses only (not full collection)
            console.warn("Performance warning: phone-based client lookup falling back to filtered scan");
            try {
              const limitedQ = query(
                collection(db, 'clients'),
                where('status', 'in', ['Active', 'Nearly Expired', 'Expired', 'Hold'])
              );
              const limitedSnap = await getDocs(limitedQ);
              const matched = limitedSnap.docs.find(d => {
                const cPhone = String(d.data().phone || '').replace(/\D/g, '').slice(-9);
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
            } catch {
              // status-based query also failed; skip this option
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
      if ((err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) && !auth.currentUser) {
        return;
      }
      console.warn("Could not listen to active client record:", err.code || err.message);
    });

    return () => unsub();
  }, [selectedClientId]);

  // 3. Fetch linked clients (family members sharing phone, parentId, or linkedClientIds)
  useEffect(() => {
    if (!primaryClient) {
      setLinkedClients([]);
      return;
    }

    const parentPhone = primaryClient.phone || (primaryClient as any).parentPhone;
    const parentId = (primaryClient as any).parentId;
    const linkedIds = primaryClient.linkedClientIds || [];

    const loadSiblings = async () => {
      const siblingsMap = new Map<string, Client>();

      // A. Load by linkedClientIds
      if (linkedIds.length > 0) {
        try {
          const q = query(
            collection(db, 'clients'),
            where(documentId(), 'in', linkedIds.slice(0, 10))
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            if (d.id !== primaryClient.id) {
              siblingsMap.set(d.id, { ...d.data(), id: d.id } as Client);
            }
          });
        } catch {}
      }

      // B. Load siblings sharing the same parentId
      if (parentId) {
        try {
          const qParent = query(
            collection(db, 'clients'),
            where('parentId', '==', parentId)
          );
          const snap = await getDocs(qParent);
          snap.docs.forEach(d => {
            if (d.id !== primaryClient.id) {
              siblingsMap.set(d.id, { ...d.data(), id: d.id } as Client);
            }
          });
        } catch {}
      }

      // C. Load siblings sharing the same phone (using normalized phone & variants)
      if (parentPhone) {
        try {
          const norm = normalizeEgyptPhone(parentPhone);
          const variants = getEgyptPhoneVariants(parentPhone);

          if (norm) {
            const qNorm = query(
              collection(db, 'clients'),
              where('normalized_phone', '==', norm)
            );
            const snapNorm = await getDocs(qNorm);
            snapNorm.docs.forEach(d => {
              if (d.id !== primaryClient.id) {
                siblingsMap.set(d.id, { ...d.data(), id: d.id } as Client);
              }
            });
          }

          if (variants.length > 0) {
            const qPhone = query(
              collection(db, 'clients'),
              where('phone', 'in', variants.slice(0, 10))
            );
            const snap = await getDocs(qPhone);
            snap.docs.forEach(d => {
              if (d.id !== primaryClient.id) {
                siblingsMap.set(d.id, { ...d.data(), id: d.id } as Client);
              }
            });
          }
        } catch (phoneErr) {
          console.warn("Could not query siblings by phone variants:", phoneErr);
        }
      }

      setLinkedClients(Array.from(siblingsMap.values()));
    };

    loadSiblings().catch(err => console.warn("Could not load family siblings:", err));
  }, [primaryClient?.id, primaryClient?.phone, primaryClient?.linkedClientIds, (primaryClient as any)?.parentId]);

  // Member app presence heartbeat for admin live-member visibility.
  useEffect(() => {
    if (isGuest || !activeClient?.id || !currentUser?.id) return;

    const presenceRef = doc(db, 'memberPresence', activeClient.id);
    const writePresence = async (online: boolean = true) => {
      try {
        const now = new Date().toISOString();
        await setDoc(presenceRef, {
          clientId: activeClient.id,
          userId: currentUser.id,
          memberName: activeClient.name || currentUser.name || 'Member',
          memberId: activeClient.memberId || '',
          phone: activeClient.phone || currentUser.phone || '',
          status: activeClient.status || '',
          online,
          appSurface: 'member_portal',
          userAgent: navigator.userAgent,
          lastSeen: now,
          updatedAt: now,
        }, { merge: true });
      } catch (err) {
        console.warn('[MemberPresence] Failed to update member presence:', err);
      }
    };

    writePresence(true);
    const interval = window.setInterval(() => writePresence(true), 60_000);
    const handleVisibility = () => {
      writePresence(document.visibilityState === 'visible');
    };
    const handleBeforeUnload = () => {
      writePresence(false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      writePresence(false);
    };
  }, [activeClient?.id, activeClient?.name, activeClient?.memberId, activeClient?.phone, activeClient?.status, currentUser?.id]);

  const isPendingOnboarding = String(activeClient?.status || primaryClient?.status || '').toUpperCase() === 'PENDING_ONBOARDING';
  const visibleNavItems = isPendingOnboarding
    ? filteredNavItems.filter(item => item.tab !== 'booking')
    : filteredNavItems;

  useEffect(() => {
    if (isPendingOnboarding && activeTab === 'booking') {
      setActiveTab('home');
    }
  }, [isPendingOnboarding, activeTab]);

  if (isGuest) {
    return <GuestPortal onSwitchToCRM={onSwitchToCRM || (() => {})} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-[calc(3.75rem+var(--safe-top))] pt-[var(--safe-top)]" />
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
    <div dir={isRtl ? 'rtl' : 'ltr'} className="h-screen overflow-hidden bg-background flex flex-col font-sans relative">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl min-h-[calc(3.75rem+var(--safe-top))] pt-[var(--safe-top)] flex items-center justify-between px-3 sm:px-6 sticky top-0 z-50">
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
            {language === 'ar' ? 'عضو' : 'Member'}
          </Badge>
        </div>

        {/* Profile Switcher dropdown next to theme toggle (only if other family members exist) */}
        <div className="flex items-center gap-1.5">
          {primaryClient && linkedClients.filter(c => c.id !== primaryClient.id).length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select
                value={selectedClientId}
                onValueChange={(val) => {
                  const next = [primaryClient, ...linkedClients].find(c => c?.id === val);
                  if (next) setActiveClient(next);
                  setSelectedClientId(val || '');
                }}
              >
                <SelectTrigger className="h-8 text-[11px] font-semibold bg-background border-border max-w-[140px] truncate px-2.5">
                  <span className="truncate">
                    {activeClient 
                      ? formatSwitcherLabel(activeClient, primaryClient)
                      : formatSwitcherLabel(primaryClient, primaryClient)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={primaryClient.id}>
                    {formatSwitcherLabel(primaryClient, primaryClient)}
                  </SelectItem>
                  {linkedClients
                    .filter(c => c.id !== primaryClient.id)
                    .map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {formatSwitcherLabel(c, primaryClient)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            title={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            className="h-7 px-2 text-[11px] font-bold border-border/70 text-foreground"
          >
            {language === 'ar' ? 'EN' : 'عربي'}
          </Button>

          <MemberNotificationBell clientId={activeClient?.id} onNavigate={handleNavigate} />

          <CartDrawer />

          <Button variant="ghost" size="icon" onClick={toggleTheme} disabled={themeLocked} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto px-4 py-5 pb-[calc(6.5rem+var(--safe-bottom))] mx-auto w-full overscroll-contain ${activeTab === 'workouts' ? 'max-w-5xl' : 'max-w-md'}`}>
        {activeClient?.status === 'Expired' && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>Membership Expired</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs bg-rose-500 text-white hover:bg-rose-600 border-none font-bold"
              onClick={() => {
                if (onSwitchToStore) {
                  onSwitchToStore();
                } else {
                  handleNavigate('profile-membership');
                }
              }}
            >
              Renew Plan
            </Button>
          </div>
        )}

        {activeClient?.status !== 'Expired' && activeClient?.membershipExpiry && (() => {
          try {
            const diff = differenceInCalendarDays(parseISO(activeClient.membershipExpiry), new Date());
            if (diff >= 0 && diff <= 7) {
              return (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Membership expires {diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff} days`}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-amber-500 text-white hover:bg-amber-600 border-none font-bold"
                    onClick={() => {
                      if (onSwitchToStore) {
                        onSwitchToStore();
                      } else {
                        handleNavigate('profile-membership');
                      }
                    }}
                  >
                    Renew Plan
                  </Button>
                </div>
              );
            }
          } catch {}
          return null;
        })()}

        {activeTab === 'home' && (
          <MemberHome 
            client={activeClient} 
            linkedClients={linkedClients}
            onSelectClient={(c) => {
              setActiveClient(c);
              setSelectedClientId(c.id);
            }}
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
            {features.ptPackages !== false && (
              <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/60 gap-1">
                <button 
                  onClick={() => setBookingSubTab('group')} 
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    bookingSubTab === 'group' 
                      ? 'bg-background text-foreground shadow-xs' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Dumbbell className="h-3.5 w-3.5" />
                  Group Classes
                </button>
                <button 
                  onClick={() => setBookingSubTab('pt')} 
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    bookingSubTab === 'pt' 
                      ? 'bg-background text-foreground shadow-xs' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  1-on-1 PT Sessions
                </button>
              </div>
            )}
            {bookingSubTab === 'pt' && features.ptPackages !== false ? (
              <MemberSessions client={activeClient} onSwitchToStore={onSwitchToStore} />
            ) : (
              <MemberClasses client={activeClient} onSwitchToStore={onSwitchToStore} />
            )}
          </div>
        )}

        {activeTab === 'workouts' && <ExerciseLibraryHub mode="member" memberClient={activeClient} />}
        {activeTab === 'juicebar' && <MemberJuiceBar client={activeClient} />}
        {activeTab === 'wallet' && <MemberWallet client={activeClient} />}
        {activeTab === 'locker' && <MemberLocker client={activeClient} />}
        {activeTab === 'invites' && <MemberInvites client={activeClient} />}
        {activeTab === 'nutrition' && <MemberNutrition client={activeClient} />}
        
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

            {profileSubTab === 'settings' && <MemberProfile client={activeClient} onNavigate={handleNavigate} />}
            {profileSubTab === 'progress' && (
              <div className="space-y-6">
                <MemberProgress client={activeClient} />
                <MemberBodyTracker client={activeClient} />
              </div>
            )}
            {profileSubTab === 'membership' && (
              <div className="space-y-6 animate-in fade-in">
                <MemberPackages 
                  client={activeClient} 
                  onSwitchToStore={onSwitchToStore} 
                  onBookSession={(pkg) => {
                    const isPt = pkg?.type === 'pt' || 
                      (pkg?.name || '').toLowerCase().includes('pt') || 
                      (pkg?.packageName || '').toLowerCase().includes('pt') ||
                      (pkg?.name || '').toLowerCase().includes('private') || 
                      (pkg?.packageName || '').toLowerCase().includes('private');
                    setBookingSubTab(isPt ? 'pt' : 'group');
                    setActiveTab('booking');
                  }}
                />
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
        {primaryClient && linkedClients.filter(c => c.id !== primaryClient.id).length > 0 && (
          <div className="max-w-md mx-auto px-3 pt-2">
            <Select
              value={selectedClientId}
              onValueChange={(val) => {
                const next = [primaryClient, ...linkedClients].find(c => c?.id === val);
                if (next) setActiveClient(next);
                setSelectedClientId(val || '');
              }}
            >
              <SelectTrigger className="h-9 w-full bg-card border-border text-xs font-semibold">
                <Users className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Switch family profile" />
              </SelectTrigger>
              <SelectContent>
                {[primaryClient, ...linkedClients].filter(Boolean).map(c => (
                  <SelectItem key={c!.id} value={c!.id}>
                    {formatSwitcherLabel(c!, primaryClient)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isPendingOnboarding && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-semibold shadow-sm">
            Your account is pending activation. Visit the front desk to complete registration.
          </div>
        )}
        <div className="flex justify-around items-stretch max-w-md mx-auto h-16">
          {visibleNavItems.map(({ tab, label, icon }) => {
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
