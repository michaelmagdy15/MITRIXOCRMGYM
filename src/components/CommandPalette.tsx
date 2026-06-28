import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context';
import { useLanguage } from '../contexts/LanguageContext';
import { 
  Search, BarChart3, Users, Activity, DollarSign, 
  Calendar, Shield, Settings, FileText, CornerDownLeft, X, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { clients, setActiveTab, setActiveClientId } = useAppContext();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const navigationItems = [
    { id: 'dashboard', name: 'Go to Dashboard', description: 'View gym statistics, active member counts, and sales metrics', icon: BarChart3 },
    { id: 'clients', name: 'Go to Members List', description: 'View client database, check active packages, and manage records', icon: Users },
    { id: 'leads', name: 'Go to Leads Pipeline', description: 'Track leads, trial sessions, and customer follow-up actions', icon: Activity },
    { id: 'payments', name: 'Go to Payments & Ledger', description: 'Record transactions, print receipts, and track gym revenue', icon: DollarSign },
    { id: 'bookings', name: 'Go to Bookings', description: 'Manage group training classes and private training bookings', icon: Calendar },
    { id: 'coaches', name: 'Go to Coaches', description: 'Directory of personal trainers and class instructors', icon: Shield },
    { id: 'settings', name: 'Go to Settings', description: 'Manage gym branches, membership packages, and user access roles', icon: Settings },
    { id: 'auditlogs', name: 'Go to Audit Logs', description: 'Monitor system events, database updates, and action logs', icon: FileText }
  ];

  // Filter navigation items
  const filteredNav = navigationItems.filter(item => 
    item.name.toLowerCase().includes(query.toLowerCase()) || 
    item.description.toLowerCase().includes(query.toLowerCase())
  );

  // Filter clients/members (limit to top 10 for performance)
  const filteredClients = query.trim() ? clients.filter(c => 
    c.name.toLowerCase().includes(query.toLowerCase()) || 
    (c.phone && c.phone.includes(query)) ||
    (c.memberId && c.memberId.toString().includes(query)) ||
    (c.packageType && c.packageType.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 10) : [];

  const totalResults = filteredNav.length + filteredClients.length;

  // Handle select action
  const handleSelect = (item: any, isClient: boolean = false) => {
    if (!isClient) {
      // Navigation item
      setActiveTab(item.id);
      onClose();
    } else {
      // Client item
      setActiveTab('clients');
      setActiveClientId(item.id);
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (totalResults || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + totalResults) % (totalResults || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Determine which item is selected
        if (selectedIndex < filteredNav.length) {
          handleSelect(filteredNav[selectedIndex], false);
        } else {
          const clientIdx = selectedIndex - filteredNav.length;
          if (filteredClients[clientIdx]) {
            handleSelect(filteredClients[clientIdx], true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredNav, filteredClients, totalResults]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-[10vh] px-4 md:px-0">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Spotlight Window */}
      <div className="relative w-full max-w-2xl bg-card border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header Input */}
        <div className="flex items-center px-4 border-b h-14 bg-muted/20 shrink-0">
          <Search className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none text-sm placeholder:text-muted-foreground focus:outline-none h-full text-foreground"
            placeholder="Search members, packages, navigation tabs... (e.g. 'Mivida', 'Dashboard')"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="hidden md:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-2">
            ESC
          </kbd>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 text-muted-foreground hover:text-foreground shrink-0 md:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-4 no-scrollbar">
          {totalResults === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          )}

          {/* Navigation Section */}
          {filteredNav.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 py-1.5">
                Navigation Shortcuts
              </p>
              {filteredNav.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    data-active={isSelected}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground shadow-md scale-[1.01]' 
                        : 'hover:bg-muted/50 text-foreground'
                    }`}
                    onClick={() => handleSelect(item, false)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{item.name}</p>
                        <p className={`text-[10px] ${isSelected ? 'text-primary-foreground/75' : 'text-muted-foreground'} mt-0.5`}>
                          {item.description}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-0.5 text-[9px] font-mono opacity-80 mr-1 bg-primary-foreground/10 px-1 rounded">
                        enter <CornerDownLeft className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Members/Clients Section */}
          {filteredClients.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 py-1.5 flex items-center gap-1">
                Members Directory <Sparkles className="h-3 w-3 text-amber-500" />
              </p>
              {filteredClients.map((client, idx) => {
                const globalIdx = filteredNav.length + idx;
                const isSelected = selectedIndex === globalIdx;
                return (
                  <button
                    key={client.id}
                    data-active={isSelected}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground shadow-md scale-[1.01]' 
                        : 'hover:bg-muted/50 text-foreground'
                    }`}
                    onClick={() => handleSelect(client, true)}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-primary/10 text-primary'
                      }`}>
                        {client.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold">{client.name}</p>
                          <Badge className={`text-[9px] font-normal leading-none ${
                            client.status === 'Active' 
                              ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}>
                            ID: {client.memberId || 'N/A'} • {client.status}
                          </Badge>
                        </div>
                        <p className={`text-[10px] ${isSelected ? 'text-primary-foreground/75' : 'text-muted-foreground'} mt-0.5`}>
                          📞 {client.phone} {client.packageType && `• 📦 ${client.packageType}`}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-0.5 text-[9px] font-mono opacity-80 mr-1 bg-primary-foreground/10 px-1 rounded">
                        view member <CornerDownLeft className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Instructions */}
        <div className="flex items-center justify-between px-4 h-10 border-t bg-muted/40 shrink-0 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div className="font-semibold text-primary">
            Spotlight Search
          </div>
        </div>
      </div>
    </div>
  );
}
