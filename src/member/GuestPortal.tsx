import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context';
import { useCart } from './CartContext';
import CartDrawer from './CartDrawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Calendar, MapPin, Clock, Bell, LogIn, LogOut, ShieldAlert, Dumbbell, Map, MessageSquare, ChevronRight, X, Tag, RefreshCcw, ArrowUpRight, Info, ShoppingCart, Building2, Star, Gift, Megaphone, UserPlus } from 'lucide-react';
import { Client, Package } from '../types';
import { getTenantId } from '../firebase';

export function getPackageImage(packageName: string, sessions: number): string {
  const lowerName = packageName.toLowerCase();

  // 1. Adults (Maxim, Impact)
  if (!lowerName.includes('kid') && !lowerName.includes('junior')) {
    if (lowerName.includes('impact')) {
      if (sessions === 10) return "/Adults (Mivida, Maxim, Impact)/Impact/Impact 10.jpg";
      if (sessions === 20) return "/Adults (Mivida, Maxim, Impact)/Impact/Impact 20.jpg";
      if (sessions === 30) return "/Adults (Mivida, Maxim, Impact)/Impact/Impact 30.jpg";
      return "/Adults (Mivida, Maxim, Impact)/Impact/Impact 10.jpg";
    } else {
      if (sessions === 10) return "/Adults (Mivida, Maxim, Impact)/Maxim/ADLUT 10.jpg";
      if (sessions === 20) return "/Adults (Mivida, Maxim, Impact)/Maxim/ADLUT 20.jpg";
      if (sessions === 30) return "/Adults (Mivida, Maxim, Impact)/Maxim/ADLUT 30.jpg";
      return "/Adults (Mivida, Maxim, Impact)/Maxim/ADLUT.jpg";
    }
  }

  // 2. Juniors
  if (lowerName.includes('junior')) {
    const isPro = lowerName.includes('pro');
    if (isPro) {
      if (sessions === 10) return "/Juniors-Juniors Pro/Juniors 10 sessions (pro).jpg";
      if (sessions === 20) return "/Juniors-Juniors Pro/Juniors 20 sessions (pro).jpg";
      if (sessions === 30) return "/Juniors-Juniors Pro/Juniors 30 sessions (pro).jpg";
      return "/Juniors-Juniors Pro/Juniors 10 sessions (pro).jpg";
    } else {
      if (sessions === 10) return "/Juniors-Juniors Pro/Juniors 10 sessions .jpg";
      if (sessions === 20) return "/Juniors-Juniors Pro/Juniors 20sessions .jpg";
      if (sessions === 30) return "/Juniors-Juniors Pro/Juniors 30 sessions .jpg";
      if (sessions <= 12) return "/Juniors-Juniors Pro/Juniors 10 sessions .jpg";
      return "/Juniors-Juniors Pro/Juniors 20sessions .jpg";
    }
  }

  // 3. Kids
  const isPro = lowerName.includes('pro');
  if (isPro) {
    if (sessions === 10) return "/Kids Pro- Kids/Kids 10 sessions (pro).jpg";
    if (sessions === 20) return "/Kids Pro- Kids/Kids 20 sessions (pro).jpg";
    if (sessions === 30) return "/Kids Pro- Kids/Kids 30 sessions (pro).jpg";
    return "/Kids Pro- Kids/Kids 10 sessions (pro).jpg";
  } else {
    if (sessions === 10) return "/Kids Pro- Kids/Kids 10 sessions.jpg";
    if (sessions === 20) return "/Kids Pro- Kids/Kids 20 sessions.jpg";
    if (sessions === 30) return "/Kids Pro- Kids/Kids 30 sessions.jpg";
    if (sessions <= 10) return "/Kids Pro- Kids/Kids 10 sessions.jpg";
    return "/Kids Pro- Kids/Kids 20 sessions.jpg";
  }
}

const BoxingGlovesIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 122.88 117.44"
    fill="currentColor"
    className={className}
  >
    <g>
      <path d="M21.86,19.78c2.94-2.56,6.34-4.67,10.2-6.3l-2.53-2.45c-3.63-0.09-5.12,0.47-8.62,3.17c-1.23,0.95-2.47,1.99-3.7,3.11 c-1.62,2.11-3.23,2.44-4.85,0.79l-0.88-0.79c-0.88-1.43-1.04-3,1.32-5.11l3.98-3.13c1.79-1.41,3.5-3.24,5.9-3.37 c0.44-0.03,0.91-0.01,1.38,0.05l-1.42-1.37c-0.57-0.45-1.15-0.81-1.75-1.07c-0.59-0.25-1.2-0.41-1.82-0.44 c-2.1-0.12-5.32,1.95-8.36,4.68c-3.69,3.31-6.97,7.49-7.68,9.98c-1.13,3.94,3.89,8.28,8.1,11.92c0.58,0.5,1.14,0.99,1.67,1.46 c2.24-4.06,5-7.53,8.26-10.42C21.32,20.24,21.59,20.01,21.86,19.78L21.86,19.78z M102.99,95.63c2.44-3.04,4.42-6.52,5.89-10.44 l2.55,2.43c0.24,3.62-0.27,5.14-2.82,8.74c-0.9,1.27-1.89,2.54-2.96,3.82c-2.04,1.7-2.31,3.33-0.6,4.87l0.83,0.85 c1.46,0.82,3.04,0.93,5.05-1.52l2.97-4.1c1.34-1.84,3.1-3.63,3.14-6.03c0.01-0.44-0.03-0.91-0.11-1.38l1.43,1.37 c0.47,0.55,0.85,1.12,1.13,1.71c0.28,0.58,0.46,1.18,0.52,1.81c0.2,2.09-1.74,5.4-4.34,8.54c-3.17,3.82-7.21,7.26-9.67,8.07 c-3.89,1.29-8.43-3.56-12.23-7.63c-0.52-0.56-1.03-1.1-1.53-1.62c3.97-2.4,7.32-5.29,10.09-8.66 C102.55,96.19,102.78,95.91,102.99,95.63L102.99,95.63z M75.6,69.87c0.36-0.7,0.09-1.56-0.61-1.92s-1.56-0.09-1.92,0.61 c-0.86,1.66-1.84,3.18-2.97,4.53c-1.12,1.33-2.39,2.49-3.84,3.46c-0.66,0.44-0.83,1.32-0.4,1.98c0.44,0.66,1.32,0.83,1.98,0.4 c1.69-1.12,3.16-2.47,4.44-4C73.55,73.42,74.64,71.72,75.6,69.87L75.6,69.87z M81.27,75.11c0.36-0.7,0.09-1.56-0.61-1.92 c-0.7-0.36-1.56-0.09-1.92,0.61c-0.86,1.66-1.84,3.18-2.97,4.53c-1.12,1.33-2.39,2.49-3.84,3.46c-0.66,0.44-0.83,1.32-0.4,1.98 c0.44,0.66,1.32,0.83,1.98,0.4c1.69-1.12,3.16-2.47,4.44-4C79.22,78.66,80.32,76.96,81.27,75.11L81.27,75.11z M92.67,68.4 c-1.54-2.57-3.1-4.77-4.67-6.61l-0.18-0.21c-1.93-3.05-3.32-6.1-1.89-7.18l0,0c0.92-0.69,2.3-0.77,3.76-0.51 c2.17,0.38,4.4,1.49,5.76,2.5c1.77,1.33,3.38,3.05,4.76,4.9c1.65,2.2,2.97,4.57,3.88,6.66c0.92,2.14,1.61,4.44,2.06,6.91 c0.43,2.41,0.62,4.98,0.56,7.73c-1.43,4.26-3.43,8.06-6.03,11.38c-0.19,0.24-0.39,0.48-0.59,0.71c-3,3.49-6.72,6.33-11.1,8.57l0,0 c-0.05,0.03-0.1,0.06-0.15,0.09c-0.54-0.02-1.09-0.05-1.65-0.1c-0.96-0.08-1.9-0.19-2.82-0.34c-3.02-0.5-5.59-1.3-8.03-2.42 c-2.47-1.13-4.82-2.57-7.4-4.32c-1.26-0.85-2.51-1.78-3.75-2.78c-1.24-0.99-2.42-2.03-3.55-3.11h0c-2.46-2.57-4.17-5.07-5.17-7.51 c-0.97-2.37-1.26-4.69-0.9-6.97c0.34-2.12,1.6-4.66,3.24-7.1c2.09-3.13,4.75-6.06,6.86-7.86c0.91-0.77,1.8-1.43,2.68-1.95 c2.86-1.71,5.75-2.25,8.6-1.53c2.91,0.73,5.86,2.77,8.8,6.18c1.24,1.98,2.63,3.83,3.67,5.24c0.29,0.38,0.54,0.72,0.93,1.26 c0.46,0.64,1.35,0.79,1.99,0.32C92.94,69.9,93.1,69.04,92.67,68.4L92.67,68.4z M82.75,56.96c-1.7-1.16-3.41-1.95-5.14-2.38 c-3.62-0.91-7.22-0.26-10.76,1.86c-1.05,0.63-2.07,1.37-3.08,2.23c-2.27,1.94-5.14,5.1-7.38,8.45c-1.84,2.75-3.28,5.67-3.69,8.25 c-0.44,2.79-0.09,5.61,1.09,8.48c1.14,2.79,3.06,5.6,5.79,8.45l0.04,0.04l0,0c1.23,1.17,2.47,2.26,3.74,3.28 c1.25,1.01,2.57,1.98,3.94,2.91c2.71,1.84,5.19,3.36,7.82,4.56c2.66,1.21,5.45,2.09,8.75,2.64c1.05,0.17,2.07,0.3,3.06,0.38 c0.77,0.06,1.56,0.1,2.36,0.11c0.75,0.75,1.55,1.6,2.38,2.49c4.37,4.67,9.59,10.24,15.21,8.38c2.93-0.97,7.52-4.78,10.98-8.96 c3.03-3.66,5.27-7.7,4.99-10.62c-0.1-0.98-0.36-1.9-0.78-2.77c-0.4-0.84-0.94-1.63-1.59-2.38l0,0c-0.03-0.03-0.06-0.07-0.09-0.1 l-10.84-10.36c0.02-2.64-0.19-5.14-0.61-7.51c-0.48-2.67-1.23-5.18-2.25-7.53c-0.99-2.29-2.43-4.87-4.21-7.26 c-1.53-2.05-3.33-3.97-5.33-5.47c-1.64-1.23-4.35-2.57-6.97-3.03c-2.16-0.38-4.32-0.19-5.97,1.05l0,0l0,0 C82.67,53.28,82.36,55.01,82.75,56.96L82.75,56.96z M48.69,46.14c0.69-0.39,1.56-0.15,1.95,0.54c0.39,0.69,0.15,1.56-0.54,1.95 c-1.62,0.92-3.1,1.96-4.41,3.15c-1.29,1.17-2.4,2.48-3.3,3.97c-0.41,0.67-1.29,0.89-1.96,0.48c-0.67-0.41-0.89-1.29-0.48-1.96 c1.06-1.73,2.34-3.25,3.82-4.6C45.22,48.33,46.88,47.17,48.69,46.14L48.69,46.14z M43.22,40.68c0.69-0.39,1.56-0.15,1.95,0.54 c0.39,0.69,0.15,1.56-0.54,1.95c-1.62,0.92-3.1,1.96-4.41,3.15c-1.29,1.17-2.4,2.48-3.3,3.97c-0.41,0.67-1.29,0.89-1.96,0.48 c-0.67-0.41-0.89-1.29-0.48-1.96c1.06-1.73,2.34-3.25,3.82-4.6C39.76,42.86,41.41,41.7,43.22,40.68L43.22,40.68z M49.48,29.03 c2.63,1.44,4.89,2.91,6.79,4.41l0.21,0.17c3.12,1.8,6.23,3.07,7.25,1.61l0,0c0.66-0.95,0.68-2.33,0.36-3.77 c-0.47-2.15-1.66-4.34-2.72-5.65c-1.39-1.72-3.18-3.26-5.08-4.57c-2.27-1.56-4.68-2.79-6.81-3.61c-2.18-0.84-4.5-1.44-6.99-1.78 c-2.43-0.34-5.01-0.42-7.74-0.25c-4.2,1.6-7.92,3.75-11.13,6.47c-0.23,0.2-0.46,0.41-0.68,0.62c-3.37,3.14-6.06,6.96-8.12,11.43 l0,0c-0.02,0.05-0.05,0.1-0.08,0.15c0.04,0.54,0.09,1.09,0.16,1.64c0.12,0.96,0.27,1.89,0.46,2.8c0.62,3,1.52,5.53,2.73,7.92 c1.22,2.42,2.76,4.72,4.61,7.22c0.9,1.22,1.88,2.44,2.92,3.64c1.04,1.2,2.12,2.34,3.24,3.42h0c2.66,2.35,5.23,3.97,7.71,4.87 c2.41,0.88,4.74,1.08,7,0.63c2.11-0.42,4.59-1.79,6.97-3.52c3.04-2.21,5.87-4.99,7.58-7.16c0.74-0.94,1.35-1.86,1.85-2.76 c1.6-2.93,2.02-5.83,1.19-8.65c-0.85-2.88-2.99-5.75-6.52-8.55c-2.03-1.16-3.93-2.47-5.38-3.47c-0.39-0.27-0.74-0.51-1.3-0.88 c-0.66-0.44-0.84-1.32-0.4-1.98C47.97,28.81,48.83,28.62,49.48,29.03L49.48,29.03z M61.3,38.48c1.22,1.65,2.08,3.33,2.58,5.04 c1.05,3.58,0.55,7.21-1.43,10.82c-0.58,1.07-1.29,2.12-2.1,3.16c-1.85,2.35-4.89,5.34-8.15,7.71c-2.68,1.95-5.54,3.5-8.1,4.01 c-2.77,0.55-5.61,0.31-8.52-0.75c-2.83-1.03-5.72-2.84-8.67-5.46l-0.04-0.04l0,0c-1.22-1.18-2.36-2.38-3.42-3.6 c-1.06-1.21-2.08-2.49-3.06-3.82c-1.94-2.63-3.56-5.06-4.87-7.64c-1.32-2.61-2.31-5.37-2.98-8.64c-0.21-1.04-0.38-2.05-0.5-3.04 c-0.09-0.77-0.16-1.55-0.2-2.35c-0.77-0.72-1.66-1.49-2.58-2.28c-4.84-4.19-10.61-9.18-8.98-14.86c0.85-2.96,4.48-7.7,8.52-11.32 c3.53-3.17,7.49-5.57,10.42-5.4c0.99,0.06,1.92,0.29,2.8,0.67c0.85,0.37,1.67,0.87,2.44,1.49l0,0c0.03,0.03,0.07,0.06,0.1,0.09 l10.78,10.42c2.64-0.12,5.15-0.01,7.53,0.32c2.69,0.37,5.22,1.03,7.62,1.95c2.33,0.9,4.96,2.23,7.42,3.92 c2.11,1.45,4.09,3.17,5.67,5.11c1.3,1.59,2.74,4.24,3.31,6.85c0.47,2.15,0.36,4.31-0.81,6l0,0l0,0 C64.98,38.41,63.27,38.79,61.3,38.48L61.3,38.48z" />
    </g>
  </svg>
);

interface GuestPortalProps {
  onSwitchToCRM: () => void;
  isLeadPending?: boolean;
  client?: Client | null;
}

export default function GuestPortal({ onSwitchToCRM, isLeadPending = false, client = null }: GuestPortalProps) {
  const { t } = useLanguage();
  const { packages, branding, branches, coaches } = useAppContext();
  const { currentUser, logout } = useAuth();
  const { storefrontConfig } = useSettings();
  // Detect if user is logged in (either passed as prop or via auth context)
  const isLoggedIn = !!(client || currentUser);
  const displayName = client?.name || currentUser?.name || '';
  
  const tenantId = getTenantId();
  const isStrike = tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|mitrixogymcrmCRM/i.test(navigator.userAgent) || window.innerWidth < 768;
  const { addToCart } = useCart();
  const [preloaderState, setPreloaderState] = useState<'loading' | 'exiting' | 'hidden'>('hidden');
  const [activeTab, setActiveTab] = useState<'book' | 'locations' | 'schedule' | 'announcements'>('book');
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  
  // Slide index state for slideshow
  const [slideIndex, setSlideIndex] = useState(0);

  // Refs for scrolling to sections
  const kidsSectionRef = useRef<HTMLDivElement>(null);
  const adultSectionRef = useRef<HTMLDivElement>(null);

  // Preloader: wait for logo image to load (cached for subsequent renders)
  useEffect(() => {
    if (preloaderState !== 'loading') return;
    let cancelled = false;
    const minDelay = new Promise(r => setTimeout(r, 2000));
    
    const logoLoad = branding.logoUrl
      ? new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Don't block on error
          img.src = branding.logoUrl;
        })
      : Promise.resolve();

    Promise.all([minDelay, logoLoad]).then(() => {
      if (!cancelled) {
        setPreloaderState('exiting');
        setTimeout(() => {
          setPreloaderState('hidden');
        }, 600);
      }
    });
    return () => { cancelled = true; };
  }, [branding.logoUrl]);

  // Slideshow auto-advance
  useEffect(() => {
    if (activeTab !== 'book') return;
    const interval = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // ─── Show ALL packages from the database, grouped by category ───
  const primaryBranch = branches[0] || 'Main Branch';

  // Kids/Juniors = name contains 'kid' or 'junior'
  const kidsPackages = packages.filter(p => {
    const n = p.name.toLowerCase();
    return n.includes('kid') || n.includes('junior');
  }).sort((a, b) => a.sessions - b.sessions);

  // Adults = everything else
  const adultPackages = packages.filter(p => {
    const n = p.name.toLowerCase();
    return !n.includes('kid') && !n.includes('junior');
  }).sort((a, b) => a.sessions - b.sessions);

  // Use real data only — no mock fallbacks
  const displayKids = kidsPackages;
  const displayAdults = adultPackages;

  // Corporate packages (type 'Group' or name contains 'corporate')
  const corporatePackages = packages.filter(p => {
    const n = p.name.toLowerCase();
    return n.includes('corporate') || n.includes('company') || p.type === 'Group';
  }).sort((a, b) => a.sessions - b.sessions);

  // Active offers from storefront config
  const activeOffers = storefrontConfig.offers.filter(o => o.enabled).sort((a, b) => a.order - b.order);

  // Price per session calculator
  const pricePerSession = (pkg: Package) => Math.round(pkg.price / pkg.sessions);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (preloaderState !== 'hidden') {
    return (
      <div 
        className={`fixed inset-0 z-50 bg-[#070709] flex flex-col items-center justify-center transition-all ${
          preloaderState === 'exiting' ? 'preloader-exit' : ''
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(194,14,26,0.12)_0%,transparent_65%)] pointer-events-none" />
        
        <div className="relative flex flex-col items-center z-10 scale-95 animate-[fadeIn_1s_ease-out_forwards]">
          {branding.logoUrl ? (
            <div className="relative p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]">
              <img src={branding.logoUrl} alt={branding.companyName || 'CRM'} className="h-28 w-auto object-contain drop-shadow-[0_0_20px_rgba(194,14,26,0.4)]" />
            </div>
          ) : (
            <h1 className="text-5xl font-black tracking-[0.3em] text-white drop-shadow-[0_0_30px_rgba(194,14,26,0.5)]">
              {(branding.companyName || 'CRM').toUpperCase()}
            </h1>
          )}
          <p className="text-[11px] tracking-[0.5em] text-zinc-400 uppercase mt-6 font-bold">Boxing Club</p>
          
          <div className="h-1.5 w-32 bg-zinc-900 mt-10 rounded-full overflow-hidden border border-white/5 relative">
            <div className="h-full bg-gradient-to-r from-red-600 to-red-500 rounded-full animate-[slide_1.8s_infinite_ease-in-out] shadow-[0_0_10px_#C20E1A]" />
          </div>
        </div>
        
        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          @keyframes fadeIn {
            0% { opacity: 0; transform: scale(0.9); filter: blur(10px); }
            100% { opacity: 1; transform: scale(1); filter: blur(0); }
          }
          @keyframes fadeOutUp {
            0% { opacity: 1; transform: scale(1); filter: blur(0); }
            100% { opacity: 0; transform: scale(1.05); filter: blur(8px); }
          }
          .preloader-exit {
            animation: fadeOutUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            pointer-events: none;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans pb-24 select-none">
      
      {/* ── LEADS PENDING BANNER ── */}
      {isLeadPending && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-xs px-4 py-3 text-center font-bold flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Account Pending Activation. Pay at branch to unlock member features.</span>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setActiveTab('book')}
        >
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName || 'CRM'} className="h-8 w-auto object-contain" />
          ) : (
            <h1 className="text-xl font-black tracking-[0.2em]">{(branding.companyName || 'CRM').toUpperCase()}</h1>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isLoggedIn && displayName && (
            <div className="text-[11px] font-black text-muted-foreground mr-1 truncate max-w-[120px] bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 text-primary">
              👤 {displayName.split(' ')[0]}
            </div>
          )}
          <CartDrawer />
        </div>
      </header>

      {/* ── TABS ── */}
      {(!isStrike || !isMobile) && (
        <div className="bg-card border-b px-2 flex overflow-x-auto no-scrollbar py-2 gap-2 sticky top-16 z-30">
          {[
            { id: 'book', label: 'Book', icon: <Calendar className="h-4 w-4" /> },
            { id: 'locations', label: 'Locations', icon: <MapPin className="h-4 w-4" /> },
            { id: 'schedule', label: 'Schedule', icon: <Clock className="h-4 w-4" /> },
            { id: 'announcements', label: 'Announcements', icon: <Bell className="h-4 w-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition-all sf-interactive ${
                activeTab === tab.id 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'bg-muted/80 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── MAIN STOREFRONT CONTENT ── */}
      <main className="flex-1 overflow-y-auto">
        
        {activeTab === 'book' && (
          <div className="space-y-8 py-6 sf-tab-enter">
          <div className="space-y-6 pt-4">
            {/* QUICK SHORTCUTS */}
            <div className="px-4">
              <h2 className="text-[17px] font-black tracking-tight uppercase mb-3 text-foreground/90">
                Quick Shortcuts
              </h2>
              <div className="grid grid-cols-4 gap-2 bg-card/60 backdrop-blur-md border border-border/40 rounded-3xl p-4 shadow-sm">
                
                {/* Book Shortcut */}
                <button
                  onClick={() => scrollToSection(kidsSectionRef)}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:-translate-y-1">
                    {/* Background glow orb */}
                    <div className="absolute inset-0.5 bg-[#C20E1A] rounded-full opacity-60 blur-[4px] group-hover:opacity-85 transition-opacity" />
                    
                    {/* Glass surface */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20 rounded-full border border-white/30 backdrop-blur-xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_20px_rgba(194,14,26,0.3)] flex items-center justify-center">
                      {isStrike ? (
                        <BoxingGlovesIcon className="h-8 w-8 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                      ) : (
                        <Dumbbell className="h-7 w-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                      )}
                    </div>
                    
                    {/* Glossy reflection layer */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent opacity-50 pointer-events-none" />
                    
                    {/* Interactive Hover light swipe */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                  </div>
                  <span className="text-[11px] font-bold mt-2 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Book
                  </span>
                </button>

                {/* Locations Shortcut */}
                <button
                  onClick={() => setActiveTab('locations')}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:-translate-y-1">
                    {/* Background glow orb */}
                    <div className="absolute inset-0.5 bg-[#C20E1A] rounded-full opacity-60 blur-[4px] group-hover:opacity-85 transition-opacity" />
                    
                    {/* Glass surface */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20 rounded-full border border-white/30 backdrop-blur-xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_20px_rgba(194,14,26,0.3)] flex items-center justify-center">
                      <MapPin className="h-7 w-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                    </div>
                    
                    {/* Glossy reflection layer */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent opacity-50 pointer-events-none" />
                    
                    {/* Interactive Hover light swipe */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                  </div>
                  <span className="text-[11px] font-bold mt-2 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Locations
                  </span>
                </button>

                {/* Schedule Shortcut */}
                <button
                  onClick={() => setActiveTab('schedule')}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:-translate-y-1">
                    {/* Background glow orb */}
                    <div className="absolute inset-0.5 bg-[#C20E1A] rounded-full opacity-60 blur-[4px] group-hover:opacity-85 transition-opacity" />
                    
                    {/* Glass surface */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20 rounded-full border border-white/30 backdrop-blur-xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_20px_rgba(194,14,26,0.3)] flex items-center justify-center">
                      <Calendar className="h-7 w-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                    </div>
                    
                    {/* Glossy reflection layer */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent opacity-50 pointer-events-none" />
                    
                    {/* Interactive Hover light swipe */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                  </div>
                  <span className="text-[11px] font-bold mt-2 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Schedule
                  </span>
                </button>

                {/* Announcements Shortcut */}
                <button
                  onClick={() => setActiveTab('announcements')}
                  className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
                >
                  <div className="relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:-translate-y-1">
                    {/* Background glow orb */}
                    <div className="absolute inset-0.5 bg-[#00A859] rounded-full opacity-60 blur-[4px] group-hover:opacity-85 transition-opacity" />
                    
                    {/* Glass surface */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20 rounded-full border border-white/30 backdrop-blur-xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_20px_rgba(0,168,89,0.3)] flex items-center justify-center">
                      <Megaphone className="h-7 w-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                    </div>
                    
                    {/* Glossy reflection layer */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-transparent opacity-50 pointer-events-none" />
                    
                    {/* Interactive Hover light swipe */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                  </div>
                  <span className="text-[11px] font-bold mt-2 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                    Announcements
                  </span>
                </button>

              </div>
            </div>

            {/* 1. SLIDESHOW HERO */}
            <div className="px-4">
              <div className="relative h-52 rounded-3xl overflow-hidden shadow-xl border">
                <div className="absolute inset-0 bg-gradient-to-tr from-black/95 via-black/40 to-transparent z-10" />
                <img 
                  src={isStrike ? "/strike_slide_outdoor.png" : "/mitrixogymcrm_sessions_slide.png"} 
                  alt="mitrixogymcrm Sessions" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-out scale-105"
                />
                
                <div className="absolute inset-0 z-20 flex flex-col justify-end p-6">
                  {slideIndex === 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                      <Badge className="mb-2 bg-white text-black hover:bg-zinc-200">Featured</Badge>
                      <h3 className="text-white font-black text-xl leading-tight uppercase">Elite Fitness & Training</h3>
                      <p className="text-white/70 text-xs mt-1 mb-3">{primaryBranch} • Timings available now</p>
                    </div>
                  )}
                  {slideIndex === 1 && (
                    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                      <Badge className="mb-2 bg-primary text-primary-foreground">Popular</Badge>
                      <h3 className="text-white font-black text-xl leading-tight uppercase">Kids & Juniors Programs</h3>
                      <p className="text-white/70 text-xs mt-1 mb-3">Specialized youth fitness and coaching</p>
                    </div>
                  )}
                  {slideIndex === 2 && (
                    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                      <Badge className="mb-2 bg-rose-600 text-white">New</Badge>
                      <h3 className="text-white font-black text-xl leading-tight uppercase">Personal Coaching</h3>
                      <p className="text-white/70 text-xs mt-1 mb-3">Certified personal trainers at {branding.companyName}</p>
                    </div>
                  )}
                  <Button size="sm" className="w-full font-bold h-10 rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => scrollToSection(kidsSectionRef)}>
                    Book Now!
                  </Button>
                </div>
              </div>
            </div>

            {/* 2. KIDS PACKAGES SECTION (MAXIM COMPOUND) */}
            {displayKids.length > 0 && (
            <div ref={kidsSectionRef} className="px-4 pt-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase">Kids Packages</h2>
                <Badge variant="outline" className="text-[10px] font-bold border-primary/20 text-primary">{primaryBranch}</Badge>
              </div>
              
              {/* Kids Category Banner */}
              <div className="rounded-2xl h-36 overflow-hidden relative border mb-4 shadow-md">
                <div className="absolute inset-0 bg-black/60 z-10 flex flex-col justify-end p-4">
                  <h3 className="text-white font-extrabold text-sm uppercase">Kids Sparring & Kickboxing</h3>
                  <p className="text-white/60 text-[10px] mt-0.5">Build confidence, discipline, and stamina.</p>
                </div>
                <img 
                  src={isStrike ? "/strike_kids_outdoor.png" : "/mitrixogymcrm_kids_boxing.png"} 
                  alt="Kids Boxing" 
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                {displayKids.map(pkg => (
                  <div 
                    key={pkg.id} 
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      setSelectedPackage(pkg);
                    }} 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if ((e.target as HTMLElement).closest('button')) return;
                        setSelectedPackage(pkg);
                      }
                    }}
                    className="bg-card border rounded-2xl p-4 flex gap-4 shadow-sm md:hover:border-primary/30 transition-all cursor-pointer active:scale-[0.98] sf-card-stagger outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="h-16 w-16 rounded-xl bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center border border-white/5">
                      <img 
                        src={getPackageImage(pkg.name, pkg.sessions)} 
                        alt={pkg.name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                      <h3 className="font-extrabold text-xs text-foreground uppercase">{pkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{pkg.sessions} Sessions • {pkg.expiryDays} Days Validity</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-primary">{pkg.price.toLocaleString()} {t('payments.currency_le')}</span>
                          {isStrike && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] font-bold py-0.5 px-1.5 rounded-md">
                              +{Math.floor(pkg.price / 100)} Pts
                            </Badge>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setSelectedPackage(pkg); }} 
                          className="h-8 px-3 text-xs font-bold rounded-xl text-muted-foreground"
                        >
                          <Info className="h-3 w-3 mr-1" /> Details
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); addToCart(pkg as any); }} 
                          className="h-8 px-4 text-xs font-bold rounded-xl"
                        >
                          <ShoppingCart className="h-3 w-3 mr-1" /> Add to Cart
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* 3. IMPACT SISTER COMPANY */}
            <div className="px-4 my-6">
              <div className="rounded-3xl overflow-hidden relative shadow-xl border">
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10" />
                <img 
                  src={isStrike ? "/strike_impact_outdoor.png" : "/impact_sister_company.png"} 
                  alt="IMPACT Sister Company" 
                  className="w-full h-56 object-cover"
                />
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-end p-6 text-center">
                  <h2 className="text-3xl font-black tracking-tighter text-white uppercase">IMPACT</h2>
                  <p className="text-white/80 text-[11px] mb-4 max-w-[240px] leading-relaxed">Our premium sister company focusing on functional conditioning, adult fitness, and high intensity classes.</p>
                  <Button 
                    variant="outline" 
                    className="bg-white text-black border-none hover:bg-zinc-200 transition-colors rounded-xl font-bold text-xs h-10 px-8 w-full"
                    onClick={() => scrollToSection(adultSectionRef)}
                  >
                    Discover More
                  </Button>
                </div>
              </div>
            </div>

            {/* 4. ADULT PACKAGES */}
            {displayAdults.length > 0 && (
            <div ref={adultSectionRef} className="px-4 pt-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase">Adult Packages</h2>
                <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary uppercase">{branding.companyName}</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {displayAdults.map(pkg => (
                  <div 
                    key={pkg.id} 
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      setSelectedPackage(pkg);
                    }} 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if ((e.target as HTMLElement).closest('button')) return;
                        setSelectedPackage(pkg);
                      }
                    }}
                    className="bg-card border rounded-2xl p-4 flex gap-4 shadow-sm md:hover:border-primary/30 transition-all items-center cursor-pointer active:scale-[0.98] sf-card-stagger outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="h-16 w-16 rounded-xl bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center border border-white/5">
                      <img 
                        src={getPackageImage(pkg.name, pkg.sessions)} 
                        alt={pkg.name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[8px] font-bold border-zinc-700 text-zinc-400 uppercase tracking-widest px-1.5 py-0">{pkg.type || 'Adults'}</Badge>
                      </div>
                      <h3 className="font-extrabold text-xs text-foreground uppercase mt-1 truncate">{pkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{pkg.sessions} Sessions • {pkg.expiryDays} Days Validity</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-primary">{pkg.price.toLocaleString()} {t('payments.currency_le')}</span>
                          {isStrike && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] font-bold py-0.5 px-1.5 rounded-md">
                              +{Math.floor(pkg.price / 100)} Pts
                            </Badge>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setSelectedPackage(pkg); }} 
                          className="h-8 px-3 text-xs font-bold rounded-xl text-muted-foreground"
                        >
                          <Info className="h-3 w-3 mr-1" /> Details
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); addToCart(pkg as any); }} 
                          className="h-8 px-4 text-xs font-bold rounded-xl"
                        >
                          <ShoppingCart className="h-3 w-3 mr-1" /> Add to Cart
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* 5. CORPORATE / GROUP PACKAGES */}
            {corporatePackages.length > 0 && (
            <div className="px-4 pt-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" /> Corporate
                </h2>
                <Badge variant="outline" className="text-[10px] font-bold border-primary/20 text-primary">GROUP</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {corporatePackages.map(pkg => (
                  <div 
                    key={pkg.id} 
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      setSelectedPackage(pkg);
                    }} 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if ((e.target as HTMLElement).closest('button')) return;
                        setSelectedPackage(pkg);
                      }
                    }}
                    className="bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 flex gap-4 shadow-sm md:hover:border-primary/40 transition-all cursor-pointer active:scale-[0.98] sf-card-stagger outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <h3 className="font-extrabold text-xs text-foreground uppercase truncate">{pkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{pkg.sessions} Sessions • {pkg.expiryDays} Days</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-primary">{pkg.price.toLocaleString()} {t('payments.currency_le')}</span>
                          {isStrike && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] font-bold py-0.5 px-1.5 rounded-md">
                              +{Math.floor(pkg.price / 100)} Pts
                            </Badge>
                          )}
                        </div>
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); addToCart(pkg as any); }} className="h-7 px-3 text-[10px] font-bold rounded-xl">
                          <ShoppingCart className="h-3 w-3 mr-1" /> Add to Cart
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* 6. OFFERS & DISCOUNTS SECTION */}
            {activeOffers.length > 0 && (
            <div className="px-4 pt-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase flex items-center gap-2">
                  <Gift className="h-5 w-5 text-amber-500" /> Offers & Discounts
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {activeOffers.map(offer => (
                  <div key={offer.id} className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-transparent to-primary/5 border border-amber-500/20 rounded-2xl p-4 shadow-sm sf-card-stagger">
                    {offer.badgeText && (
                      <Badge className="absolute top-3 right-3 bg-amber-500 text-black text-[9px] font-black px-2">{offer.badgeText}</Badge>
                    )}
                    <div className="flex items-start gap-3">
                      {offer.imageUrl ? (
                        <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border">
                          <img src={offer.imageUrl} alt={offer.title} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Tag className="h-6 w-6 text-amber-500" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-extrabold text-sm uppercase">{offer.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{offer.description}</p>
                        {offer.validUntil && (
                          <p className="text-[10px] text-amber-500 font-bold mt-2">Valid until {new Date(offer.validUntil).toLocaleDateString()}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* 7. MEMBER RENEW / UPGRADE SECTION (only for logged-in members) */}
            {isLoggedIn && (
            <div className="px-4 pt-4">
              <div className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Star className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm uppercase">Manage Membership</h3>
                    <p className="text-[10px] text-muted-foreground">Renew, upgrade, or switch your plan</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-10 text-xs font-bold rounded-xl gap-1" onClick={onSwitchToCRM}>
                    <RefreshCcw className="h-3 w-3" /> Renew
                  </Button>
                  <Button size="sm" className="flex-1 h-10 text-xs font-bold rounded-xl gap-1" onClick={onSwitchToCRM}>
                    <ArrowUpRight className="h-3 w-3" /> Upgrade
                  </Button>
                </div>
              </div>
            </div>
            )}

            {/* EMPTY STATE - No packages at all */}
            {packages.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Dumbbell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-bold text-muted-foreground">Packages Coming Soon</h3>
                <p className="text-xs text-muted-foreground/60 mt-1">Our membership packages are being set up. Check back soon!</p>
              </div>
            )}

          </div>
        </div>
      )}

        {/* ── LOCATIONS TAB ── */}
        {activeTab === 'locations' && (
          <div className="p-4 space-y-4 sf-tab-enter">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Our Locations</h2>
            
            {branches.map((branch, idx) => (
              <div key={branch} className={`bg-card border rounded-2xl p-5 shadow-sm space-y-3 sf-card-stagger ${idx === 0 ? 'border-primary/20 bg-primary/5' : ''}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-sm uppercase">{branch} Branch</h3>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px]">Open</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Welcome to our {branch} location. Coached by certified instructors, featuring state-of-the-art facilities and equipment.
                </p>
                <div className="pt-2 border-t text-[11px] space-y-1 text-muted-foreground font-semibold">
                  <p>📍 Location: {branch}, Egypt</p>
                  <p>⏰ Timings: 6:00 AM - 11:00 PM</p>
                  <p>📞 Contact: {branding.companyName} Reception</p>
                </div>
              </div>
            ))}
            
            {branches.length === 0 && (
              <div className="text-center p-8 text-muted-foreground text-xs font-semibold">
                No active branches configured. Please check back later.
              </div>
            )}
          </div>
        )}

        {/* ── SCHEDULE TAB ── */}
        {activeTab === 'schedule' && (
          <div className="p-4 space-y-4 sf-tab-enter">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Class Schedule</h2>
            
            <div className="space-y-3">
              {((): any[] => {
                const b1 = branches[0] || 'Main Branch';
                const b2 = branches[1] || b1;
                const coachList = coaches.filter(c => c.active);
                const c1 = coachList[0]?.name || 'Coach Captain Yasser';
                const c2 = coachList[1]?.name || 'Coach Michael';
                const c3 = coachList[2]?.name || 'Coach Nour';

                return [
                  { time: "09:00 AM", name: "Fitness Foundation", coach: c1, branch: b1, days: "Mon / Wed" },
                  { time: "11:00 AM", name: "Strength & Conditioning", coach: c2, branch: b1, days: "Sat / Mon / Wed" },
                  { time: "05:00 PM", name: "Kids & Juniors Training", coach: c3, branch: b1, days: "Sun / Tue" },
                  { time: "06:00 PM", name: "Advanced Conditioning", coach: c1, branch: b2, days: "Tue / Thu" },
                  { time: "07:00 PM", name: "HIIT Sparring Session", coach: c2, branch: b2, days: "Sat / Mon / Thu" }
                ];
              })().map((cls, idx) => (
                <div key={idx} className="bg-card border rounded-2xl p-4 flex justify-between items-center shadow-sm sf-card-stagger">
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[9px] font-bold border-primary/20 text-primary uppercase">{cls.days}</Badge>
                    <h3 className="font-extrabold text-xs uppercase text-foreground">{cls.name}</h3>
                    <p className="text-[10px] text-muted-foreground">with {cls.coach}</p>
                    <p className="text-[9px] text-zinc-500 font-bold">📍 {cls.branch}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className="font-mono text-xs font-bold">{cls.time}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANNOUNCEMENTS TAB ── */}
        {activeTab === 'announcements' && (
          <div className="p-4 space-y-4 sf-tab-enter">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Club News</h2>
            
            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-bold uppercase">Update</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 15, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">Welcome to {branding.companyName}!</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Our mobile guest portal is fully active. Check out our locations, schedules, and purchase membership packages directly from your mobile device.
              </p>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-zinc-400 uppercase">Announcement</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 12, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">{branding.companyName} Packages Live</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We have updated our membership packages. Browse the 'Book' tab to choose your plan and complete your registration.
              </p>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-zinc-400 uppercase">Billing</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 10, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">Support & Inquiries</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                For support, please contact the reception at any of our branches: {branches.join(', ') || 'our main location'}.
              </p>
            </div>
          </div>
        )}

      </main>

      {/* ── PACKAGE DETAIL DRAWER ── */}
      {selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSelectedPackage(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div 
            className="relative w-full max-w-md bg-background rounded-t-3xl shadow-2xl border-t sf-tab-enter"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>
            
            {/* Close button */}
            <button 
              className="absolute top-3 right-4 h-11 w-11 flex items-center justify-center rounded-full bg-muted/80 hover:bg-muted text-foreground/80"
              onClick={() => setSelectedPackage(null)}
            >
              <X className="h-5 w-5" />
            </button>

            {/* Package Image */}
            <div className="px-5 pt-2">
              <div className="h-48 rounded-2xl overflow-hidden border bg-zinc-900">
                <img 
                  src={getPackageImage(selectedPackage.name, selectedPackage.sessions)} 
                  alt={selectedPackage.name} 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Package Info */}
            <div className="px-5 pt-4 pb-2 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[8px] font-bold border-primary/20 text-primary uppercase">{selectedPackage.type || 'Package'}</Badge>
                  {selectedPackage.branch !== 'ALL' && (
                    <Badge variant="outline" className="text-[8px] font-bold border-zinc-700 text-zinc-400 uppercase">{selectedPackage.branch}</Badge>
                  )}
                </div>
                <h2 className="text-xl font-black tracking-tight uppercase">{selectedPackage.name}</h2>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Sessions</p>
                  <p className="text-lg font-black text-foreground">{selectedPackage.sessions}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Validity</p>
                  <p className="text-lg font-black text-foreground">{selectedPackage.expiryDays}<span className="text-xs"> days</span></p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Per Session</p>
                   <p className="text-lg font-black text-primary">{pricePerSession(selectedPackage)}<span className="text-[10px]"> {t('payments.currency_le')}</span></p>
                </div>
              </div>

              {/* Features List */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  {selectedPackage.sessions} training sessions included
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  Valid for {selectedPackage.expiryDays} days from activation
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  {selectedPackage.branch === 'ALL' ? 'Access to all branches' : `Available at ${selectedPackage.branch} branch`}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0"><span className="text-green-500 text-[10px]">✓</span></div>
                  {selectedPackage.type === 'Private' ? 'Private 1-on-1 training' : 'Group class access'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-5 pb-8 pt-2 flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground font-semibold mb-1">Total Price</p>
                 <p className="text-2xl font-black text-primary">{selectedPackage.price.toLocaleString()} <span className="text-sm">{t('payments.currency_le')}</span></p>
              </div>
              <Button 
                className="h-12 px-6 rounded-xl text-sm font-bold gap-2 sf-interactive"
                onClick={() => { addToCart(selectedPackage as any); setSelectedPackage(null); }}
              >
                <ShoppingCart className="h-4 w-4" /> Add to Cart
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM ACTION BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-40 flex flex-col items-center gap-2">
        {isLoggedIn ? (
          <div className="flex gap-2 w-[90vw] max-w-sm">
            <Button 
              variant="outline" 
              className="flex-1 rounded-full shadow-xl bg-background/90 backdrop-blur-md border-primary/30 text-xs font-bold h-12 sf-interactive"
              onClick={onSwitchToCRM}
            >
              <Dumbbell className="h-4 w-4 mr-2" />
              My Portal
            </Button>
            <Button 
              variant="destructive" 
              className="rounded-full shadow-xl text-xs font-bold h-12 px-6"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button 
            variant="outline" 
            className="w-[90vw] max-w-sm rounded-full shadow-xl bg-background/90 backdrop-blur-md border-border/50 text-xs font-bold h-12 sf-interactive"
            onClick={onSwitchToCRM}
          >
            <LogIn className="h-4 w-4 mr-2" />
            Member / Staff Login
          </Button>
        )}
      </div>

      {isStrike && isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50 flex justify-around py-1.5 shadow-lg backdrop-blur-md bg-opacity-90">
          {[
            { id: 'signup', label: 'Sign Up', icon: <UserPlus className="h-5 w-5" />, action: onSwitchToCRM },
            { id: 'book', label: 'Book', icon: <Calendar className="h-5 w-5" />, action: () => setActiveTab('book') },
            { id: 'locations', label: 'Locations', icon: <MapPin className="h-5 w-5" />, action: () => setActiveTab('locations') },
            { id: 'schedule', label: 'Schedule', icon: <Clock className="h-5 w-5" />, action: () => setActiveTab('schedule') },
            { id: 'announcements', label: 'Announcements', icon: <Bell className="h-5 w-5" />, action: () => setActiveTab('announcements') }
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={item.action}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 min-w-[56px] transition-colors rounded-xl ${
                  isActive ? 'text-primary font-bold' : 'text-muted-foreground font-semibold'
                }`}
              >
                {item.icon}
                <span className="text-[9px] tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

    </div>
  );
}
