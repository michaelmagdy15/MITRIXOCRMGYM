import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Calendar, Users, Dumbbell, User, LogOut, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import CoachHome from './CoachHome';
import CoachSchedule from './CoachSchedule';
import CoachClients from './CoachClients';
import CoachSessions from './CoachSessions';
import CoachProfile from './CoachProfile';

type CoachTab = 'home' | 'schedule' | 'members' | 'sessions' | 'profile';

const NAV_ITEMS: { tab: CoachTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'home',     label: 'Home',     icon: <Home className="h-5 w-5" /> },
  { tab: 'schedule', label: 'Schedule', icon: <Calendar className="h-5 w-5" /> },
  { tab: 'members',  label: 'Members',  icon: <Users className="h-5 w-5" /> },
  { tab: 'sessions', label: 'Sessions', icon: <Dumbbell className="h-5 w-5" /> },
  { tab: 'profile',  label: 'Profile',  icon: <User className="h-5 w-5" /> },
];

export default function CoachPortal() {
  const { currentUser, logout } = useAuth();
  const { branding } = useSettings();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<CoachTab>('home');

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b bg-card shadow-sm h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName} className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
          ) : (
            <h1 className="text-lg font-extralight tracking-[0.2em] uppercase text-primary font-logo">{branding.companyName}</h1>
          )}
          <Badge variant="outline" className="text-[10px] font-bold tracking-widest uppercase text-primary border-primary/30">
            Coach Portal
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold leading-tight">{currentUser?.name}</p>
            {currentUser?.coachId && (
              <p className="text-xs font-mono text-primary">{currentUser.coachId}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-8 w-8">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 pb-24 max-w-2xl">
        {activeTab === 'home'     && <CoachHome onNavigate={setActiveTab} />}
        {activeTab === 'schedule' && <CoachSchedule />}
        {activeTab === 'members'  && <CoachClients />}
        {activeTab === 'sessions' && <CoachSessions />}
        {activeTab === 'profile'  && <CoachProfile />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50 flex justify-around py-1">
        {NAV_ITEMS.map(({ tab, label, icon }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[52px] transition-colors ${
              activeTab === tab ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            {icon}
            <span className="text-[10px] font-semibold tracking-wide">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
