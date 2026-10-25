import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Phone,
  PhoneCall,
  Smartphone,
  BellRing,
  Copy,
  CheckCircle2,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  PhoneOff,
  Star,
  CalendarDays,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppContext } from '../context';
import { CallCenterLog, InteractionOutcome } from '../types';
import {
  CallRequestRecord,
  ClickToCallModalTarget,
  initiateClickToCall,
  isMobileDeviceSession,
  normalizeDialPhone,
  showDeviceClickToCallNotification,
  subscribeToCallRequest,
  subscribeToIncomingCallRequests,
  triggerLocalDeviceDialer,
  updateCallRequestStatus,
} from '../services/clickToCallService';

function playIncomingCallChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.75);
    gain.connect(ctx.destination);

    [784, 987.77, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
      osc.connect(gain);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.2);
    });
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

const QUICK_OUTCOMES = [
  { label: 'Interested', outcome: 'Interested' as InteractionOutcome, callType: 'Interested' as const, icon: ThumbsUp },
  { label: 'Answer', outcome: 'Interested' as InteractionOutcome, callType: 'Answer' as const, icon: PhoneCall },
  { label: 'No Answer', outcome: 'Not Answered' as InteractionOutcome, callType: 'No Answer' as const, icon: PhoneOff },
  { label: 'Follow Up', outcome: 'Scheduled Trial' as InteractionOutcome, callType: 'Follow Up' as const, icon: Star },
  { label: 'Call Later', outcome: 'Other' as InteractionOutcome, callType: 'Call Later' as const, icon: CalendarDays },
  { label: 'Not Interested', outcome: 'Rejected' as InteractionOutcome, callType: 'Not Interested' as const, icon: ThumbsDown },
] as const;

export function ClickToCallModal() {
  const { currentUser, addInteraction, addComment } = useAppContext();

  // Declare all useState hooks before any useEffect (prevents TDZ minification issues)
  const [target, setTarget] = useState<ClickToCallModalTarget | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const [callRequest, setCallRequest] = useState<CallRequestRecord | null>(null);
  const [selectedOutcomeLabel, setSelectedOutcomeLabel] = useState<string>('Interested');
  const [callNotes, setCallNotes] = useState<string>('');
  const [reminderDate, setReminderDate] = useState<string>('');
  const [isSavingOutcome, setIsSavingOutcome] = useState<boolean>(false);
  const [incomingMobileCall, setIncomingMobileCall] = useState<CallRequestRecord | null>(null);

  const formattedPhone = normalizeDialPhone(selectedPhone || target?.phone || '');

  const handleClose = useCallback(() => {
    if (activeRequestId && callRequest?.status === 'pending') {
      void updateCallRequestStatus(activeRequestId, 'cancelled', {
        ...(activeNotificationId ? { notificationId: activeNotificationId } : {}),
      });
    }
    setTarget(null);
    setSelectedPhone('');
    setIsDispatching(false);
    setActiveRequestId(null);
    setActiveNotificationId(null);
    setCallRequest(null);
    setCallNotes('');
    setReminderDate('');
  }, [activeRequestId, activeNotificationId, callRequest?.status]);

  const handleCallNow = useCallback(async (phoneOverride?: string) => {
    const rawToDial = phoneOverride || selectedPhone || target?.phone || '';
    const e164 = normalizeDialPhone(rawToDial);
    if (!e164) {
      toast.error('No valid phone number to dial.');
      return;
    }

    // If the user is already on a mobile phone or inside the native mobile app, dial immediately
    if (isMobileDeviceSession()) {
      triggerLocalDeviceDialer(e164, target?.name);
      toast.success(`Dialing ${e164}...`);
      return;
    }

    if (!currentUser?.id) {
      triggerLocalDeviceDialer(e164, target?.name);
      return;
    }

    setIsDispatching(true);
    try {
      const result = await initiateClickToCall({
        salespersonId: currentUser.id,
        salespersonName: currentUser.name || currentUser.email || 'Sales Rep',
        clientId: target?.clientId,
        memberId: target?.memberId,
        leadName: target?.name || 'Member',
        phoneNumber: e164,
      });

      setActiveRequestId(result.requestId);
      setActiveNotificationId(result.notificationId);
      setCallRequest({
        id: result.requestId,
        notificationId: result.notificationId,
        tenantId: '',
        salespersonId: currentUser.id,
        salespersonName: currentUser.name || currentUser.email || 'Sales Rep',
        clientId: target?.clientId,
        memberId: target?.memberId,
        leadName: target?.name || 'Member',
        phoneNumber: e164,
        rawPhone: rawToDial,
        status: 'pending',
        pushSent: result.pushSent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAtMs: Date.now() + 120000,
      });

      toast.success(`Click-to-Call notification sent to your logged-in mobile device (${e164})`);
    } catch (err) {
      console.error('[ClickToCall] Failed to dispatch call:', err);
      toast.error('Failed to send Click-to-Call notification to mobile device.');
    } finally {
      setIsDispatching(false);
    }
  }, [currentUser, selectedPhone, target]);

  // Listen for global `crm:open-click-to-call` events
  useEffect(() => {
    const handleOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<ClickToCallModalTarget>).detail;
      if (!detail || !detail.phone) return;
      setTarget(detail);
      setSelectedPhone(detail.phone);
      setActiveRequestId(null);
      setActiveNotificationId(null);
      setCallRequest(null);
      setCallNotes('');
      setReminderDate('');
    };

    window.addEventListener('crm:open-click-to-call', handleOpenEvent);
    return () => window.removeEventListener('crm:open-click-to-call', handleOpenEvent);
  }, []);

  // Subscribe to the active callRequest document on the laptop to track mobile acknowledgement
  useEffect(() => {
    if (!activeRequestId) return;
    const unsub = subscribeToCallRequest(activeRequestId, (record) => {
      if (record) {
        setCallRequest(record);
      }
    });

    return () => {
      unsub();
    };
  }, [activeRequestId]);

  // Receiver Listener: when logged in on another device (mobile phone / app / PWA), listen for incoming click-to-call notifications
  useEffect(() => {
    if (!currentUser?.id) return;
    const isStaff = ['rep', 'manager', 'admin', 'super_admin', 'crm_admin', 'coach', 'staff'].includes(
      String(currentUser.role || '').toLowerCase()
    );
    if (!isStaff) return;

    const unsub = subscribeToIncomingCallRequests(currentUser.id, (record) => {
      setIncomingMobileCall(record);
      playIncomingCallChime();
      void showDeviceClickToCallNotification(record);
      void updateCallRequestStatus(record.id, 'ringing_device', {
        ...(record.notificationId ? { notificationId: record.notificationId } : {}),
      });
      // If on mobile / native Expo app, attempt immediate native dialer launch
      if (isMobileDeviceSession()) {
        triggerLocalDeviceDialer(record.phoneNumber, record.leadName, record.id);
      }
    });

    return () => unsub();
  }, [currentUser?.id, currentUser?.role]);

  const handleSaveDisposition = async () => {
    if (!target) return;
    const chosen = QUICK_OUTCOMES.find((o) => o.label === selectedOutcomeLabel) || QUICK_OUTCOMES[0];
    const noteText = callNotes.trim() || `Click-to-Call (${chosen.label}) to ${formattedPhone}`;

    setIsSavingOutcome(true);
    try {
      const nowIso = new Date().toISOString();
      const authorName = currentUser?.name || currentUser?.email || 'Sales Team';

      if (target.clientId) {
        await addInteraction(target.clientId, {
          type: 'Call',
          outcome: chosen.outcome,
          notes: noteText,
          date: nowIso,
          ...(reminderDate ? { nextFollowUp: reminderDate } : {}),
        });
        await addComment(target.clientId, `[Call - ${chosen.label}] ${noteText}`, authorName);
      }

      // Also record in callCenterLog for unified Call Center reporting
      const logId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cclog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const cooldownUntil =
        chosen.callType === 'Not Interested'
          ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      const logEntry: CallCenterLog = {
        id: logId,
        clientDocId: target.clientId || '',
        memberId: target.memberId || target.clientId || '',
        memberName: target.name || 'Member',
        memberPhone: formattedPhone,
        memberStatus: target.status || 'Lead',
        packageData: target.packageType || '',
        callType: chosen.callType,
        comment: noteText,
        source: target.source || 'Click-to-Call',
        createdBy: currentUser?.id || '',
        createdByName: authorName,
        createdAt: nowIso,
        branch: target.branch || '',
        ...(cooldownUntil ? { cooldownUntil } : {}),
        ...(chosen.callType === 'Call Later' && reminderDate
          ? { reminderDate, reminderStatus: 'pending' as const }
          : {}),
      };

      await setDoc(doc(db, 'callCenterLog', logEntry.id), logEntry);

      if (activeRequestId) {
        await updateCallRequestStatus(activeRequestId, 'completed', {
          outcome: chosen.label,
          notes: noteText,
          ...(activeNotificationId ? { notificationId: activeNotificationId } : {}),
        });
      }

      toast.success('Call outcome logged!');
      handleClose();
    } catch (err) {
      console.error('[ClickToCall] Failed to save call outcome:', err);
      toast.error('Failed to save call log.');
    } finally {
      setIsSavingOutcome(false);
    }
  };

  const copyPhoneToClipboard = async () => {
    if (!formattedPhone) return;
    try {
      await navigator.clipboard.writeText(formattedPhone);
      toast.success(`Copied ${formattedPhone}`);
    } catch {
      toast.error('Could not copy phone number');
    }
  };

  return (
    <>
      {/* ── Mobile Companion Incoming Call Notification Banner (fires on logged-in mobile device when laptop clicks Call Now) ── */}
      {incomingMobileCall && (
        <div className="fixed inset-x-3 top-3 z-[9999] rounded-2xl border-2 border-blue-500 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur-lg animate-in fade-in slide-in-from-top-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white animate-pulse">
                <PhoneCall className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 block">
                  Incoming Click-to-Call Notification
                </span>
                <p className="text-base font-black truncate">{incomingMobileCall.leadName}</p>
                <p className="font-mono text-sm font-bold text-zinc-300">{incomingMobileCall.phoneNumber}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void updateCallRequestStatus(incomingMobileCall.id, 'cancelled', {
                  ...(incomingMobileCall.notificationId
                    ? { notificationId: incomingMobileCall.notificationId }
                    : {}),
                });
                setIncomingMobileCall(null);
              }}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={`tel:${incomingMobileCall.phoneNumber}`}
              onClick={(e) => {
                e.preventDefault();
                void updateCallRequestStatus(incomingMobileCall.id, 'dialing', {
                  ...(incomingMobileCall.notificationId
                    ? { notificationId: incomingMobileCall.notificationId }
                    : {}),
                });
                triggerLocalDeviceDialer(
                  incomingMobileCall.phoneNumber,
                  incomingMobileCall.leadName,
                  incomingMobileCall.id
                );
                setIncomingMobileCall(null);
              }}
              className="inline-flex h-11 items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 rounded-xl text-sm shadow-lg shadow-blue-600/30"
            >
              <Phone className="h-4 w-4" />
              Tap to Call Now
            </a>
            <Button
              variant="outline"
              className="h-11 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 font-semibold rounded-xl"
              onClick={() => setIncomingMobileCall(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* ── Laptop / Desktop Click-to-Call Modal ── */}
      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-6 text-center shadow-2xl border-border/60 bg-background">
          {target && (
            <div className="flex flex-col items-center space-y-4">
              {/* Circular Blue Phone Icon matching screenshot */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 shadow-inner">
                <Phone className="h-9 w-9 fill-current" />
              </div>

              {/* Phone Number & Member Info */}
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-2xl font-black tracking-tight text-foreground font-mono">
                    {formattedPhone || target.phone}
                  </h2>
                  <button
                    type="button"
                    onClick={copyPhoneToClipboard}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Copy phone number"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  Member mobile number · <span className="font-semibold text-foreground">{target.name}</span>
                </p>

                {/* Backup Phone Switcher if available */}
                {target.backupPhone && target.backupPhone !== target.phone && (
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedPhone(target.phone)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                        selectedPhone === target.phone
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-muted/50 text-muted-foreground border-border'
                      }`}
                    >
                      Primary: {target.phone}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPhone(target.backupPhone!)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                        selectedPhone === target.backupPhone
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-muted/50 text-muted-foreground border-border'
                      }`}
                    >
                      Backup: {target.backupPhone}
                    </button>
                  </div>
                )}
              </div>

              {/* Primary "Call Now" Button (pushes notification to logged-in mobile device) */}
              <div className="w-full space-y-2.5 pt-1">
                <Button
                  type="button"
                  disabled={isDispatching}
                  onClick={() => void handleCallNow()}
                  className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-600/25 gap-2 transition-all"
                >
                  {isDispatching ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending Notification to Your Phone...
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-5 w-5" />
                      Call Now
                    </>
                  )}
                </Button>

                {/* Real-Time Mobile Notification Delivery Status */}
                {callRequest && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 text-left space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {callRequest.status === 'pending' ? (
                          <BellRing className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-bounce shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-foreground">
                          {callRequest.status === 'pending' && 'Notification sent to your logged-in mobile device'}
                          {callRequest.status === 'ringing_device' && 'Delivered to your mobile device — tap notification to call'}
                          {callRequest.status === 'dialing' && 'Dialing on your mobile phone now!'}
                          {callRequest.status === 'completed' && 'Call completed'}
                          {callRequest.status === 'expired' && 'Notification expired — click Call Now to resend'}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                        {callRequest.status === 'pending'
                          ? 'Notified'
                          : callRequest.status === 'ringing_device'
                          ? 'Delivered'
                          : callRequest.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug pl-6">
                      Tap the Click-to-Call notification on your mobile phone to immediately dial{' '}
                      <span className="font-mono font-semibold text-foreground">{formattedPhone}</span>.
                    </p>
                  </div>
                )}

                {/* Quick Post-Call Disposition Logger */}
                {callRequest && (
                  <div className="rounded-xl border border-border bg-card p-3 text-left space-y-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Log Call Outcome
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_OUTCOMES.map((item) => {
                        const Icon = item.icon;
                        const active = selectedOutcomeLabel === item.label;
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              setSelectedOutcomeLabel(item.label);
                              if (item.callType === 'Call Later' && !reminderDate) {
                                setReminderDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
                              }
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border transition-all ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-muted/40 text-foreground border-border hover:bg-muted'
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    {selectedOutcomeLabel === 'Call Later' && (
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                          Next Follow-up / Reminder Date
                        </label>
                        <Input
                          type="date"
                          value={reminderDate}
                          onChange={(e) => setReminderDate(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    )}

                    <Textarea
                      placeholder="Add quick call notes (e.g. Interested in 3 Months package, visiting tomorrow at 6 PM)..."
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      rows={2}
                      className="text-xs resize-none"
                    />

                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingOutcome}
                      onClick={() => void handleSaveDisposition()}
                      className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                    >
                      {isSavingOutcome ? 'Saving Call Log...' : 'Save Call Outcome & Close'}
                    </Button>
                  </div>
                )}

                {/* Secondary "OK" / Close Button matching screenshot */}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  className="w-full h-11 rounded-xl bg-muted/70 hover:bg-muted text-foreground font-bold text-sm"
                >
                  OK
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
