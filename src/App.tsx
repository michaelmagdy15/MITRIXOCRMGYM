/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useAppContext } from './context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import Leads from './Leads';
import Clients from './Clients';
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
import { Activity, Users, UserPlus, CreditCard, LogOut, Calendar as CalendarIcon, ShieldAlert, Settings as SettingsIcon, Eye, EyeOff, CheckSquare, Package, Search, Scan, History, BarChart3, LayoutDashboard, MoreHorizontal, X, Sun, Moon, Smartphone, FileText, Coffee, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
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
import Checkout from './member/Checkout';

const QUOTE_GENERATOR_EMAILS = ['magd.gallab@gmail.com', 'michaelmitry13@gmail.com'];

function AppContent() {
  const { currentUser: authUser } = useAuth();
  const canUseQuoteGenerator = QUOTE_GENERATOR_EMAILS.includes((authUser?.email || '').toLowerCase());
  const { currentUser, logout, isAuthReady, previewRole, setPreviewRole, searchQuery, setSearchQuery, branding, canAccessSettings, canViewGlobalDashboard, canDeletePayments, isManagerOrSama } = useAppContext();
  const { theme, toggleTheme } = useTheme();
  const [isKioskMode, setIsKioskMode] = React.useState(window.location.pathname === '/kiosk');
  const [isCheckinMode, setIsCheckinMode] = React.useState(window.location.pathname === '/checkin');
  const [isHelpMode, setIsHelpMode] = React.useState(window.location.pathname === '/help');
  const [kioskAuthenticated, setKioskAuthenticated] = React.useState(false);
  const [pinInput, setPinInput] = React.useState('');
  const [pinError, setPinError] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [showPortalOverride, setShowPortalOverride] = React.useState<'crm' | 'member' | null>(null);
  const [clientViewMode, setClientViewMode] = React.useState<'portal' | 'store'>('portal');
  const { isCheckoutOpen, setIsCheckoutOpen } = useCart();

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  // Monitor URL changes for kiosk mode
  React.useEffect(() => {
    const handlePopState = () => {
      setIsKioskMode(window.location.pathname === '/kiosk');
      setIsCheckinMode(window.location.pathname === '/checkin');
      setIsHelpMode(window.location.pathname === '/help');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">KIOSK MODE</Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setKioskAuthenticated(false)}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Lock
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUser) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|mitrixogymcrmCRM/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (isMobile && showPortalOverride !== 'crm') {
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
    return <CoachPortal />;
  }

  if (currentUser.role === 'client') {
    if (clientViewMode === 'store') {
      return (
        <GuestPortal 
          onSwitchToCRM={() => setClientViewMode('portal')} 
        />
      );
    }
    return (
      <MemberPortal 
        onSwitchToStore={() => setClientViewMode('store')} 
      />
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    {
      id: 'leads',
      label: 'Leads',
      icon: UserPlus,
      show: currentUser.role === 'manager' || currentUser.role === 'rep' || currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'crm_admin'
    },
    { id: 'clients', label: 'Members', icon: Users, show: true },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, show: currentUser.role !== 'admin' },
    {
      id: 'payments',
      label: 'Payments',
      icon: CreditCard,
      show: !!(canViewGlobalDashboard || canDeletePayments)
    },
    { id: 'attendance', label: 'Attendance', icon: Scan, show: true },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      show: !!(isManagerOrSama && currentUser.role !== 'admin')
    },
    {
      id: 'audit',
      label: 'History',
      icon: History,
      show: !!(canAccessSettings && currentUser.role !== 'admin')
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: SettingsIcon,
      show: !!(canAccessSettings && currentUser.role !== 'admin')
    },
    {
      id: 'qrcode',
      label: 'App QR',
      icon: Smartphone,
      show: !!(canAccessSettings && currentUser.role !== 'admin' && !/mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent))
    },
    {
      id: 'quotes',
      label: 'Quotes',
      icon: FileText,
      show: canUseQuoteGenerator
    },
    {
      id: 'operations',
      label: 'Operations',
      icon: Coffee,
      show: currentUser.role === 'manager' || currentUser.role === 'rep' || currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'crm_admin'
    }
  ];

  const visibleNavItems = navItems.filter(item => item.show);

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans overflow-x-hidden">
      <div className="flex-1 flex w-full">
        {/* Desktop Collapsible Sidebar */}
        <aside className={`hidden md:flex flex-col bg-card border-r border-border h-screen sticky top-0 z-40 sidebar-transition flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <div className="p-4 flex items-center justify-center border-b h-16 relative overflow-hidden flex-shrink-0">
            {/* Logo/Branding with transition */}
            <div className={`flex items-center space-x-2 transition-all duration-300 absolute left-4 top-4 ${
              isSidebarCollapsed ? 'opacity-0 -translate-x-4 pointer-events-none' : 'opacity-100 translate-x-0'
            }`}>
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
              <div className={`transition-all duration-300 absolute left-1/2 -translate-x-1/2 top-4 ${
                isSidebarCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
              }`}>
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
                      ? 'opacity-0 max-w-0 ml-0 pointer-events-none' 
                      : 'opacity-100 max-w-[150px] ml-3'
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
              <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle dark mode" className="h-8 w-8">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleSidebar} 
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
              
              <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {!isSidebarCollapsed && (
              <div className="text-[10px] text-muted-foreground/40 text-center mt-1 pt-1 border-t border-border/30 animate-in fade-in duration-300">
                Made & managed by <a href="https://mitrixo.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground font-medium underline underline-offset-2 decoration-muted-foreground/20 hover:decoration-foreground transition-colors">mitrixo.com systems</a>
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
        <aside className={`fixed inset-y-0 left-0 w-72 bg-card border-r border-border z-50 md:hidden flex flex-col p-4 shadow-2xl transition-transform duration-300 transform ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between mb-6 pb-4 border-b">
            <div className="flex items-center space-x-2">
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
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" onClick={toggleTheme} className="flex-1 mr-2 gap-2 h-9">
                {theme === 'dark' ? (
                  <>
                    <Sun className="h-4 w-4" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4" />
                    <span>Dark Mode</span>
                  </>
                )}
              </Button>
              <Button variant="destructive" size="sm" onClick={logout} className="flex-1 ml-2 gap-2 h-9">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>

            <div className="text-[10px] text-muted-foreground/40 text-center mt-1 pt-1 border-t border-border/30">
              Made & managed by <a href="https://mitrixo.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground font-medium underline underline-offset-2 decoration-muted-foreground/20 hover:decoration-foreground transition-colors">mitrixo.com systems</a>
            </div>
          </div>
        </aside>

        {/* Main Content Pane */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Header */}
          <header className="border-b bg-card shadow-sm h-16 flex items-center justify-between px-6 flex-shrink-0">
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
              <div className="md:hidden flex items-center space-x-2">
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
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by name, phone, or ID..."
                  className="w-full pl-9 bg-muted/50 border-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                         {previewRole ? <Eye className="h-3.5 w-3.5 mr-2" /> : <EyeOff className="h-3.5 w-3.5 mr-2" />}
                         <SelectValue placeholder="Preview Role" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Exit Preview</SelectItem>
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

            <div className="flex items-center space-x-2 sm:space-x-4 ml-auto">
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
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name, phone, or ID..."
                className="w-full pl-9 bg-muted/50 border-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            </Tabs>
          </main>
        </div>
      </div>
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

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AuthAwareSettingsProvider>
            <AppProvider>
              <ThemeProvider>
                <CartProvider>
                  <AppContent />
                  <BuildVersionFooter />
                </CartProvider>
              </ThemeProvider>
            </AppProvider>
          </AuthAwareSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
