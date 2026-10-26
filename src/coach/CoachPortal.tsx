import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Calendar, Users, Dumbbell, User, LogOut, Sun, Moon, DollarSign, Flame, UserCheck, Bell, Check, BookOpen } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { db, getTenantId } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import CoachHome from './CoachHome';
import CoachSchedule from './CoachSchedule';
import CoachClients from './CoachClients';
import CoachSessions from './CoachSessions';
import CoachProfile from './CoachProfile';
import CoachClassPortal from './CoachClassPortal';
import CoachEarnings from './CoachEarnings';
import CoachFloorMode from './CoachFloorMode';
import CoachFitnessManagerView from './CoachFitnessManagerView';
import ExerciseLibraryHub from '../components/ExerciseLibraryHub';
import { Client, Session } from '../types';

export type CoachTab = 'home' | 'triage' | 'classes' | 'schedule' | 'members' | 'sessions' | 'library' | 'earnings' | 'profile' | 'floor';

const BASE_NAV_ITEMS: { tab: CoachTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'home',     label: 'Home',     icon: <Home className="h-5 w-5" /> },
  { tab: 'classes',  label: 'Classes',  icon: <Flame className="h-5 w-5" /> },
  { tab: 'schedule', label: 'Schedule', icon: <Calendar className="h-5 w-5" /> },
  { tab: 'members',  label: 'Members',  icon: <Users className="h-5 w-5" /> },
  { tab: 'library',  label: 'Library',  icon: <BookOpen className="h-5 w-5" /> },
  { tab: 'sessions', label: 'Sessions', icon: <Dumbbell className="h-5 w-5" /> },
  { tab: 'earnings', label: 'Earnings', icon: <DollarSign className="h-5 w-5" /> },
  { tab: 'profile',  label: 'Profile',  icon: <User className="h-5 w-5" /> },
];

export default function CoachPortal() {
  const { currentUser, logout } = useAuth();
  const { branding } = useSettings();
  const { theme, toggleTheme, themeLocked } = useTheme();

  const isInzan = useMemo(() => {
    const t = getTenantId().toLowerCase();
    return t.includes('inzan') || t === 'db-inzanathletics' || (branding?.companyName || '').toLowerCase().includes('inzan');
  }, [branding?.companyName]);

  const canAccessFitnessManagerBoard = useMemo(() => {
    if (!currentUser) return false;
    const roleStr = String(currentUser.role || '').toLowerCase();
    const nameStr = String(currentUser.name || '').toLowerCase();
    const specStr = String((currentUser as any).specialty || (currentUser as any).department || '').toLowerCase();
    return (
      Boolean(currentUser.isFitnessManager) ||
      roleStr === 'fitness_manager' ||
      roleStr === 'admin' ||
      roleStr === 'crm_admin' ||
      roleStr === 'super_admin' ||
      roleStr === 'manager' ||
      specStr.includes('fitness manager') ||
      specStr.includes('head coach') ||
      nameStr.includes('fitness manager')
    );
  }, [isInzan, currentUser]);

  const [activeTab, setActiveTab] = useState<CoachTab>('home');
  const [floorContext, setFloorContext] = useState<{ client?: Client | null; session?: Session | null } | null>(null);
  const [coachNotifications, setCoachNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const hasLoadedInitialNotifs = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    const coachId = currentUser.id;
    const coachCustomId = currentUser.coachId || '';
    const coachNameLower = (currentUser.name || '').trim().toLowerCase();

    const q = query(collection(db, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const matchesCoach = (n: any) =>
          (coachId && (n.recipientUid === coachId || n.recipientId === coachId || n.coachId === coachId)) ||
          (coachCustomId && (n.coachCustomId === coachCustomId || n.coachId === coachCustomId)) ||
          (coachNameLower && String(n.coachName || '').toLowerCase() === coachNameLower);

        if (hasLoadedInitialNotifs.current) {
          snap.docChanges().forEach(change => {
            if (change.type === 'added') {
              const data = change.doc.data();
              if (matchesCoach(data)) {
                toast.success(data.title || 'New PT Client Assigned', {
                  description: data.body || data.description,
                });
              }
            }
          });
        }
        hasLoadedInitialNotifs.current = true;

        const list = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as any))
          .filter(matchesCoach)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setCoachNotifications(list);
      },
      () => {}
    );
    return () => unsub();
  }, [currentUser?.id, currentUser?.coachId, currentUser?.name]);

  useEffect(() => {
    if (canAccessFitnessManagerBoard && (String(currentUser?.role || '').toLowerCase() === 'fitness_manager' || currentUser?.isFitnessManager)) {
      setActiveTab('triage');
    }
  }, [canAccessFitnessManagerBoard, currentUser?.role, currentUser?.isFitnessManager]);

  const navItems = useMemo(() => {
    if (!canAccessFitnessManagerBoard) return BASE_NAV_ITEMS;
    return [
      BASE_NAV_ITEMS[0]!,
      { tab: 'triage' as CoachTab, label: 'FM Triage', icon: <UserCheck className="h-5 w-5" /> },
      ...BASE_NAV_ITEMS.slice(1),
    ];
  }, [canAccessFitnessManagerBoard]);

  const handleStartFloor = (client?: Client | null, session?: Session | null) => {
    setFloorContext({ client: client || null, session: session || null });
    setActiveTab('floor');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b bg-card/95 backdrop-blur-xl shadow-sm min-h-[calc(3.75rem+var(--safe-top))] pt-[var(--safe-top)] flex items-center justify-between px-3 sm:px-6 sticky top-0 z-50 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName} className={`h-7 sm:h-8 w-auto object-contain shrink-0 ${branding.logoUrl.includes('_white') ? '' : 'dark:brightness-0 dark:invert'}`} referrerPolicy="no-referrer" />
          ) : (
            <h1 className="text-sm sm:text-lg font-extralight tracking-[0.15em] sm:tracking-[0.2em] uppercase text-primary font-logo truncate">{branding.companyName}</h1>
          )}
          <Badge variant="outline" className="hidden md:inline-flex text-[10px] font-bold tracking-widest uppercase text-primary border-primary/30 shrink-0">
            {canAccessFitnessManagerBoard && activeTab === 'triage' ? 'Fitness Manager Portal' : 'Coach Portal'}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {canAccessFitnessManagerBoard && (
            <Button
              variant={activeTab === 'triage' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(activeTab === 'triage' ? 'home' : 'triage')}
              className="h-9 px-2.5 sm:px-3 text-xs font-bold gap-1.5 rounded-xl border-primary/40 shadow-xs"
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Fitness Manager</span>
              <span>Triage</span>
            </Button>
          )}

          {/* Quick Floor Mode Launcher Button */}
          <Button
            variant={activeTab === 'floor' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStartFloor()}
            className="h-9 px-2.5 sm:px-3 text-xs font-bold gap-1.5 rounded-xl border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 shadow-xs"
          >
            <Flame className="h-3.5 w-3.5 fill-current shrink-0" />
            <span>Floor</span>
            <span className="hidden sm:inline">Mode</span>
          </Button>

          <Button variant="ghost" size="icon" onClick={toggleTheme} disabled={themeLocked} className="h-9 w-9 rounded-xl shrink-0">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotifOpen(v => !v)}
              title="Notifications"
              className="h-9 w-9 rounded-xl relative shrink-0"
            >
              <Bell className="h-4 w-4" />
              {coachNotifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-extrabold flex items-center justify-center">
                  {coachNotifications.length}
                </span>
              )}
            </Button>
            {notifOpen && (
              <div className="fixed left-3 right-3 top-[calc(4rem+var(--safe-top))] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 rounded-2xl bg-card border shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <span className="text-xs font-extrabold uppercase tracking-wider">Coach Notifications ({coachNotifications.length})</span>
                  {coachNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await Promise.all(
                          coachNotifications.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {}))
                        );
                        setNotifOpen(false);
                      }}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y">
                  {coachNotifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No unread notifications
                    </div>
                  ) : (
                    coachNotifications.map(n => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'notifications', n.id), { read: true });
                          } catch {}
                          setNotifOpen(false);
                          setActiveTab('members');
                        }}
                        className="p-3.5 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <p className="text-xs font-bold text-foreground">{n.title || 'New PT Client Assigned'}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{n.body || n.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold leading-tight">{currentUser?.name}</p>
            {currentUser?.coachId && (
              <p className="text-xs font-mono text-primary">{currentUser.coachId}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            title="Logout"
            aria-label="Logout"
            className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-3 sm:px-4 py-5 pb-[calc(6.5rem+var(--safe-bottom))] max-w-6xl">
        {activeTab === 'home'     && <CoachHome onNavigate={setActiveTab} onStartFloor={handleStartFloor} />}
        {activeTab === 'triage'   && canAccessFitnessManagerBoard && <CoachFitnessManagerView />}
        {activeTab === 'classes'  && <CoachClassPortal />}
        {activeTab === 'schedule' && <CoachSchedule onStartFloor={handleStartFloor} />}
        {activeTab === 'members'  && <CoachClients onStartFloor={handleStartFloor} />}
        {activeTab === 'library'  && <ExerciseLibraryHub mode="staff" onStartFloorWithClient={(c) => handleStartFloor(c)} />}
        {activeTab === 'sessions' && <CoachSessions />}
        {activeTab === 'earnings' && <CoachEarnings />}
        {activeTab === 'profile'  && <CoachProfile />}
        {activeTab === 'floor'    && (
          <CoachFloorMode 
            initialClient={floorContext?.client} 
            initialSession={floorContext?.session} 
            onExit={() => setActiveTab('home')} 
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 border-t z-50 flex items-center justify-between sm:justify-around overflow-x-auto no-scrollbar pt-1.5 pb-[max(0.5rem,var(--safe-bottom))] px-1 shadow-lg backdrop-blur-xl">
        {navItems.map(({ tab, label, icon }) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-[44px] sm:min-w-[56px] px-1 py-1 transition-all relative ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl transition-all duration-300">
                {isActive && (
                  <>
                    {/* Glowing background */}
                    <div className="absolute inset-0 bg-primary/10 rounded-xl blur-[1px]" />
                    {/* Glass border and inner shadows */}
                    <div className="absolute inset-0 rounded-xl border border-primary/20 bg-gradient-to-tr from-primary/5 to-primary/15 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)] pointer-events-none" />
                  </>
                )}
                <div className={`relative z-10 transition-transform ${isActive ? 'scale-110' : 'scale-100'}`}>
                  {icon}
                </div>
              </div>
              <span className={`text-[9px] sm:text-[10px] font-bold tracking-tight truncate max-w-full transition-all ${
                isActive ? 'text-primary font-black scale-105' : 'text-muted-foreground'
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
