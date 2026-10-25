import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Client, Locker, LockerRequest } from '../types';
import { db, getTenantId } from '../firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { useSettings } from '../contexts/SettingsContext';
import { isTenantInzan } from '../utils/inzanOrg';
import {
  fetchMemberLockerStatus,
  memberClaimLocker,
  memberLinkLockerByPin,
  memberCheckSessionStatus,
  memberOpenLocker,
  memberExtendLocker,
  memberReleaseLocker,
  isHardwareLockerOnline,
  InzanMemberLockerStatus,
} from '../utils/inzanLockerClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Lock,
  Unlock,
  Key,
  ShieldCheck,
  HelpCircle,
  Send,
  CheckCircle2,
  RefreshCw,
  Clock,
  Eye,
  EyeOff,
  LogOut,
  Sparkles,
  Delete,
  ChevronRight,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';

const GUEST_SESSION_STORAGE_KEY = 'gl_guest_session';

interface LinkedPinSession {
  token: string;
  lockerName: string;
  expiresAt: string;
  extensionsLeft?: number;
  pin?: string;
}

function formatCountdownHms(expiresAt?: string | null, nowMs: number = Date.now()): {
  hms: string;
  expired: boolean;
  approaching: boolean;
} {
  if (!expiresAt) {
    return { hms: '03:00:00', expired: false, approaching: false };
  }
  const target = new Date(expiresAt).getTime();
  if (isNaN(target)) {
    return { hms: '03:00:00', expired: false, approaching: false };
  }
  const diffMs = target - nowMs;
  if (diffMs <= 0) {
    return { hms: '00:00:00', expired: true, approaching: false };
  }
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    hms: `${pad(h)}:${pad(m)}:${pad(s)}`,
    expired: false,
    approaching: diffMs < 30 * 60 * 1000,
  };
}

export default function MemberLocker({ client }: { client: Client | null }) {
  const { branding, branches: contextBranches } = useSettings();
  const companyDisplayName = branding?.companyName || 'GYM CLUB';
  const branches =
    Array.isArray(contextBranches) && contextBranches.length > 0
      ? contextBranches
      : ['Main Branch'];
  const isInzan =
    isTenantInzan(branding?.companyName) ||
    getTenantId().toLowerCase() === 'inzanathletics' ||
    getTenantId().toLowerCase().includes('inzan');

  // Non-Inzan / Firestore Locker state
  const [assignedLocker, setAssignedLocker] = useState<Locker | null>(null);
  const [pendingRequest, setPendingRequest] = useState<LockerRequest | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Inzan Smart Locker Phone Key state
  const [inzanStatus, setInzanStatus] = useState<InzanMemberLockerStatus | null>(null);
  const [linkedSession, setLinkedSession] = useState<LinkedPinSession | null>(null);
  const [inzanLoading, setInzanLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [unassignedTab, setUnassignedTab] = useState<'claim' | 'pin'>('claim');
  const [pinDigits, setPinDigits] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [cachedPin, setCachedPin] = useState<string | null>(null);
  const [openBannerVisible, setOpenBannerVisible] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [slideProgress, setSlideProgress] = useState<number>(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);

  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const openBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live 1-second countdown ticker for Inzan Smart Locker session timer
  useEffect(() => {
    if (!isInzan) return;
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isInzan]);

  useEffect(() => {
    return () => {
      if (openBannerTimerRef.current) {
        clearTimeout(openBannerTimerRef.current);
      }
    };
  }, []);

  const loadInzanLockerState = useCallback(
    async (silent = false) => {
      if (!client?.id || !isInzan) {
        setInzanLoading(false);
        return;
      }
      if (!silent) setInzanLoading(true);

      try {
        // 1. Check saved local guest/PIN session token
        const rawStored = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
        if (rawStored) {
          try {
            const parsed = JSON.parse(rawStored) as LinkedPinSession;
            if (parsed?.token) {
              const sessCheck = await memberCheckSessionStatus(parsed.token);
              if (sessCheck.state === 'active' && sessCheck.locker_name) {
                setLinkedSession({
                  token: parsed.token,
                  lockerName: sessCheck.locker_name,
                  expiresAt: sessCheck.expires_at || parsed.expiresAt,
                  extensionsLeft: sessCheck.extensions_left ?? parsed.extensionsLeft,
                  pin: parsed.pin,
                });
              } else {
                localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
                setLinkedSession(null);
              }
            }
          } catch {
            // Keep existing or ignore malformed localStorage
          }
        }

        // 2. Fetch CRM member locker status from server
        const statusRes = await fetchMemberLockerStatus(client.id);
        setInzanStatus(statusRes);
        if (statusRes.pin) {
          setCachedPin(statusRes.pin);
        }
        if (statusRes.sessionToken && statusRes.assignedLocker) {
          const nextLinked: LinkedPinSession = {
            token: statusRes.sessionToken,
            lockerName: statusRes.assignedLocker.name,
            expiresAt:
              statusRes.expiresAt ||
              statusRes.occupant?.valid_until ||
              new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
            pin: statusRes.pin || undefined,
          };
          setLinkedSession(nextLinked);
          localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(nextLinked));
        }
      } catch (err) {
        console.error('Error loading Inzan Smart Locker status:', err);
      } finally {
        if (!silent) setInzanLoading(false);
      }
    },
    [client?.id, isInzan]
  );

  useEffect(() => {
    if (isInzan) {
      loadInzanLockerState(false);
    }
  }, [isInzan, loadInzanLockerState]);

  // Standard Firestore subscription for non-Inzan tenants (and fallback)
  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    const lockersQ = query(
      collection(db, 'lockers'),
      where('assignedTo', '==', client.id)
    );
    const unsubLockers = onSnapshot(lockersQ, (snap) => {
      if (!snap.empty && snap.docs[0]) {
        const docSnap = snap.docs[0];
        setAssignedLocker({ id: docSnap.id, ...docSnap.data() } as Locker);
      } else {
        setAssignedLocker(null);
      }
    });

    const requestsQ = query(
      collection(db, 'lockerRequests'),
      where('clientId', '==', client.id),
      where('status', '==', 'Pending')
    );
    const unsubRequests = onSnapshot(
      requestsQ,
      (snap) => {
        if (!snap.empty && snap.docs[0]) {
          const docSnap = snap.docs[0];
          setPendingRequest({ id: docSnap.id, ...docSnap.data() } as LockerRequest);
        } else {
          setPendingRequest(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading locker requests:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubLockers();
      unsubRequests();
    };
  }, [client?.id]);

  const triggerOpenConfirmationBanner = useCallback(() => {
    setOpenBannerVisible(true);
    if (openBannerTimerRef.current) {
      clearTimeout(openBannerTimerRef.current);
    }
    openBannerTimerRef.current = setTimeout(() => {
      setOpenBannerVisible(false);
    }, 5000);
  }, []);

  const handleOpenInzanLocker = useCallback(async () => {
    if (!client || isBusy) return;
    const hwLocker = inzanStatus?.assignedLocker;
    const token = linkedSession?.token || inzanStatus?.sessionToken || undefined;

    setIsBusy(true);
    try {
      await memberOpenLocker({
        clientId: client.id,
        lockerId: hwLocker?.id,
        sessionToken: token,
      });
      triggerOpenConfirmationBanner();
      toast.success('Locker is open — pull the door gently!');
    } catch (err: any) {
      console.error('Failed to unlock smart locker:', err);
      toast.error(err?.message || 'Could not unlock locker. Please try again.');
    } finally {
      setIsBusy(false);
      setSlideProgress(0);
    }
  }, [client, isBusy, inzanStatus, linkedSession, triggerOpenConfirmationBanner]);

  const handleExtendInzanLocker = async () => {
    if (!client || isBusy) return;
    const hwLocker = inzanStatus?.assignedLocker;
    const token = linkedSession?.token || inzanStatus?.sessionToken || undefined;

    setIsBusy(true);
    try {
      const res = await memberExtendLocker({
        clientId: client.id,
        lockerId: hwLocker?.id,
        userId: inzanStatus?.occupant?.id,
        sessionToken: token,
      });
      if (linkedSession && res.expires_at) {
        const updated: LinkedPinSession = {
          ...linkedSession,
          expiresAt: res.expires_at,
          extensionsLeft: res.extensions_left ?? linkedSession.extensionsLeft,
        };
        setLinkedSession(updated);
        localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(updated));
      }
      toast.success('Session extended by +1 hour!');
      await loadInzanLockerState(true);
    } catch (err: any) {
      console.error('Failed to extend locker session:', err);
      toast.error(err?.message || 'Failed to extend locker session.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleVacateInzanLocker = async () => {
    if (!client || isBusy) return;
    const hwLocker = inzanStatus?.assignedLocker;

    setIsBusy(true);
    try {
      await memberReleaseLocker({
        clientId: client.id,
        lockerId: hwLocker?.id,
      });
      localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
      setLinkedSession(null);
      setCachedPin(null);
      setOpenBannerVisible(false);
      toast.success('Locker session ended and vacated. Thank you!');
      await loadInzanLockerState(true);
    } catch (err: any) {
      console.error('Failed to vacate locker:', err);
      toast.error(err?.message || 'Failed to vacate locker.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClaimInzanLocker = async (groupId?: number, genderHint?: string) => {
    if (!client || isBusy) return;
    setIsBusy(true);
    try {
      const res = await memberClaimLocker({
        clientId: client.id,
        clientName: client.name,
        gender: genderHint || client.gender,
        groupId,
        phone: client.phone,
        email: client.email,
      });
      if (res.pin) {
        setCachedPin(res.pin);
        setShowPin(true);
      }
      if (res.sessionToken) {
        const nextSess: LinkedPinSession = {
          token: res.sessionToken,
          lockerName: res.locker.name,
          expiresAt: res.expiresAt,
          pin: res.pin || undefined,
        };
        setLinkedSession(nextSess);
        localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(nextSess));
      }
      toast.success(`Locker ${res.locker.name} assigned to your phone key!`);
      await loadInzanLockerState(true);
    } catch (err: any) {
      console.error('Failed to claim smart locker:', err);
      toast.error(err?.message || 'Unable to allocate a smart locker right now.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLinkByPinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!client || isBusy) return;
    const cleanPin = pinDigits.trim();
    if (cleanPin.length < 4 || cleanPin.length > 8) {
      toast.error('Please enter a 4 to 8 digit locker PIN.');
      return;
    }

    setIsBusy(true);
    try {
      const res = await memberLinkLockerByPin({
        pin: cleanPin,
        clientId: client.id,
        clientName: client.name,
      });
      const nextSess: LinkedPinSession = {
        token: res.session.token,
        lockerName: res.session.locker_name,
        expiresAt: res.session.expires_at,
        extensionsLeft: res.session.extensions_left,
        pin: cleanPin,
      };
      setLinkedSession(nextSess);
      setCachedPin(cleanPin);
      localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(nextSess));
      setPinDigits('');
      toast.success(`Linked Locker ${res.session.locker_name} to your phone!`);
      await loadInzanLockerState(true);
    } catch (err: any) {
      console.error('Failed to link locker by PIN:', err);
      toast.error(err?.message || 'Invalid or expired locker PIN.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePinPadDigit = (digit: string) => {
    if (pinDigits.length >= 8) return;
    setPinDigits((prev) => prev + digit);
  };

  const handlePinPadBackspace = () => {
    setPinDigits((prev) => prev.slice(0, -1));
  };

  // Slider gesture handlers for iOS-style Slide-to-Unlock
  const updateSliderFromClientX = (clientX: number) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const thumbWidth = 56;
    const maxTravel = Math.max(1, rect.width - thumbWidth - 8);
    const offset = Math.max(0, Math.min(maxTravel, clientX - rect.left - thumbWidth / 2));
    const ratio = offset / maxTravel;
    setSlideProgress(ratio);
    if (ratio >= 0.92 && !isBusy) {
      setIsDraggingSlider(false);
      setSlideProgress(1);
      handleOpenInzanLocker();
    }
  };

  const handlePointerDownSlider = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isBusy) return;
    setIsDraggingSlider(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMoveSlider = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider || isBusy) return;
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerUpSlider = () => {
    if (!isDraggingSlider) return;
    setIsDraggingSlider(false);
    if (slideProgress < 0.92) {
      setSlideProgress(0);
    }
  };

  const handleRequestLocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !selectedBranch) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      await addDoc(collection(db, 'lockerRequests'), {
        clientId: client.id,
        clientName: client.name,
        branch: selectedBranch,
        status: 'Pending',
        requestedAt: new Date().toISOString(),
      });

      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'SYSTEM',
        entityId: client.id,
        details: `Member ${client.name} requested a locker room assignment at branch: ${selectedBranch}`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      setSubmitSuccess(true);
      setSelectedBranch('');
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to request locker:', err);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!client) return null;

  // ============================================================================
  // INZAN ATHLETICS — SMART LOCKER PHONE KEY EXPERIENCE
  // ============================================================================
  if (isInzan) {
    if (inzanLoading && !inzanStatus && !linkedSession) {
      return (
        <div className="flex flex-col items-center justify-center py-14 space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-xs text-muted-foreground">Connecting to Inzan Smart Lockers...</p>
        </div>
      );
    }

    const activeHardwareLocker = inzanStatus?.assignedLocker || null;
    const activeLockerName = activeHardwareLocker?.name || linkedSession?.lockerName || null;
    const isOnline = activeHardwareLocker ? isHardwareLockerOnline(activeHardwareLocker) : true;
    const activeExpiresAt =
      inzanStatus?.expiresAt ||
      inzanStatus?.occupant?.valid_until ||
      linkedSession?.expiresAt ||
      null;
    const countdown = formatCountdownHms(activeExpiresAt, nowTick);
    const displayPin =
      cachedPin ||
      inzanStatus?.pin ||
      activeHardwareLocker?.crmPin ||
      linkedSession?.pin ||
      null;
    const groups = inzanStatus?.groups || [];
    const menGroup = groups.find(
      (g) =>
        /men|male|gent/i.test(`${g.name} ${g.slug || ''}`) &&
        !/women|female|lad/i.test(`${g.name} ${g.slug || ''}`)
    );
    const womenGroup = groups.find((g) => /women|female|lad/i.test(`${g.name} ${g.slug || ''}`));

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" /> Smart Locker Phone Key
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unlock your locker directly from your phone or claim an available locker in seconds.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => loadInzanLockerState(false)}
            className="h-8 px-2.5 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${inzanLoading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>

        {/* 5-second green confirmation banner when locker door is pulsed open */}
        {openBannerVisible && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-emerald-400 flex items-center gap-3 shadow-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Unlock className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-emerald-300">
                Locker is open — pull the door gently
              </p>
              <p className="text-[11px] text-emerald-400/90">
                Relay pulse triggered on Locker {activeLockerName}. Remember to push the door shut when done.
              </p>
            </div>
          </div>
        )}

        {activeLockerName ? (
          /* STATE A: Member has an Assigned / Linked Smart Locker */
          <div className="relative overflow-hidden rounded-3xl p-0.5 bg-gradient-to-br from-emerald-500/60 via-primary/40 to-zinc-900 shadow-2xl">
            <Card className="relative border-0 rounded-[22px] overflow-hidden bg-zinc-950 text-white shadow-none">
              <div className="absolute -top-12 -right-12 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <CardContent className="p-6 space-y-6">
                {/* Header & Online Status */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">
                      {companyDisplayName}
                    </p>
                    <p className="text-xs font-mono text-emerald-400 mt-0.5">
                      PHONE KEY ACTIVE
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`px-2.5 py-0.5 text-[10px] font-bold ${
                      isOnline
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {isOnline ? '● HARDWARE ONLINE' : '○ OFFLINE'}
                  </Badge>
                </div>

                {/* Giant Locker Name & Live Countdown Timer */}
                <div className="flex flex-col items-center py-3 space-y-3 text-center">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-[0.25em]">
                    Assigned Smart Locker
                  </span>
                  <div className="text-6xl font-black tracking-tighter text-white drop-shadow-sm">
                    {activeLockerName}
                  </div>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      Session Remaining:
                    </span>
                    <span
                      className={`font-mono text-sm font-extrabold ${
                        countdown.expired
                          ? 'text-rose-400'
                          : countdown.approaching
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {countdown.hms}
                    </span>
                  </div>
                </div>

                {/* PIN Display with Show/Hide Toggle */}
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
                      Backup Kiosk / Phone PIN
                    </span>
                    <span className="font-mono text-xl font-black tracking-[0.25em] text-amber-400">
                      {displayPin ? (showPin ? displayPin : '••••••') : 'LINKED'}
                    </span>
                  </div>
                  {displayPin && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPin((v) => !v)}
                      className="h-8 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-white/10 gap-1.5"
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {showPin ? 'Hide PIN' : 'Show PIN'}
                    </Button>
                  )}
                </div>

                {/* iOS-Style Slide-to-Unlock Track + Accessible Tap-to-Open Button */}
                <div className="space-y-3">
                  <div
                    ref={sliderTrackRef}
                    onPointerDown={handlePointerDownSlider}
                    onPointerMove={handlePointerMoveSlider}
                    onPointerUp={handlePointerUpSlider}
                    onPointerCancel={handlePointerUpSlider}
                    className="relative h-14 w-full rounded-full bg-zinc-900 border border-emerald-500/30 p-1 select-none touch-none overflow-hidden cursor-pointer shadow-inner"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-emerald-500/20 transition-all duration-75"
                      style={{ width: `${Math.round(slideProgress * 100)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-xs font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-1">
                        {isBusy ? 'Sending Unlock Pulse...' : 'Slide to Unlock Door'}
                        <ChevronRight className="h-4 w-4 text-emerald-400 animate-pulse" />
                      </span>
                    </div>
                    <div
                      style={{
                        transform: `translateX(${
                          sliderTrackRef.current
                            ? Math.round(
                                slideProgress *
                                  Math.max(0, sliderTrackRef.current.clientWidth - 64)
                              )
                            : 0
                        }px)`,
                      }}
                      className="relative z-10 h-12 w-14 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center shadow-lg transition-transform duration-75"
                    >
                      <Unlock className="h-5 w-5 stroke-[2.5]" />
                    </div>
                  </div>

                  <Button
                    type="button"
                    disabled={isBusy}
                    onClick={handleOpenInzanLocker}
                    className="w-full h-11 font-black text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white gap-2 rounded-xl shadow-md"
                  >
                    <Unlock className="h-4 w-4" />
                    {isBusy ? 'Unlocking Locker...' : `Tap to Open Locker ${activeLockerName}`}
                  </Button>
                </div>

                {/* Extend +1h & Vacate / End Session Controls */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={handleExtendInzanLocker}
                    className="h-10 text-xs font-bold border-white/15 bg-white/5 hover:bg-white/10 text-white gap-1.5 rounded-xl"
                  >
                    <Clock className="h-3.5 w-3.5 text-sky-400" />
                    Extend +1h
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={handleVacateInzanLocker}
                    className="h-10 text-xs font-bold border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 gap-1.5 rounded-xl"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Vacate / End Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* STATE B: Member does NOT have an active locker yet */
          <Card className="border bg-card/60 shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted">
                <button
                  type="button"
                  onClick={() => setUnassignedTab('claim')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    unassignedTab === 'claim'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Get a Smart Locker Now
                </button>
                <button
                  type="button"
                  onClick={() => setUnassignedTab('pin')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    unassignedTab === 'pin'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Have a Kiosk / Reception PIN?
                </button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {unassignedTab === 'claim' ? (
                /* Tab 1: Instant Self-Service Allocation */
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Instant Smart Locker Allocation
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Select your locker room zone below to immediately claim an online locker and activate your phone key.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Men's Zone Card */}
                    <button
                      type="button"
                      disabled={isBusy || (menGroup ? menGroup.availableOnline <= 0 : false)}
                      onClick={() => handleClaimInzanLocker(menGroup?.id, 'Male')}
                      className="group text-left p-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-sky-500">
                          Men&apos;s Locker Zone
                        </span>
                        <Badge className="bg-sky-600 text-white text-[10px] font-bold">
                          {menGroup ? `${menGroup.availableOnline} Available` : 'Online'}
                        </Badge>
                      </div>
                      <p className="text-lg font-extrabold text-foreground">
                        Claim Men&apos;s Locker →
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {menGroup
                          ? `${menGroup.availableOnline} of ${menGroup.total} lockers online & ready`
                          : 'Tap to allocate an available Men’s locker'}
                      </p>
                    </button>

                    {/* Women's Zone Card */}
                    <button
                      type="button"
                      disabled={isBusy || (womenGroup ? womenGroup.availableOnline <= 0 : false)}
                      onClick={() => handleClaimInzanLocker(womenGroup?.id, 'Female')}
                      className="group text-left p-4 rounded-2xl border border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-pink-500">
                          Women&apos;s Locker Zone
                        </span>
                        <Badge className="bg-pink-600 text-white text-[10px] font-bold">
                          {womenGroup ? `${womenGroup.availableOnline} Available` : 'Online'}
                        </Badge>
                      </div>
                      <p className="text-lg font-extrabold text-foreground">
                        Claim Women&apos;s Locker →
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {womenGroup
                          ? `${womenGroup.availableOnline} of ${womenGroup.total} lockers online & ready`
                          : 'Tap to allocate an available Women’s locker'}
                      </p>
                    </button>
                  </div>
                </div>
              ) : (
                /* Tab 2: Interactive 0-9 PIN Pad to Link Kiosk / Reception PIN */
                <form onSubmit={handleLinkByPinSubmit} className="space-y-4">
                  <div className="space-y-1 text-center">
                    <h3 className="text-sm font-bold flex items-center justify-center gap-1.5">
                      <Key className="h-4 w-4 text-primary" />
                      Link Kiosk or Reception PIN
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Got a 6-digit PIN from the locker room kiosk or front desk? Enter it below to link the locker to your phone.
                    </p>
                  </div>

                  {/* PIN Display Box */}
                  <div className="h-14 rounded-2xl border border-border bg-background flex items-center justify-center px-4">
                    <span className="font-mono text-2xl font-black tracking-[0.35em] text-foreground">
                      {pinDigits || '••••••'}
                    </span>
                  </div>

                  {/* Interactive 0-9 Keypad */}
                  <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <Button
                        key={digit}
                        type="button"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => handlePinPadDigit(digit)}
                        className="h-12 text-lg font-black rounded-xl"
                      >
                        {digit}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isBusy || pinDigits.length === 0}
                      onClick={() => setPinDigits('')}
                      className="h-12 text-xs font-bold rounded-xl text-muted-foreground"
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => handlePinPadDigit('0')}
                      className="h-12 text-lg font-black rounded-xl"
                    >
                      0
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isBusy || pinDigits.length === 0}
                      onClick={handlePinPadBackspace}
                      className="h-12 rounded-xl flex items-center justify-center"
                    >
                      <Delete className="h-5 w-5" />
                    </Button>
                  </div>

                  <Button
                    type="submit"
                    disabled={isBusy || pinDigits.length < 4}
                    className="w-full h-11 font-bold rounded-xl"
                  >
                    {isBusy ? 'Linking Locker...' : 'Link Locker to Phone'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Security Guidance Card */}
        <Card className="border border-dashed bg-muted/20">
          <CardContent className="p-4 flex gap-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-foreground block">
                {companyDisplayName} Smart Locker Key
              </span>
              <p>
                Your phone key and backup PIN unlock your assigned locker for the duration of your workout session. Tap &ldquo;Vacate / End Session&rdquo; when leaving so the locker is released for fellow members.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================================
  // STANDARD TENANT LOCKER VIEW (Dynamic Branding & Branches)
  // ============================================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" /> Smart Locker Integration
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          View your assigned gym locker details or request lockbox access.
        </p>
      </div>

      {assignedLocker ? (
        /* Assigned Locker Details */
        <div className="relative group overflow-hidden rounded-3xl p-0.5 bg-gradient-to-br from-primary via-primary/30 to-background/50 shadow-2xl">
          <div className="absolute inset-0 bg-grid-white/[0.02] rounded-3xl" />

          <Card className="relative border-0 rounded-[22px] overflow-hidden bg-zinc-950 text-white shadow-none">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
            <CardContent className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">
                    {companyDisplayName}
                  </p>
                  <p className="text-xs font-mono text-primary mt-0.5">SMART LOCKER ACCESS</p>
                </div>
                <Badge
                  className="px-2.5 py-0.5 text-[10px] font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  variant="outline"
                >
                  ACTIVE ASSIGNMENT
                </Badge>
              </div>

              {/* Locker info */}
              <div className="flex flex-col items-center py-4 space-y-2">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 text-primary">
                  <Key className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest block">
                    Locker Number
                  </span>
                  <span className="text-3xl font-extrabold tracking-tight text-white">
                    {assignedLocker.number}
                  </span>
                </div>
              </div>

              {/* Digital Lock PIN and Location details */}
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">
                    LOCK PIN
                  </span>
                  <strong className="text-xl font-mono tracking-widest text-primary">
                    {assignedLocker.code || '----'}
                  </strong>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">
                    BRANCH LOCATION
                  </span>
                  <span className="text-xs font-semibold text-zinc-300 uppercase">
                    {assignedLocker.branch}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : pendingRequest ? (
        /* Request Pending Review */
        <Card className="border bg-card/40 shadow-sm">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <HelpCircle className="h-6 w-6 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold">Locker Assignment Pending</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px]">
                Your request for a locker at the <strong>{pendingRequest.branch}</strong> branch has
                been submitted and is currently pending administrator approval.
              </p>
            </div>
            <Badge
              variant="outline"
              className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs px-3 py-1 font-semibold rounded-full"
            >
              STATUS: PENDING APPROVAL
            </Badge>
          </CardContent>
        </Card>
      ) : (
        /* Locker Request Form */
        <Card className="border bg-card/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Request Locker Access
            </CardTitle>
            <CardDescription className="text-[11px]">
              Request a designated physical locker for storing your sports gear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRequestLocker} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="branchSelect" className="text-xs font-bold text-muted-foreground">
                  Choose Branch Location
                </Label>
                <Select
                  value={selectedBranch}
                  onValueChange={(val) => setSelectedBranch(val || '')}
                  required
                >
                  <SelectTrigger id="branchSelect" className="bg-background">
                    <SelectValue placeholder="Select target branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((br) => (
                      <SelectItem key={br} value={br}>
                        {br} Branch
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {submitSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Request submitted successfully! Admins will assign a locker shortly.
                  </span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !selectedBranch}
                className="w-full font-bold"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Security Guidance Card */}
      <Card className="border border-dashed bg-muted/20">
        <CardContent className="p-4 flex gap-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-foreground block">Digital Lock System</span>
            <p>
              Smart lockers use digital pin locks. Keep your lock PIN private. To open your locker,
              enter your 4-digit code on the lock keypad followed by the key symbol.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
