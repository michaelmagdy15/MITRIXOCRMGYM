/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useAppContext } from './context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getTenantId } from './firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Dashboard from './Dashboard';
import Leads from './Leads';
import Clients from './Clients';
import CalendarView from './Calendar';
import Payments from './Payments';
import PTPackages from './PTPackages';
import Attendance from './Attendance';
import AuditLogs from './AuditLogs';
import Tasks from './Tasks';
import Settings from './Settings';
import Login from './Login';
import Reports from './Reports';
import MemberCheckin from './MemberCheckin';
import HelpPage from './HelpPage';
import Debtors from './Debtors';
import UnconfirmedMemberships from './UnconfirmedMemberships';
import Bookings from './Bookings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Activity, Users, UserPlus, CreditCard, LogOut, Calendar as CalendarIcon, Shield, ShieldAlert, Settings as SettingsIcon, Eye, EyeOff, CheckSquare, Package, Search, Scan, History, BarChart3, LayoutDashboard, MoreHorizontal, X, Sun, Moon, Smartphone, FileText, Coffee, Menu, ChevronLeft, ChevronRight, AlertCircle, Clock, ShoppingCart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotificationCenter } from './components/NotificationCenter';
import BuildVersionFooter from './components/BuildVersionFooter';
import CoachPortal from './coach/CoachPortal';
import MemberPortal from './member/MemberPortal';
import GuestPortal from './member/GuestPortal';
import { ForcePasswordChangeDialog } from './components/ForcePasswordChangeDialog';
import { QRCodePage } from './components/QRCodePage';
import QuoteGenerator from './QuoteGenerator';
import ClubOperations from './ClubOperations';
import { CartProvider, useCart } from './member/CartContext';
import { OfflineBanner } from './components/OfflineBanner';
import Checkout from './member/Checkout';
import CommandPalette from './components/CommandPalette';
import OnboardingWizard from './OnboardingWizard';
import AdminHub from './AdminHub';
import SuperAdminHub from './SuperAdminHub';
import SubscriptionCheckout from './member/SubscriptionCheckout';
import { TenantInitScreen } from './components/TenantInitScreen';

const QUOTE_GENERATOR_EMAILS = ['magd.gallab@gmail.com', 'michaelmitry13@gmail.com'];
const PLATFORM_ADMIN_EMAILS = ['michaelmitry13@gmail.com', 'magd.gallab@gmail.com'];

function AppContent() {
  const { currentUser: authUser } = useAuth();
  const canUseQuoteGenerator = QUOTE_GENERATOR_EMAILS.includes((authUser?.email || '').toLowerCase());
  const { currentUser, logout, isAuthReady, previewRole, setPreviewRole, effectiveRole, searchQuery, setSearchQuery, branding, canAccessSettings, canViewGlobalDashboard, canDeletePayments, isManagerOrSama, features, clients, activeTab, setActiveTab, activeClientId, setActiveClientId, setPrefilledLeadData } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const { t, language, toggleLanguage, isRtl } = useLanguage();
  const [isKioskMode, setIsKioskMode] = React.useState(window.location.pathname === '/kiosk');
  const [isCheckinMode, setIsCheckinMode] = React.useState(window.location.pathname === '/checkin');
  const [isHelpMode, setIsHelpMode] = React.useState(window.location.pathname === '/help');
  const [isSubscribeMode, setIsSubscribeMode] = React.useState(window.location.pathname === '/subscribe');
  const [kioskAuthenticated, setKioskAuthenticated] = React.useState(false);
  const [pinInput, setPinInput] = React.useState('');
  const [pinError, setPinError] = React.useState(false);
  const [searchFallbackOpen, setSearchFallbackOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [showPortalOverride, setShowPortalOverride] = React.useState<'crm' | 'member' | null>(null);
  const [clientViewMode, setClientViewMode] = React.useState<'portal' | 'store'>('portal');
  const [memberPortalInitialTab, setMemberPortalInitialTab] = React.useState<string>('home');
  const { isCheckoutOpen, setIsCheckoutOpen } = useCart();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);

  // If user logs in while checkout is open, keep them in the store view so they can complete the checkout!
  React.useEffect(() => {
    if (authUser && isCheckoutOpen) {
      setClientViewMode('store');
    }
  }, [authUser, isCheckoutOpen]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isStrike = React.useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  }, [branding?.companyName]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleSearchSubmit = () => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase().trim();
    
    const matches = clients.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.phone.includes(q) || 
      (c.memberId && c.memberId.toLowerCase().includes(q)) ||
      (c.startDate && c.startDate.includes(q)) ||
      (c.membershipExpiry && c.membershipExpiry.includes(q))
    );

    if (matches.length === 1) {
      const match = matches[0];
      if (match) {
        setActiveTab('clients');
        setActiveClientId(match.id);
      }
    } else if (matches.length > 1) {
      setActiveTab('clients');
      setActiveClientId(null);
    } else {
      setSearchFallbackOpen(true);
    }
  };

  // Monitor URL changes for kiosk mode
  React.useEffect(() => {
    const handlePopState = () => {
      setIsKioskMode(window.location.pathname === '/kiosk');
      setIsCheckinMode(window.location.pathname === '/checkin');
      setIsHelpMode(window.location.pathname === '/help');
      setIsSubscribeMode(window.location.pathname === '/subscribe');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Save Expo push token if available on login / loaded from WebView
  React.useEffect(() => {
    const handlePushTokenLoaded = (e: Event) => {
      const token = (e as CustomEvent).detail || (window as any).expoPushToken;
      if (currentUser?.id && token) {
        import('./services/pushService').then(({ saveExpoPushToken }) => {
          saveExpoPushToken(currentUser.id, token, currentUser.clientDocId || currentUser.clientRecordId || undefined);
        });
      }
    };

    // 1. Check if token is already injected
    const existingToken = (window as any).expoPushToken;
    if (currentUser?.id && existingToken) {
      import('./services/pushService').then(({ saveExpoPushToken }) => {
        saveExpoPushToken(currentUser.id, existingToken, currentUser.clientDocId || currentUser.clientRecordId || undefined);
      });
    }

    // 2. Listen for future injections
    window.addEventListener('expoPushTokenLoaded', handlePushTokenLoaded);
    return () => window.removeEventListener('expoPushTokenLoaded', handlePushTokenLoaded);
  }, [currentUser?.id]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Allow entry if no PIN is configured OR the entered PIN matches
    if (!branding.kioskPin || pinInput === branding.kioskPin) {
      setKioskAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput('');
      setTimeout(() => setPinError(false), 2000);
    }
  };

  if (isSubscribeMode) {
    return <SubscriptionCheckout />;
  }

  const isSuperAdminMode = window.location.hostname.startsWith('superadmin.') || 
                           window.location.pathname === '/superadmin';

  if (isSuperAdminMode) {
    if (!currentUser) {
      return <Login isSuperAdmin={true} />;
    }
    const isPlatformAdmin = PLATFORM_ADMIN_EMAILS.includes(currentUser?.email?.toLowerCase());
    if (!isPlatformAdmin) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert className="h-16 w-16 text-rose-500 mb-4 animate-bounce" />
          <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Access Denied</h1>
          <p className="text-zinc-400 text-sm max-w-md mb-6">
            Your account ({currentUser.email}) does not have permission to access the Platform Super Admin Portal.
          </p>
          <Button onClick={logout} variant="outline" className="rounded-xl border-zinc-800 hover:bg-zinc-900 text-white">
            Log Out & Switch Accounts
          </Button>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
        <header className="border-b bg-card shadow-sm h-16 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Shield className="h-6 w-6 text-rose-500" />
            <h1 className="text-lg font-logo tracking-[0.1em] uppercase text-primary font-bold">
              {t('header.platform_portal')}
            </h1>
            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] font-bold">{t('header.super_admin')}</Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-foreground">{currentUser.name}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{currentUser.role}</p>
            </div>

            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8" title={t('common.toggle_theme')}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 text-destructive hover:bg-destructive/10" title={t('common.logout')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <SuperAdminHub />
        </main>
      </div>
    );
  }

  const isOnboardingMode = window.location.hostname.startsWith('onboarding.') || 
                           window.location.hostname.startsWith('signup.') || 
                           window.location.pathname === '/onboarding';

  if (isOnboardingMode) {
    return <OnboardingWizard />;
  }

  if (isHelpMode) {
    return <HelpPage />;
  }

  if (isKioskMode) {
    if (!kioskAuthenticated) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-white/10 bg-zinc-950 shadow-2xl">
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                ) : (
                  <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center">
                    <Scan className="h-8 w-8 text-primary" />
                  </div>
                )}
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-white">Kiosk Mode Access</CardTitle>
              <CardDescription className="text-zinc-400">Please enter the security PIN to access the attendance scanner.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePinSubmit} className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-center gap-4">
                     <Input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoFocus
                        placeholder="••••••"
                        className={`text-center text-3xl h-16 tracking-[1em] font-mono bg-zinc-900 border-zinc-800 text-white ${pinError ? 'border-destructive animate-pulse' : 'focus:border-primary'}`}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        maxLength={6}
                        autoComplete="off"
                      />
                  </div>
                  {pinError && (
                    <p className="text-center text-sm font-medium text-destructive animate-in fade-in slide-in-from-top-1">
                      Incorrect PIN. Please try again.
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full h-12 text-lg font-bold bg-white text-black hover:bg-zinc-200">
                  Unlock Kiosk
                </Button>
                <div className="text-center">
                   <Button 
                    variant="link" 
                    className="text-zinc-500 hover:text-white text-xs"
                    onClick={() => {
                        window.history.pushState({}, '', '/');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                   >
                    Return to CRM Login
                   </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex flex-col font-sans">
        <header className="border-b bg-card shadow-sm h-16 flex items-center justify-between px-6">
          <div className="flex items-center space-x-3">
             {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="h-8 w-auto" />
              ) : (
                <h1 className="text-lg font-bold tracking-tighter uppercase text-primary">
                  {branding.companyName}
                </h1>
              )}
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{t('header.kiosk_mode')}</Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setKioskAuthenticated(false)}
          >
            <LogOut className="h-4 w-4 me-2" />
            {t('common.logout')}
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-8">
           <Attendance isKiosk={true} />
        </main>
      </div>
    );
  }

  if (isCheckinMode) {
    return <MemberCheckin />;
  }

  if (!isAuthReady) {
    const companyName = branding?.companyName || 'CRM';
    const logoUrl = branding?.logoUrl;

    return (
      <div className="min-h-screen bg-[#070709] flex flex-col items-center justify-center relative overflow-hidden font-sans">
        {/* Radial light source glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--brand-accent-muted)_0%,transparent_60%)] pointer-events-none animate-[pulse_4s_infinite_ease-in-out]" />
        
        <div className="relative flex flex-col items-center z-10 scale-95 animate-[fadeIn_0.8s_ease-out_forwards]">
          <div className="relative flex items-center justify-center mb-6">
            {logoUrl ? (
              <div className="relative w-72 h-28 flex items-center justify-center">
                {/* Layer 1: Silhouette (faint outline) */}
                <img 
                  src={logoUrl} 
                  alt="Logo Silhouette" 
                  className="absolute inset-0 w-full h-full object-contain opacity-10 filter brightness-0 invert" 
                />

                {/* Layer 2: Animated mask container (glow & shine) */}
                <div 
                  className="absolute inset-0 w-full h-full filter drop-shadow-[0_0_15px_rgba(255,255,255,0.7)]"
                  style={{
                    maskImage: `url(${logoUrl})`,
                    WebkitMaskImage: `url(${logoUrl})`,
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                >
                  {/* White reveal sweep */}
                  <div 
                    className="absolute inset-0 bg-white"
                    style={{
                      maskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                      WebkitMaskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                      maskSize: '200% 100%',
                      WebkitMaskSize: '200% 100%',
                      animation: 'revealLogo 3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                    }}
                  />

                  {/* Sweeping shine */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/90 to-transparent"
                    style={{
                      backgroundSize: '200% 100%',
                      animation: 'sweepShine 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
                    }}
                  />
                </div>

                {/* Layer 3: Full color logo resolving on top */}
                <img 
                  src={logoUrl} 
                  alt={companyName} 
                  className="absolute inset-0 w-full h-full object-contain opacity-0" 
                  style={{
                    animation: 'resolveColor 3s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards'
                  }}
                />
              </div>
            ) : (
              <div className="relative text-center flex flex-col items-center mb-6">
                {/* Layer 1: Silhouette / background text */}
                <h1 className="text-5xl font-black tracking-[0.25em] text-white/10 uppercase font-sans">
                  {companyName}
                </h1>

                {/* Layer 2: White reveal sweep text */}
                <h1 
                  className="absolute inset-0 text-5xl font-black tracking-[0.25em] text-white uppercase font-sans select-none pointer-events-none filter drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                  style={{
                    maskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                    WebkitMaskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                    maskSize: '200% 100%',
                    WebkitMaskSize: '200% 100%',
                    animation: 'revealLogo 3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                  }}
                >
                  {companyName}
                </h1>

                {/* Layer 3: Sweeping shine on text */}
                <h1 
                  className="absolute inset-0 text-5xl font-black tracking-[0.25em] text-transparent uppercase font-sans select-none pointer-events-none"
                  style={{
                    backgroundImage: 'linear-gradient(to right, transparent 30%, white 50%, transparent 70%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    animation: 'sweepShine 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
                  }}
                >
                  {companyName}
                </h1>
                

              </div>
            )}
          </div>
          
          {/* Glowing loader bar */}
          <div className="h-1 w-28 bg-zinc-900 mt-10 rounded-full overflow-hidden border border-white/5 relative">
            <div className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-full animate-[slide_1.5s_infinite_ease-in-out] shadow-[0_0_10px_var(--brand-accent)]" />
          </div>
          <p className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase mt-4 font-semibold animate-pulse">Initializing CRM Portal...</p>
        </div>

        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          @keyframes fadeIn {
            0% { opacity: 0; transform: scale(0.95); filter: blur(5px); }
            100% { opacity: 1; transform: scale(1); filter: blur(0); }
          }
          @keyframes revealLogo {
            0% {
              mask-position: 100% 0;
              -webkit-mask-position: 100% 0;
            }
            60% {
              mask-position: 0% 0;
              -webkit-mask-position: 0% 0;
            }
            100% {
              mask-position: 0% 0;
              -webkit-mask-position: 0% 0;
            }
          }
          @keyframes sweepShine {
            0% {
              background-position: 200% 0;
            }
            70% {
              background-position: -200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
          @keyframes resolveColor {
            0% {
              opacity: 0;
              filter: drop-shadow(0 0 0px rgba(255,255,255,0));
            }
            40% {
              opacity: 0;
              filter: drop-shadow(0 0 0px rgba(255,255,255,0));
            }
            80% {
              opacity: 1;
              filter: drop-shadow(0 0 15px rgba(255,255,255,0.4));
            }
            100% {
              opacity: 1;
              filter: drop-shadow(0 0 10px rgba(255,255,255,0.2));
            }
          }
        `}</style>
      </div>
    );
  }

  if (!currentUser) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|mitrixogymcrmCRM/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (isMobile && features.mobileApp === true && showPortalOverride !== 'crm') {
      return (
        <MemberPortal 
          isGuest={true} 
          onSwitchToCRM={() => setShowPortalOverride('crm')} 
        />
      );
    }
    return <Login onSwitchToMemberStore={() => setShowPortalOverride('member')} />;
  }

  // Block the app until user sets a real password
  if (currentUser.mustChangePassword) {
    return <ForcePasswordChangeDialog />;
  }

  if (currentUser.role === 'coach') {
    if (isStrike) {
      return (
        <MemberPortal 
          onSwitchToStore={() => setClientViewMode('store')} 
        />
      );
    }
    return <CoachPortal />;
  }

  if (currentUser.role === 'client') {
    if (clientViewMode === 'store') {
      return (
        <GuestPortal 
          onSwitchToCRM={(tab) => {
            if (tab) setMemberPortalInitialTab(tab);
            setClientViewMode('portal');
          }} 
        />
      );
    }
    return (
      <MemberPortal 
        initialTab={memberPortalInitialTab}
        onSwitchToStore={() => {
          setMemberPortalInitialTab('home');
          setClientViewMode('store');
        }} 
      />
    );
  }

  const isPlatformAdmin = PLATFORM_ADMIN_EMAILS.includes(currentUser?.email?.toLowerCase());

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, show: true },
    {
      id: 'leads',
      label: t('nav.leads'),
      icon: UserPlus,
      show: (features.leads !== false) && (effectiveRole === 'manager' || effectiveRole === 'rep' || effectiveRole === 'admin' || effectiveRole === 'super_admin' || effectiveRole === 'crm_admin')
    },
    { id: 'clients', label: t('nav.clients'), icon: Users, show: true },
    { id: 'calendar', label: t('nav.calendar'), icon: CalendarIcon, show: true },
    {
      id: 'bookings',
      label: 'Bookings',
      icon: ShoppingCart,
      show: (effectiveRole === 'manager' || effectiveRole === 'admin' || effectiveRole === 'super_admin' || effectiveRole === 'crm_admin' || effectiveRole === 'rep')
    },
    { id: 'tasks', label: t('nav.tasks'), icon: CheckSquare, show: effectiveRole !== 'admin' },
    {
      id: 'payments',
      label: t('nav.payments'),
      icon: CreditCard,
      show: (features.payments !== false) && !!(canViewGlobalDashboard || canDeletePayments)
    },
    { id: 'attendance', label: t('nav.attendance'), icon: Scan, show: features.attendance !== false },
    {
      id: 'reports',
      label: t('nav.reports'),
      icon: BarChart3,
      show: (features.reports !== false) && !!(isManagerOrSama && currentUser.role !== 'admin')
    },
    {
      id: 'audit',
      label: t('nav.audit'),
      icon: History,
      show: !!(canAccessSettings && currentUser.role !== 'admin')
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      icon: SettingsIcon,
      show: !!(canAccessSettings && currentUser.role !== 'admin')
    },
    {
      id: 'qrcode',
      label: t('nav.qrcode'),
      icon: Smartphone,
      show: !!(canAccessSettings && currentUser.role !== 'admin' && !/mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent))
    },
    {
      id: 'quotes',
      label: t('nav.quotes'),
      icon: FileText,
      show: (features.quotes !== false) && canUseQuoteGenerator
    },
    {
      id: 'operations',
      label: t('nav.operations'),
      icon: Coffee,
      show: (features.operations !== false) && (features.juiceBar !== false || features.locker !== false) && (effectiveRole === 'manager' || effectiveRole === 'rep' || effectiveRole === 'admin' || effectiveRole === 'super_admin' || effectiveRole === 'crm_admin')
    },
    {
      id: 'admin-hub',
      label: t('nav.admin-hub'),
      icon: ShieldAlert,
      show: isManagerOrSama && effectiveRole !== 'admin'
    }
  ];

  const visibleNavItems = navItems.filter(item => item.show);

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans overflow-x-hidden">
      <OfflineBanner />
      {/* Floating Exit Preview Banner — ALWAYS visible when preview is active */}
      {previewRole && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 duration-300">
          <button
            onClick={() => setPreviewRole(null)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm rounded-full shadow-lg shadow-amber-500/30 transition-colors"
          >
            <Eye className="h-4 w-4" />
            Previewing: {previewRole.replace('_', ' ').toUpperCase()}
            <span className="mx-1">·</span>
            <X className="h-4 w-4" />
            Exit Preview
          </button>
        </div>
      )}
      <div className="flex-1 flex w-full">
        {/* Desktop Collapsible Sidebar */}
        <aside className={`hidden md:flex flex-col bg-card border-e border-border h-screen sticky top-0 z-40 sidebar-transition flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <div className="p-4 flex items-center justify-center border-b h-16 relative overflow-hidden flex-shrink-0">
            {/* Logo/Branding with transition */}
            <div 
              className={`flex items-center space-x-2 transition-all duration-300 absolute start-4 top-4 cursor-pointer hover:opacity-85 transition-opacity ${
                isSidebarCollapsed ? 'opacity-0 ltr:-translate-x-4 rtl:translate-x-4 pointer-events-none' : 'opacity-100 translate-x-0'
              }`}
              onClick={() => setActiveTab('dashboard')}
            >
              {branding.logoUrl ? (
                <img 
                  src={branding.logoUrl} 
                  alt={branding.companyName} 
                  className="h-8 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <h1 className="text-lg font-logo tracking-[0.1em] uppercase text-primary font-bold truncate max-w-[150px]">
                  {branding.companyName}
                </h1>
              )}
            </div>
            
            {/* Collapsed Logo */}
            {branding.logoUrl && (
              <div 
                className={`transition-all duration-300 absolute left-1/2 -translate-x-1/2 top-4 cursor-pointer hover:opacity-85 transition-opacity ${
                  isSidebarCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
                }`}
                onClick={() => setActiveTab('dashboard')}
              >
                <img 
                  src={branding.logoUrl} 
                  alt="Logo" 
                  className="h-8 w-8 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1.5 no-scrollbar">
            {visibleNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center rounded-lg transition-all duration-200 text-left w-full h-10 px-3 relative ${
                    isActive 
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className={`text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap ${
                    isSidebarCollapsed 
                      ? 'opacity-0 max-w-0 ms-0 pointer-events-none' 
                      : 'opacity-100 max-w-[150px] ms-3'
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-border flex flex-col gap-2 overflow-hidden flex-shrink-0">
            <div className={`flex items-center transition-all duration-300 ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-1'}`}>
              <div
                className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0 border border-primary/30 bg-primary/10 flex items-center justify-center cursor-pointer"
                onClick={() => setActiveTab('settings')}
                title="My Profile"
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-bold text-primary select-none">
                    {(currentUser.name || currentUser.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden ${
                isSidebarCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[150px] opacity-100'
              }`}>
                <p className="text-xs font-bold text-foreground truncate">{currentUser.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{currentUser.role}</p>
              </div>
            </div>
            
            <div className={`flex items-center justify-between border-t border-border/50 pt-2 transition-all duration-300 ${
              isSidebarCollapsed ? 'flex-col gap-2' : 'flex-row'
            }`}>
              <Button variant="ghost" size="icon" onClick={toggleTheme} title={t('common.toggle_theme')} className="h-8 w-8">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleSidebar} 
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title={isSidebarCollapsed ? t('common.expand_sidebar') : t('common.collapse_sidebar')}
              >
                {isSidebarCollapsed 
                  ? (isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) 
                  : (isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />)}
              </Button>
              
              <Button variant="ghost" size="icon" onClick={logout} title={t('common.logout')} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {!isSidebarCollapsed && (
              <div className="text-[10px] text-muted-foreground/40 text-center mt-1 pt-1 border-t border-border/30 animate-in fade-in duration-300">
                {t('common.made_by')}
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Left Drawer Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile Left Drawer Sidebar Panel */}
        <aside className={`fixed inset-y-0 start-0 w-72 bg-card border-e border-border z-50 md:hidden flex flex-col p-4 shadow-2xl transition-transform duration-300 transform ${isMobileSidebarOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'} pt-[calc(1.0rem+env(safe-area-inset-top))]`}>
          <div className="flex items-center justify-between mb-6 pb-4 border-b">
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:opacity-85 transition-opacity"
              onClick={() => {
                setActiveTab('dashboard');
                setIsMobileSidebarOpen(false);
              }}
            >
              {branding.logoUrl ? (
                <img 
                  src={branding.logoUrl} 
                  alt={branding.companyName} 
                  className="h-8 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <h1 className="text-lg font-logo tracking-[0.1em] uppercase text-primary font-bold">
                  {branding.companyName}
                </h1>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsMobileSidebarOpen(false)} className="h-8 w-8">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar mb-4">
            {visibleNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 rounded-lg transition-all duration-200 text-left w-full h-11 px-3 ${
                    isActive 
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-3 px-1">
              <div
                className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border border-primary/30 bg-primary/10 flex items-center justify-center"
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-sm font-bold text-primary select-none">
                    {(currentUser.name || currentUser.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{currentUser.name}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">{currentUser.role}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t mt-2">

              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={toggleTheme} className="flex-1 me-2 gap-2 h-9">
                  {theme === 'dark' ? (
                    <>
                      <Sun className="h-4 w-4" />
                      <span>{t('common.light_mode')}</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4" />
                      <span>{t('common.dark_mode')}</span>
                    </>
                  )}
                </Button>
                <Button variant="destructive" size="sm" onClick={logout} className="flex-1 ms-2 gap-2 h-9">
                  <LogOut className="h-4 w-4" />
                  <span>{t('common.logout')}</span>
                </Button>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground/40 text-center mt-1 pt-1 border-t border-border/30">
              {t('common.made_by')}
            </div>
          </div>
        </aside>

        {/* Main Content Pane */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Header */}
          <header className="border-b bg-card shadow-sm flex items-center justify-between px-6 flex-shrink-0 pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]">
            <div className="flex items-center space-x-4 flex-1">
              {/* Hamburger button on mobile */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden" 
                onClick={() => setIsMobileSidebarOpen(true)}
                title="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              
              {/* Show branding on mobile header only */}
              <div 
                className="md:hidden flex items-center space-x-2 cursor-pointer hover:opacity-85 transition-opacity"
                onClick={() => setActiveTab('dashboard')}
              >
                {branding.logoUrl ? (
                  <img 
                    src={branding.logoUrl} 
                    alt={branding.companyName} 
                    className="h-8 w-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <h1 className="text-lg font-logo tracking-[0.1em] uppercase text-primary font-bold">
                    {branding.companyName}
                  </h1>
                )}
              </div>

              {/* Desktop search bar */}
              <div className="hidden md:flex relative w-full max-w-sm">
                <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t('header.search_placeholder')}
                  className="w-full ps-9 bg-muted/50 border-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
                />
              </div>

              {/* Preview role selector (desktop only) */}
              {currentUser.role === 'crm_admin' && (
                <div className="hidden sm:flex items-center space-x-2 h-8">
                  <Select 
                    value={previewRole || "none"} 
                    onValueChange={(v) => setPreviewRole(v === "none" ? null : v as any)}
                  >
                    <SelectTrigger className={`h-8 w-[150px] text-xs ${previewRole ? 'border-amber-500 text-amber-600 font-medium' : ''}`}>
                      <div className="flex items-center">
                         {previewRole ? <Eye className="h-3.5 w-3.5 me-2" /> : <EyeOff className="h-3.5 w-3.5 me-2" />}
                         <SelectValue placeholder="Preview Role" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('header.exit_preview')}</SelectItem>
                      <SelectItem value="crm_admin">CRM Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="rep">Sales Rep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 ms-auto">


              {/* Search trigger on mobile */}
              <div className="md:hidden">
                <Button variant="ghost" size="icon" onClick={() => {
                  const searchBar = document.getElementById('mobile-search');
                  if (searchBar) searchBar.classList.toggle('hidden');
                }} title="Search">
                  <Search className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>

              {/* Notification Center */}
              <NotificationCenter />

              {/* Mobile-only avatar trigger */}
              <div className="md:hidden">
                <div
                  className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0 border-2 border-primary/30 bg-primary/10 flex items-center justify-center cursor-pointer"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  title="Open menu"
                >
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-xs font-bold text-primary select-none">
                      {(currentUser.name || currentUser.email || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Mobile search bar if toggled */}
          <div id="mobile-search" className="hidden md:hidden bg-card border-b p-2 flex-shrink-0">
            <div className="relative w-full">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t('header.search_placeholder')}
                className="w-full ps-9 bg-muted/50 border-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
              />
            </div>
          </div>

          {/* Main scrollable viewport */}
          <main className="flex-grow overflow-y-auto p-4 md:p-8">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
              <TabsContent value="dashboard" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
              <Dashboard />
            </TabsContent>

            {(currentUser.role === 'manager' || currentUser.role === 'rep' || currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'crm_admin') && (
              <TabsContent value="leads" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <Leads />
              </TabsContent>
            )}

            <TabsContent value="clients" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
              <Clients />
            </TabsContent>

            <TabsContent value="calendar" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
              <CalendarView />
            </TabsContent>

            <TabsContent value="bookings" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
              <Bookings />
            </TabsContent>

            {currentUser.role !== 'admin' && (
              <TabsContent value="tasks" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <Tasks />
              </TabsContent>
            )}

            {(canViewGlobalDashboard || canDeletePayments) && (
              <TabsContent value="payments" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <Payments />
              </TabsContent>
            )}

            <TabsContent value="attendance" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
              <Attendance />
            </TabsContent>

            {features.debtors === true && (
              <TabsContent value="debtors" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <Debtors />
              </TabsContent>
            )}

            {features.unconfirmedMemberships === true && (
              <TabsContent value="unconfirmed-memberships" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <UnconfirmedMemberships />
              </TabsContent>
            )}

            {isManagerOrSama && (
              <TabsContent value="reports" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <Reports />
              </TabsContent>
            )}

            {canAccessSettings && (
              <>
                <TabsContent value="audit" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                  <AuditLogs />
                </TabsContent>
                <TabsContent value="settings" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                  <Settings />
                </TabsContent>
                {!/mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent) && (
                  <TabsContent value="qrcode" className="m-0 animate-in fade-in-50 duration-300 p-4 focus-visible:outline-none">
                    <QRCodePage />
                  </TabsContent>
                )}
              </>
            )}

            {canUseQuoteGenerator && (
              <TabsContent value="quotes" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <QuoteGenerator />
              </TabsContent>
            )}

            {(currentUser.role === 'manager' || currentUser.role === 'rep' || currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'crm_admin') && (
              <TabsContent value="operations" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <ClubOperations />
              </TabsContent>
            )}

            {isPlatformAdmin && (
              <TabsContent value="admin-hub" className="m-0 animate-in fade-in-50 duration-300 focus-visible:outline-none">
                <AdminHub />
              </TabsContent>
            )}

            </Tabs>
          </main>
        </div>
      </div>

      {/* Global Search Fallback Dialog */}
      <Dialog open={searchFallbackOpen} onOpenChange={setSearchFallbackOpen}>
        <DialogContent className="sm:max-w-md border-border/80 bg-card backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Member Not Found
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              No member or lead was found matching "{searchQuery}". Would you like to create a new lead with this information?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => setSearchFallbackOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => {
                const isNumeric = /^\d+$/.test(searchQuery.trim());
                setPrefilledLeadData({
                  name: isNumeric ? '' : searchQuery.trim(),
                  phone: isNumeric ? searchQuery.trim() : ''
                });
                setActiveTab('leads');
                setSearchFallbackOpen(false);
              }}
            >
              Add New Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Checkout open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen} />
      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
    </div>
  );
}

/** Bridges auth state into SettingsProvider so private collections only subscribe when logged in */
function AuthAwareSettingsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAuthReady } = useAuth();
  return (
    <SettingsProvider 
      isAuthenticated={isAuthReady && currentUser != null}
      role={currentUser?.role}
    >
      {children}
    </SettingsProvider>
  );
}

/**
 * Reads isAuthReady from AuthContext and passes it to TenantInitScreen.
 * Must live inside <AuthProvider> so useAuth() is available.
 */
function TenantInitWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthReady } = useAuth();
  return (
    <TenantInitScreen ready={isAuthReady}>
      {children}
    </TenantInitScreen>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AuthAwareSettingsProvider>
            <AppProvider>
              <ThemeProvider>
                <LanguageProvider>
                  <CartProvider>
                    <TenantInitWrapper>
                      <OfflineBanner />
                      <AppContent />
                      <BuildVersionFooter />
                      <Toaster richColors position="top-right" />
                    </TenantInitWrapper>
                  </CartProvider>
                </LanguageProvider>
              </ThemeProvider>
            </AppProvider>
          </AuthAwareSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
