import React, { useState, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import ImageCropperDialog from './ImageCropperDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Image as ImageIcon, Plus, Trash2, Save, GripVertical, Eye, EyeOff,
  Layout, Calendar, Gift, Settings2, Type, Upload, X, CheckCircle2,
  ArrowUp, ArrowDown, Sparkles, Map
} from 'lucide-react';
import type { HeroSlide, StorefrontSection, ScheduleEntry, OfferEntry, StorefrontConfig, BranchLocation } from '../types';

export default function AdminStorefrontManager() {
  const { storefrontConfig, updateStorefrontConfig, branches } = useSettings();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string; id: string; field: string } | null>(null);
  const [cropSrc, setCropSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropAspectRatio, setCropAspectRatio] = useState(1);

  // Local working copy
  const [config, setConfig] = useState<StorefrontConfig>(storefrontConfig);

  // Sync when context changes
  React.useEffect(() => {
    setConfig({
      ...storefrontConfig,
      branchLocations: storefrontConfig.branchLocations || []
    });
  }, [storefrontConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateStorefrontConfig(config);
      setSaveStatus('✅ Saved successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    let ratio = 1;
    if (uploadTarget.type === 'hero') {
      ratio = 16 / 9;
    } else if (uploadTarget.type === 'section') {
      ratio = 2.5;
    } else if (uploadTarget.type === 'offer') {
      ratio = 2;
    }
    setCropAspectRatio(ratio);

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!uploadTarget) return;
    setUploading(uploadTarget.id);
    try {
      const path = `${uploadTarget.type}/${uploadTarget.id}_${Date.now()}.jpg`;
      const ref = storageRef(storage, `storefront/${path}`);
      await uploadBytes(ref, blob);
      const url = await getDownloadURL(ref);

      if (uploadTarget.type === 'hero') {
        setConfig(prev => ({
          ...prev,
          heroSlides: prev.heroSlides.map(s => s.id === uploadTarget.id ? { ...s, imageUrl: url } : s)
        }));
      } else if (uploadTarget.type === 'section') {
        setConfig(prev => ({
          ...prev,
          sections: prev.sections.map(s => s.id === uploadTarget.id ? { ...s, imageUrl: url } : s)
        }));
      } else if (uploadTarget.type === 'offer') {
        setConfig(prev => ({
          ...prev,
          offers: prev.offers.map(o => o.id === uploadTarget.id ? { ...o, imageUrl: url } : o)
        }));
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(null);
      setUploadTarget(null);
      setCropSrc('');
      setIsCropOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerUpload = (type: string, id: string, field: string = 'imageUrl') => {
    setUploadTarget({ type, id, field });
    fileInputRef.current?.click();
  };

  // ── Hero Slide Helpers ──
  const addHeroSlide = () => {
    const newSlide: HeroSlide = {
      id: `hero-${Date.now()}`,
      title: 'New Slide',
      subtitle: 'Add a subtitle',
      badgeText: 'NEW',
      badgeColor: 'primary',
      imageUrl: '',
      ctaText: 'Book Now!',
      enabled: true,
      order: config.heroSlides.length,
    };
    setConfig(prev => ({ ...prev, heroSlides: [...prev.heroSlides, newSlide] }));
  };

  const updateSlide = (id: string, updates: Partial<HeroSlide>) => {
    setConfig(prev => ({
      ...prev,
      heroSlides: prev.heroSlides.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const removeSlide = (id: string) => {
    setConfig(prev => ({
      ...prev,
      heroSlides: prev.heroSlides.filter(s => s.id !== id)
    }));
  };

  const moveSlide = (id: string, direction: 'up' | 'down') => {
    setConfig(prev => {
      const slides = [...prev.heroSlides].sort((a, b) => a.order - b.order);
      const idx = slides.findIndex(s => s.id === id);
      if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === slides.length - 1)) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      const a = slides[idx];
      const b = slides[swapIdx];
      if (!a || !b) return prev;
      [a.order, b.order] = [b.order, a.order];
      return { ...prev, heroSlides: slides };
    });
  };

  // ── Section Helpers ──
  const addSection = () => {
    const newSection: StorefrontSection = {
      id: `sec-${Date.now()}`,
      type: 'packages-all',
      title: 'New Section',
      enabled: true,
      order: config.sections.length,
    };
    setConfig(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
  };

  const updateSection = (id: string, updates: Partial<StorefrontSection>) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const removeSection = (id: string) => {
    setConfig(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== id) }));
  };

  // ── Schedule Helpers ──
  const addScheduleEntry = () => {
    const entry: ScheduleEntry = {
      id: `sch-${Date.now()}`,
      className: 'New Class',
      coach: '',
      branch: '',
      days: 'Mon / Wed',
      time: '06:00 PM',
      enabled: true,
    };
    setConfig(prev => ({ ...prev, schedule: [...prev.schedule, entry] }));
  };

  const updateScheduleEntry = (id: string, updates: Partial<ScheduleEntry>) => {
    setConfig(prev => ({
      ...prev,
      schedule: prev.schedule.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const removeScheduleEntry = (id: string) => {
    setConfig(prev => ({ ...prev, schedule: prev.schedule.filter(s => s.id !== id) }));
  };

  // ── Offer Helpers ──
  const addOffer = () => {
    const offer: OfferEntry = {
      id: `offer-${Date.now()}`,
      title: 'New Offer',
      description: 'Describe this offer',
      enabled: true,
      order: config.offers.length,
    };
    setConfig(prev => ({ ...prev, offers: [...prev.offers, offer] }));
  };

  const updateOffer = (id: string, updates: Partial<OfferEntry>) => {
    setConfig(prev => ({
      ...prev,
      offers: prev.offers.map(o => o.id === id ? { ...o, ...updates } : o)
    }));
  };

  const removeOffer = (id: string) => {
    setConfig(prev => ({ ...prev, offers: prev.offers.filter(o => o.id !== id) }));
  };

  // ── Location Helpers ──
  const handleUpdateLocation = (branchName: string, updates: Partial<BranchLocation>) => {
    setConfig(prev => {
      const currentLocs = prev.branchLocations || [];
      const exists = currentLocs.some(loc => loc.branchName === branchName);
      let newLocs;
      if (exists) {
        newLocs = currentLocs.map(loc => loc.branchName === branchName ? { ...loc, ...updates } : loc);
      } else {
        newLocs = [...currentLocs, { branchName, displayName: branchName, address: '', mapUrl: '', ...updates }];
      }
      return { ...prev, branchLocations: newLocs };
    });
  };

  const handleAddLocation = () => {
    const newLocName = prompt("Enter the system branch name (must match branch settings exactly):");
    if (!newLocName) return;
    const nameTrim = newLocName.trim();
    if (!nameTrim) return;

    setConfig(prev => {
      const currentLocs = prev.branchLocations || [];
      if (currentLocs.some(loc => loc.branchName.toLowerCase() === nameTrim.toLowerCase())) {
        alert("A location configuration for this branch already exists.");
        return prev;
      }
      const newLoc: BranchLocation = {
        branchName: nameTrim,
        displayName: `${nameTrim} Branch`,
        address: `${nameTrim}, Egypt`,
        mapUrl: ''
      };
      return { ...prev, branchLocations: [...currentLocs, newLoc] };
    });
  };

  const handleRemoveLocation = (branchName: string) => {
    if (!confirm(`Are you sure you want to remove the location configuration for "${branchName}"?`)) return;
    setConfig(prev => ({
      ...prev,
      branchLocations: (prev.branchLocations || []).filter(loc => loc.branchName !== branchName)
    }));
  };

  const handleResetLocationsToDefault = () => {
    setConfig(prev => ({
      ...prev,
      branchLocations: [
        {
          branchName: 'Maxim Compound',
          displayName: 'Maxim Compound Branch',
          address: 'Maxim Country Club',
          mapUrl: 'https://maps.app.goo.gl/8BPj5eG8EtsZD66c8'
        },
        {
          branchName: 'Mvida Compound',
          displayName: 'Mvida Compound Branch',
          address: 'Lake District',
          mapUrl: 'https://maps.app.goo.gl/hEM2eFL4fF2bqS8F7'
        },
        {
          branchName: 'Impact by Strike',
          displayName: 'Impact by Strike',
          address: 'Maxim Mall',
          mapUrl: 'https://maps.app.goo.gl/4VnA5jAgiZx1RhjQ8'
        }
      ]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input for image uploads */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={onFileSelected}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Storefront Manager
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Control everything guests and members see on the mobile app
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && (
            <span className="text-sm font-medium animate-in fade-in">{saveStatus}</span>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="hero" className="space-y-4">
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="hero" className="text-xs gap-1"><ImageIcon className="h-3 w-3" /> Hero</TabsTrigger>
          <TabsTrigger value="sections" className="text-xs gap-1"><Layout className="h-3 w-3" /> Sections</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs gap-1"><Calendar className="h-3 w-3" /> Schedule</TabsTrigger>
          <TabsTrigger value="offers" className="text-xs gap-1"><Gift className="h-3 w-3" /> Offers</TabsTrigger>
          <TabsTrigger value="locations" className="text-xs gap-1"><Map className="h-3 w-3" /> Locations</TabsTrigger>
          <TabsTrigger value="display" className="text-xs gap-1"><Settings2 className="h-3 w-3" /> Display</TabsTrigger>
          <TabsTrigger value="text" className="text-xs gap-1"><Type className="h-3 w-3" /> Text & CTA</TabsTrigger>
        </TabsList>

        {/* ═══════════════════ HERO SLIDES ═══════════════════ */}
        <TabsContent value="hero" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Hero Slideshow</h3>
              <p className="text-xs text-muted-foreground">Rotating banner at the top of the storefront</p>
            </div>
            <Button onClick={addHeroSlide} size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" /> Add Slide
            </Button>
          </div>
          
          {config.heroSlides.sort((a, b) => a.order - b.order).map((slide) => (
            <Card key={slide.id} className={`transition-opacity ${!slide.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <Badge variant={slide.enabled ? 'default' : 'outline'} className="text-[9px]">
                      #{slide.order + 1}
                    </Badge>
                    <span className="font-semibold text-sm">{slide.title || 'Untitled'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(slide.id, 'up')}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(slide.id, 'down')}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Switch checked={slide.enabled} onCheckedChange={(v) => updateSlide(slide.id, { enabled: v })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeSlide(slide.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Title</Label>
                    <Input value={slide.title} onChange={e => updateSlide(slide.id, { title: e.target.value })} placeholder="Slide title" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Subtitle</Label>
                    <Input value={slide.subtitle} onChange={e => updateSlide(slide.id, { subtitle: e.target.value })} placeholder="Subtitle text" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Badge Text</Label>
                    <Input value={slide.badgeText} onChange={e => updateSlide(slide.id, { badgeText: e.target.value })} placeholder="e.g. Featured" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Badge Color</Label>
                    <Select value={slide.badgeColor} onValueChange={(v: any) => updateSlide(slide.id, { badgeColor: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="white">White</SelectItem>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="red">Red</SelectItem>
                        <SelectItem value="green">Green</SelectItem>
                        <SelectItem value="gold">Gold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">CTA Button Text</Label>
                    <Input value={slide.ctaText} onChange={e => updateSlide(slide.id, { ctaText: e.target.value })} placeholder="e.g. Book Now!" />
                  </div>
                </div>

                {/* Image upload */}
                <div className="flex items-center gap-3">
                  {slide.imageUrl ? (
                    <div className="relative h-20 w-32 rounded-lg overflow-hidden border">
                      <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                      <button 
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"
                        onClick={() => updateSlide(slide.id, { imageUrl: '' })}
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-20 w-32 rounded-lg border border-dashed flex items-center justify-center bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">No image</span>
                    </div>
                  )}
                  <Button 
                    size="sm" variant="outline" className="gap-1"
                    onClick={() => triggerUpload('hero', slide.id)}
                    disabled={uploading === slide.id}
                  >
                    <Upload className="h-3 w-3" />
                    {uploading === slide.id ? 'Uploading...' : 'Upload Image'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {config.heroSlides.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No hero slides yet</p>
                <p className="text-xs">Add your first slide to create the top banner</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════ SECTIONS ═══════════════════ */}
        <TabsContent value="sections" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Content Sections</h3>
              <p className="text-xs text-muted-foreground">Configure what package sections appear and in what order</p>
            </div>
            <Button onClick={addSection} size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" /> Add Section
            </Button>
          </div>

          {config.sections.sort((a, b) => a.order - b.order).map((section) => (
            <Card key={section.id} className={`transition-opacity ${!section.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">
                      {section.type}
                    </Badge>
                    <span className="font-semibold text-sm">{section.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={section.enabled} onCheckedChange={(v) => updateSection(section.id, { enabled: v })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeSection(section.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Section Type</Label>
                    <Select value={section.type} onValueChange={(v: any) => updateSection(section.id, { type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="packages-kids">Kids Packages</SelectItem>
                        <SelectItem value="packages-juniors">Junior Packages</SelectItem>
                        <SelectItem value="packages-adults">Adult Packages</SelectItem>
                        <SelectItem value="packages-all">All Packages</SelectItem>
                        <SelectItem value="banner">Promotional Banner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Title</Label>
                    <Input value={section.title} onChange={e => updateSection(section.id, { title: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Subtitle (optional)</Label>
                    <Input value={section.subtitle || ''} onChange={e => updateSection(section.id, { subtitle: e.target.value })} />
                  </div>
                </div>

                {(section.type === 'banner' || section.type.startsWith('packages-')) && (
                  <div className="flex items-center gap-3">
                    {section.imageUrl ? (
                      <div className="relative h-16 w-40 rounded-lg overflow-hidden border">
                        <img src={section.imageUrl} alt="" className="h-full w-full object-cover" />
                        <button className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5" onClick={() => updateSection(section.id, { imageUrl: '' })}>
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ) : null}
                    <Button 
                      size="sm" variant="outline" className="gap-1"
                      onClick={() => triggerUpload('section', section.id)}
                      disabled={uploading === section.id}
                    >
                      <Upload className="h-3 w-3" />
                      {uploading === section.id ? 'Uploading...' : 'Upload Banner Image'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ═══════════════════ SCHEDULE ═══════════════════ */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Class Schedule</h3>
              <p className="text-xs text-muted-foreground">Manage the class timetable shown to guests</p>
            </div>
            <Button onClick={addScheduleEntry} size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" /> Add Class
            </Button>
          </div>

          {config.schedule.map((entry) => (
            <Card key={entry.id} className={`transition-opacity ${!entry.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{entry.className || 'Untitled Class'}</span>
                  <div className="flex items-center gap-2">
                    <Switch checked={entry.enabled} onCheckedChange={(v) => updateScheduleEntry(entry.id, { enabled: v })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeScheduleEntry(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Class Name</Label>
                    <Input value={entry.className} onChange={e => updateScheduleEntry(entry.id, { className: e.target.value })} placeholder="e.g. HIIT Sparring" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Coach</Label>
                    <Input value={entry.coach} onChange={e => updateScheduleEntry(entry.id, { coach: e.target.value })} placeholder="e.g. Captain Yasser" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Branch</Label>
                    <Select value={entry.branch} onValueChange={(v) => updateScheduleEntry(entry.id, { branch: v || '' })}>
                      <SelectTrigger className="h-10 bg-background/50">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map(b => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Days</Label>
                    <Input value={entry.days} onChange={e => updateScheduleEntry(entry.id, { days: e.target.value })} placeholder="e.g. Mon / Wed / Fri" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Time</Label>
                    <Input value={entry.time} onChange={e => updateScheduleEntry(entry.id, { time: e.target.value })} placeholder="e.g. 06:00 PM" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {config.schedule.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No schedule entries yet</p>
                <p className="text-xs">Add classes to show a timetable on the storefront</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════ OFFERS ═══════════════════ */}
        <TabsContent value="offers" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Offers & Promotions</h3>
              <p className="text-xs text-muted-foreground">Informational banners displayed on the storefront</p>
            </div>
            <Button onClick={addOffer} size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" /> Add Offer
            </Button>
          </div>

          {config.offers.sort((a, b) => a.order - b.order).map((offer) => (
            <Card key={offer.id} className={`transition-opacity ${!offer.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{offer.title || 'Untitled Offer'}</span>
                  <div className="flex items-center gap-2">
                    <Switch checked={offer.enabled} onCheckedChange={(v) => updateOffer(offer.id, { enabled: v })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeOffer(offer.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Title</Label>
                    <Input value={offer.title} onChange={e => updateOffer(offer.id, { title: e.target.value })} placeholder="e.g. Summer Special" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Badge (optional)</Label>
                    <Input value={offer.badgeText || ''} onChange={e => updateOffer(offer.id, { badgeText: e.target.value })} placeholder="e.g. 20% OFF" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Description</Label>
                  <Input value={offer.description} onChange={e => updateOffer(offer.id, { description: e.target.value })} placeholder="Describe the offer..." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Valid Until (optional)</Label>
                    <Input type="date" value={offer.validUntil || ''} onChange={e => updateOffer(offer.id, { validUntil: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-3">
                    {offer.imageUrl ? (
                      <div className="relative h-16 w-32 rounded-lg overflow-hidden border">
                        <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" />
                        <button className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5" onClick={() => updateOffer(offer.id, { imageUrl: '' })}>
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ) : null}
                    <Button 
                      size="sm" variant="outline" className="gap-1"
                      onClick={() => triggerUpload('offer', offer.id)}
                      disabled={uploading === offer.id}
                    >
                      <Upload className="h-3 w-3" />
                      {uploading === offer.id ? 'Uploading...' : 'Image'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {config.offers.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No offers yet</p>
                <p className="text-xs">Create promotional banners to attract customers</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════ DISPLAY SETTINGS ═══════════════════ */}
        <TabsContent value="display" className="space-y-4">
          <h3 className="text-lg font-semibold">Tab Visibility</h3>
          <Card>
            <CardContent className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">Choose which tabs appear on the storefront</p>
              {([
                { key: 'book' as const, label: 'Book (Package catalog)', icon: '📦' },
                { key: 'locations' as const, label: 'Locations (Branch list)', icon: '📍' },
                { key: 'schedule' as const, label: 'Schedule (Class timetable)', icon: '📅' },
                { key: 'announcements' as const, label: 'Announcements (Club news)', icon: '📣' },
              ]).map(tab => (
                <div key={tab.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span>{tab.icon}</span>
                    <span className="text-sm font-medium">{tab.label}</span>
                  </div>
                  <Switch
                    checked={config.tabs[tab.key]}
                    onCheckedChange={(v) => setConfig(prev => ({
                      ...prev,
                      tabs: { ...prev.tabs, [tab.key]: v }
                    }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <h3 className="text-lg font-semibold">Package Display</h3>
          <Card>
            <CardContent className="p-4 space-y-4">
              {([
                { key: 'showPrices', label: 'Show prices on packages' },
                { key: 'showSessionCount', label: 'Show session count' },
                { key: 'showExpiryDays', label: 'Show expiry duration' },
                { key: 'allowAddToCart', label: 'Allow "Add to Cart" button' },
              ] as const).map(opt => (
                <div key={opt.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <Switch
                    checked={config.packageDisplay[opt.key]}
                    onCheckedChange={(v) => setConfig(prev => ({
                      ...prev,
                      packageDisplay: { ...prev.packageDisplay, [opt.key]: v }
                    }))}
                  />
                </div>
              ))}

              <div className="space-y-2 pt-2">
                <Label className="text-xs">Group Packages By</Label>
                <Select 
                  value={config.packageDisplay.groupBy} 
                  onValueChange={(v: any) => setConfig(prev => ({
                    ...prev,
                    packageDisplay: { ...prev.packageDisplay, groupBy: v }
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">Category (Kids / Adults)</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                    <SelectItem value="none">No Grouping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ TEXT & CTA ═══════════════════ */}
        <TabsContent value="text" className="space-y-4">
          <h3 className="text-lg font-semibold">Text & Call to Action</h3>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">CTA Button (Guests)</Label>
                  <Input 
                    value={config.ctaText} 
                    onChange={e => setConfig(prev => ({ ...prev, ctaText: e.target.value }))}
                    placeholder="e.g. Start Your Journey"
                  />
                  <p className="text-[10px] text-muted-foreground">Bottom button text when visitor is not logged in</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">CTA Button (Members)</Label>
                  <Input 
                    value={config.ctaTextMember} 
                    onChange={e => setConfig(prev => ({ ...prev, ctaTextMember: e.target.value }))}
                    placeholder="e.g. My Portal"
                  />
                  <p className="text-[10px] text-muted-foreground">Bottom button text when member is logged in</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Kids Category Label</Label>
                  <Input 
                    value={config.packageDisplay.categoryLabels.kids}
                    onChange={e => setConfig(prev => ({
                      ...prev,
                      packageDisplay: {
                        ...prev.packageDisplay,
                        categoryLabels: { ...prev.packageDisplay.categoryLabels, kids: e.target.value }
                      }
                    }))}
                    placeholder="e.g. Kids & Juniors"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Adults Category Label</Label>
                  <Input 
                    value={config.packageDisplay.categoryLabels.adults}
                    onChange={e => setConfig(prev => ({
                      ...prev,
                      packageDisplay: {
                        ...prev.packageDisplay,
                        categoryLabels: { ...prev.packageDisplay.categoryLabels, adults: e.target.value }
                      }
                    }))}
                    placeholder="e.g. Adult Programs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ LOCATIONS ═══════════════════ */}
        <TabsContent value="locations" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Branch Locations</h3>
              <p className="text-xs text-muted-foreground">Manage the addresses, display names, and Google Maps links for physical branches</p>
            </div>
            <Button onClick={handleAddLocation} size="sm" variant="outline" className="gap-1">
              <Plus className="h-3 w-3" /> Add Custom Location
            </Button>
          </div>

          <div className="space-y-4">
            {(config.branchLocations || []).map((loc, idx) => (
              <Card key={loc.branchName || idx}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">
                        {loc.branchName}
                      </Badge>
                      <span className="font-semibold text-sm">{loc.displayName || 'Untitled Location'}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive/80"
                      onClick={() => handleRemoveLocation(loc.branchName)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">System Branch Name</Label>
                      <Select 
                        value={loc.branchName} 
                        onValueChange={(val: any) => handleUpdateLocation(loc.branchName, { branchName: val || '' })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select Branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map(b => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                          ))}
                          {!branches.includes(loc.branchName) && (
                            <SelectItem value={loc.branchName}>{loc.branchName}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Must match the branch name configured in settings</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Display Name</Label>
                      <Input 
                        value={loc.displayName}
                        onChange={(e) => handleUpdateLocation(loc.branchName, { displayName: e.target.value })}
                        placeholder="e.g. Strike Mivida Branch"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Address Description</Label>
                      <Input 
                        value={loc.address}
                        onChange={(e) => handleUpdateLocation(loc.branchName, { address: e.target.value })}
                        placeholder="e.g. Lake District, Mivida"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Google Maps Link (mapUrl)</Label>
                    <Input 
                      value={loc.mapUrl || ''}
                      onChange={(e) => handleUpdateLocation(loc.branchName, { mapUrl: e.target.value })}
                      placeholder="e.g. https://maps.app.goo.gl/..."
                      className="h-9"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            {(!config.branchLocations || config.branchLocations.length === 0) && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  No custom branch locations configured. The storefront is currently using system defaults.
                  <Button onClick={handleResetLocationsToDefault} variant="link" className="text-primary mt-2 block mx-auto text-xs">
                    Import Default Locations
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ImageCropperDialog
        isOpen={isCropOpen}
        onClose={() => {
          setIsCropOpen(false);
          setCropSrc('');
          setUploadTarget(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        imageSrc={cropSrc}
        aspectRatio={cropAspectRatio}
        onCropComplete={handleCroppedUpload}
      />
    </div>
  );
}
