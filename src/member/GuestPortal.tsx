import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context';
import { useCart } from './CartContext';
import CartDrawer from './CartDrawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, MapPin, Clock, Bell, LogIn, LogOut, ShieldAlert, Dumbbell, Map, MessageSquare, ChevronRight } from 'lucide-react';
import { Client } from '../types';

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
  const { packages, branding } = useAppContext();
  const { logout } = useAuth();
  const { addToCart } = useCart();
  const [showPreloader, setShowPreloader] = useState(true);
  const [activeTab, setActiveTab] = useState<'book' | 'locations' | 'schedule' | 'announcements'>('book');
  
  // Slide index state for slideshow
  const [slideIndex, setSlideIndex] = useState(0);

  // Refs for scrolling to sections
  const kidsSectionRef = useRef<HTMLDivElement>(null);
  const adultSectionRef = useRef<HTMLDivElement>(null);

  // Preloader timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPreloader(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Slideshow auto-advance
  useEffect(() => {
    if (activeTab !== 'book') return;
    const interval = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Filter packages based on the user's requirements
  const kidsPackages = packages.filter(p => p.name.toLowerCase().includes('kid') || p.name.toLowerCase().includes('junior'));
  
  // Example for adult packages 10, 20, 30
  const adultPackages = packages.filter(p => 
    !p.name.toLowerCase().includes('kid') && 
    !p.name.toLowerCase().includes('junior') &&
    (p.sessions === 10 || p.sessions === 20 || p.sessions === 30)
  ).sort((a, b) => a.sessions - b.sessions);

  // Fallback packages if db is empty
  const mockKidsPackages = [
    { id: 'mock-k1', name: 'Kids Kickboxing - Maxim Compound', sessions: 12, expiryDays: 45, price: 1500, type: 'Kids' },
    { id: 'mock-k2', name: 'Kids Boxing - Maxim Compound', sessions: 8, expiryDays: 30, price: 1100, type: 'Kids' }
  ];

  const mockAdultPackages = [
    { id: 'mock-a1', name: 'IMPACT Adult Package 10', sessions: 10, expiryDays: 30, price: 1800, type: 'Adults' },
    { id: 'mock-a2', name: 'IMPACT Adult Package 20', sessions: 20, expiryDays: 60, price: 3200, type: 'Adults' },
    { id: 'mock-a3', name: 'IMPACT Adult Package 30', sessions: 30, expiryDays: 90, price: 4500, type: 'Adults' }
  ];

  const displayKids = kidsPackages.length > 0 ? kidsPackages : mockKidsPackages;
  const displayAdults = adultPackages.length > 0 ? adultPackages : mockAdultPackages;

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
            <img src={branding.logoUrl} alt="MITRIXOGYMCRM" className="h-24 w-auto object-contain brightness-0 invert" />
          ) : (
            <h1 className="text-5xl font-extrabold tracking-[0.25em] text-white">MITRIXOGYMCRM</h1>
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
        <div className="flex items-center gap-2">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="MITRIXOGYMCRM" className="h-8 w-auto object-contain" />
          ) : (
            <h1 className="text-xl font-black tracking-[0.2em]">MITRIXOGYMCRM</h1>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {client && (
            <div className="text-[11px] font-black text-muted-foreground mr-1 truncate max-w-[120px] bg-muted/40 px-2.5 py-1 rounded-full border border-border">
              👤 {client.name.split(' ')[0]}
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
            className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition-all ${
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
          <div className="space-y-8 py-6">
            
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
                      <h3 className="text-white font-black text-xl leading-tight uppercase">Elite Boxing Sparring</h3>
                      <p className="text-white/70 text-xs mt-1 mb-3">Maxim Compound • Timings available now</p>
                    </div>
                  )}
                  {slideIndex === 1 && (
                    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                      <Badge className="mb-2 bg-primary text-primary-foreground">Popular</Badge>
                      <h3 className="text-white font-black text-xl leading-tight uppercase">Kids Fitness & Boxing</h3>
                      <p className="text-white/70 text-xs mt-1 mb-3">Maxim Compound branch packages</p>
                    </div>
                  )}
                  {slideIndex === 2 && (
                    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                      <Badge className="mb-2 bg-rose-600 text-white">New</Badge>
                      <h3 className="text-white font-black text-xl leading-tight uppercase">IMPACT Conditioning</h3>
                      <p className="text-white/70 text-xs mt-1 mb-3">Zayed & Maxim Compound sister company</p>
                    </div>
                  )}
                  <Button size="sm" className="w-full font-bold h-10 rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => scrollToSection(kidsSectionRef)}>
                    Book Now!
                  </Button>
                </div>
              </div>
            </div>

            {/* 2. KIDS PACKAGES SECTION (MAXIM COMPOUND) */}
            <div ref={kidsSectionRef} className="px-4 pt-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase">Kids Packages</h2>
                <Badge variant="outline" className="text-[10px] font-bold border-primary/20 text-primary">Maxim Compound Branch</Badge>
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
                  <div key={pkg.id} className="bg-card border rounded-2xl p-4 flex gap-4 shadow-sm hover:border-primary/30 transition-all">
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
                          onClick={() => addToCart(pkg as any)} 
                          className="h-8 px-4 text-xs font-bold rounded-xl"
                        >
                          Add to Basket
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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

            {/* 4. ADULT PACKAGES (10, 20, 30 SESSIONS) */}
            <div ref={adultSectionRef} className="px-4 pt-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black tracking-tight uppercase">Adult Packages</h2>
                <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary uppercase">IMPACT Conditioning</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {displayAdults.map(pkg => (
                  <div key={pkg.id} className="bg-card border rounded-2xl p-4 flex gap-4 shadow-sm hover:border-primary/30 transition-all items-center">
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
                          onClick={() => addToCart(pkg as any)} 
                          className="h-8 px-4 text-xs font-bold rounded-xl"
                        >
                          Add to Basket
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── LOCATIONS TAB ── */}
        {activeTab === 'locations' && (
          <div className="p-4 space-y-4 animate-in fade-in duration-300">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Our Locations</h2>
            
            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm uppercase">Maxim Compound Branch</h3>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px]">Open</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">Inside Maxim Compound, Fifth Settlement, New Cairo. Premium boxing ring, professional heavy bag frames, and expert captian coaching.</p>
              <div className="pt-2 border-t text-[11px] space-y-1 text-muted-foreground font-semibold">
                <p>📍 Location: New Cairo, Egypt</p>
                <p>⏰ Timings: 6:00 AM - 11:00 PM</p>
                <p>📞 Contact: +20 10 9988 7766</p>
              </div>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm uppercase">Mivida Branch</h3>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px]">Open</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">Inside Mivida Compound Club, Fifth Settlement, New Cairo. Dedicated personal training zone and group fitness studios.</p>
              <div className="pt-2 border-t text-[11px] space-y-1 text-muted-foreground font-semibold">
                <p>📍 Location: New Cairo, Egypt</p>
                <p>⏰ Timings: 7:00 AM - 10:00 PM</p>
                <p>📞 Contact: +20 10 9988 7755</p>
              </div>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-3 border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm uppercase text-primary">mitrixogymcrm IMPACT Zayed</h3>
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px]">Sister Gym</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">Sheikh Zayed Branch. Dedicated to advanced HIIT conditioning and high intensity strength training.</p>
              <div className="pt-2 border-t text-[11px] space-y-1 text-muted-foreground font-semibold">
                <p>📍 Location: Sheikh Zayed City, Giza</p>
                <p>⏰ Timings: 6:00 AM - 11:00 PM</p>
                <p>📞 Contact: +20 10 9988 7744</p>
              </div>
            </div>
          </div>
        )}

        {/* ── SCHEDULE TAB ── */}
        {activeTab === 'schedule' && (
          <div className="p-4 space-y-4 animate-in fade-in duration-300">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Class Schedule</h2>
            
            <div className="space-y-3">
              {[
                { time: "09:00 AM", name: "Boxing Foundation", coach: "Coach Captain Yasser", branch: "Maxim Compound", days: "Mon / Wed" },
                { time: "11:00 AM", name: "Strength & Conditioning", coach: "Coach Michael Mitry", branch: "Maxim Compound", days: "Sat / Mon / Wed" },
                { time: "05:00 PM", name: "Kids Kickboxing", coach: "Coach Nour", branch: "Maxim Compound", days: "Sun / Tue" },
                { time: "06:00 PM", name: "Advanced Boxing Sparring", coach: "Coach Captain Yasser", branch: "Mivida", days: "Tue / Thu" },
                { time: "07:00 PM", name: "IMPACT HIIT Conditioning", coach: "Coach Dodo", branch: "mitrixogymcrm IMPACT", days: "Sat / Mon / Thu" }
              ].map((cls, idx) => (
                <div key={idx} className="bg-card border rounded-2xl p-4 flex justify-between items-center shadow-sm">
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
          <div className="p-4 space-y-4 animate-in fade-in duration-300">
            <h2 className="text-xl font-black uppercase tracking-tight mb-2">Club News</h2>
            
            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-bold uppercase">Update</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 15, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">IMPACT Adult Packages Live</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Adult packages of 10, 20, and 30 sessions are now live on the storefront for immediate request! Access custom metabolic training coached by Coach Michael and Coach Dodo.</p>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-zinc-400 uppercase">Announcement</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 12, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">Maxim Compound Expansion</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">We are expanding our training space at Maxim Compound branch. Adding a dedicated parent lounge, juice bar storefront expansion, and secondary training ring.</p>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-bold border-zinc-700 text-zinc-400 uppercase">Billing</Badge>
                <span className="text-[10px] text-muted-foreground font-semibold">June 10, 2026</span>
              </div>
              <h3 className="font-extrabold text-sm uppercase">Instapay Payments Supported</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">For quick checkout processing, you can transfer directly via Instapay address <strong className="text-white">mitrixogymcrm@instapay</strong> and supply your reference number in checkout.</p>
            </div>
          </div>
        )}

      </main>

      {/* ── BOTTOM ACTION BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-40 flex flex-col items-center gap-2">
        {client ? (
          <div className="flex gap-2 w-[90vw] max-w-sm">
            <Button 
              variant="outline" 
              className="flex-1 rounded-full shadow-xl bg-background/90 backdrop-blur-md border-border/50 text-xs font-bold h-12"
              onClick={onSwitchToCRM}
            >
              Portal Panel
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
            className="w-[90vw] max-w-sm rounded-full shadow-xl bg-background/90 backdrop-blur-md border-border/50 text-xs font-bold h-12"
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
