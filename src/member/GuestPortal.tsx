import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context';
import { useCart } from './CartContext';
import CartDrawer from './CartDrawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Calendar, MapPin, Clock, Bell, LogIn, LogOut, ShieldAlert, Dumbbell, Map, MessageSquare, ChevronRight, X, Tag, RefreshCcw, ArrowUpRight, Info, ShoppingCart, Building2, Star, Gift } from 'lucide-react';
import { Client, Package } from '../types';

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

interface GuestPortalProps {
  onSwitchToCRM: () => void;
  isLeadPending?: boolean;
  client?: Client | null;
}

export default function GuestPortal({ onSwitchToCRM, isLeadPending = false, client = null }: GuestPortalProps) {
  const { packages, branding, branches, coaches } = useAppContext();
  const { currentUser, logout } = useAuth();
  const { storefrontConfig } = useSettings();
  // Detect if user is logged in (either passed as prop or via auth context)
  const isLoggedIn = !!(client || currentUser);
  const displayName = client?.name || currentUser?.name || '';
  const { addToCart } = useCart();
  const [showPreloader, setShowPreloader] = useState(true);
  const [activeTab, setActiveTab] = useState<'book' | 'locations' | 'schedule' | 'announcements'>('book');
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  
  // Slide index state for slideshow
  const [slideIndex, setSlideIndex] = useState(0);

  // Refs for scrolling to sections
  const kidsSectionRef = useRef<HTMLDivElement>(null);
  const adultSectionRef = useRef<HTMLDivElement>(null);

  // Preloader: wait for logo image to load (cached for subsequent renders)
  useEffect(() => {
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
      if (!cancelled) setShowPreloader(false);
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

  if (showPreloader) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
        <div className="relative flex flex-col items-center animate-pulse">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName || 'CRM'} className="h-24 w-auto object-contain brightness-0 invert" />
          ) : (
            <h1 className="text-5xl font-extrabold tracking-[0.25em] text-white">{(branding.companyName || 'CRM').toUpperCase()}</h1>
          )}
          <p className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mt-2 font-semibold">Boxing Club</p>
          
          <div className="h-1 w-24 bg-zinc-800 mt-8 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-400 animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
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

      {/* ── MAIN STOREFRONT CONTENT ── */}
      <main className="flex-1 overflow-y-auto">
        
        {/* ── TABS Content ── */}
        {activeTab === 'book' && (
          <div className="space-y-8 py-6 sf-tab-enter">
            
            {/* 1. SLIDESHOW HERO */}
            <div className="px-4">
              <div className="relative h-52 rounded-3xl overflow-hidden shadow-xl border">
                <div className="absolute inset-0 bg-gradient-to-tr from-black/95 via-black/40 to-transparent z-10" />
                <img 
                  src="/mitrixogymcrm_sessions_slide.png" 
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
                  src="/mitrixogymcrm_kids_boxing.png" 
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
                        <span className="font-black text-sm text-primary">{pkg.price.toLocaleString()} EGP</span>
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
                  src="/impact_sister_company.png" 
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
                        <span className="font-black text-sm text-primary">{pkg.price.toLocaleString()} EGP</span>
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
                        <span className="font-black text-sm text-primary">{pkg.price.toLocaleString()} EGP</span>
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
                  <p className="text-lg font-black text-primary">{pricePerSession(selectedPackage)}<span className="text-[10px]"> EGP</span></p>
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
                <p className="text-2xl font-black text-primary">{selectedPackage.price.toLocaleString()} <span className="text-sm">EGP</span></p>
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

    </div>
  );
}
