import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { auth, db } from '../../firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { Client, Package } from '../../types';
import { ClassSchedule } from '../../types/class';
import { 
  Calendar, Clock, MapPin, Users, CheckCircle2, AlertTriangle, 
  Dumbbell, ShoppingBag, CreditCard, Sparkles, Loader2, ArrowRight, Wallet
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ClassBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gymClass: ClassSchedule | null;
  client: Client | null;
  onBookingSuccess?: () => void;
  onSwitchToStore?: (packageId?: string) => void;
}

export function ClassBookingDialog({
  open,
  onOpenChange,
  gymClass,
  client,
  onBookingSuccess,
  onSwitchToStore,
}: ClassBookingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [selectedUpsellPkg, setSelectedUpsellPkg] = useState<Package | null>(null);
  const [isRequestingPass, setIsRequestingPass] = useState(false);
  const [passRequestSuccess, setPassRequestSuccess] = useState(false);

  // Reset state when dialog opens with a new class
  useEffect(() => {
    if (open && gymClass) {
      setIsSuccess(false);
      setErrorMessage(null);
      setSelectedUpsellPkg(null);
      setPassRequestSuccess(false);

      // If client needs a package, load available options
      if (!hasActiveCredits) {
        loadAvailablePackages();
      }
    }
  }, [open, gymClass?.id, client?.id]);

  const loadAvailablePackages = async () => {
    setLoadingPackages(true);
    try {
      const snap = await getDocs(collection(db, 'packages'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Package));
      
      // Filter out corporate/group packages
      const filtered = list.filter(p => {
        const name = (p.name || '').toLowerCase();
        return !name.includes('corporate') && !name.includes('company') && p.type !== 'Group';
      });

      // Prioritize packages matching class branch or session counts (Drop-in, 8, 12, Unlimited)
      filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
      setAvailablePackages(filtered.slice(0, 6));
      if (filtered.length > 0) {
        setSelectedUpsellPkg(filtered[0] || null);
      }
    } catch (err) {
      console.error("Error loading packages for booking upsell:", err);
    } finally {
      setLoadingPackages(false);
    }
  };

  if (!gymClass || !client) return null;

  const isBooked = (gymClass.attendees || []).includes(client.id);
  const isWaitlisted = (gymClass.waitlist || []).includes(client.id);
  const isFull = (gymClass.attendees || []).length >= gymClass.capacity;
  const spotsLeft = Math.max(0, gymClass.capacity - (gymClass.attendees || []).length);

  // ── Credit & Package Verification ──
  const activePackages = (client.packages || []).filter(p => {
    if (p.status !== 'Active' || p.isOnHold) return false;
    if (p.endDate) {
      try {
        if (new Date(p.endDate) < new Date()) return false;
      } catch { /* ignore */ }
    }
    const hasRemaining = typeof p.sessionsRemaining === 'number' ? p.sessionsRemaining > 0 : true;
    const isUnlimited = false;
    return hasRemaining || isUnlimited;
  });

  const matchingPackage = activePackages[0] || null;
  const hasActiveCredits = activePackages.length > 0;

  const formatClassTime = () => {
    try {
      const start = new Date(gymClass.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const end = new Date(gymClass.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${start} - ${end}`;
    } catch {
      return (gymClass as any).time || 'Class Session';
    }
  };

  const formatClassDate = () => {
    try {
      const dateStr = gymClass.startTime ? gymClass.startTime.substring(0, 10) : (gymClass as any).date;
      return format(parseISO(dateStr), 'EEEE, dd MMMM yyyy');
    } catch {
      return (gymClass as any).date || 'Scheduled Date';
    }
  };

  const handleConfirmBooking = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/classes/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          classId: gymClass.id,
          action: isWaitlisted || isBooked ? 'leave' : 'join',
          clientId: client.id,
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete booking. Please try again.");
      }

      setIsSuccess(true);
      if (onBookingSuccess) onBookingSuccess();
    } catch (err: any) {
      console.error("Booking error:", err);
      setErrorMessage(err.message || "Failed to confirm class. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestFrontDeskPass = async () => {
    if (!selectedUpsellPkg) return;
    setIsRequestingPass(true);
    try {
      await addDoc(collection(db, 'bookingRequests'), {
        clientId: client.id,
        clientName: client.name || 'Member',
        clientPhone: client.phone || '',
        clientEmail: client.email || '',
        classId: gymClass.id,
        className: gymClass.name,
        classDate: (gymClass as any).date || gymClass.startTime?.substring(0, 10),
        classTime: (gymClass as any).time || formatClassTime(),
        packageId: selectedUpsellPkg.id,
        packageName: selectedUpsellPkg.name,
        packagePrice: selectedUpsellPkg.price,
        type: 'package_booking_request',
        status: 'Pending',
        createdAt: new Date().toISOString()
      });
      setPassRequestSuccess(true);
    } catch (err) {
      console.error("Error creating pass request:", err);
      setErrorMessage("Failed to send request. Please contact front desk.");
    } finally {
      setIsRequestingPass(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[95vw] rounded-3xl p-6 bg-card border shadow-2xl">
        {isSuccess ? (
          <div className="py-6 text-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="h-16 w-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-xl font-black uppercase tracking-tight">
                {isWaitlisted ? 'Waitlist Confirmed!' : 'Booking Confirmed!'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isWaitlisted 
                  ? `You are in line for ${gymClass.name}. We will notify you if a spot opens up.`
                  : `You're all set for ${gymClass.name} on ${formatClassDate()}.`}
              </DialogDescription>
            </DialogHeader>

            <div className="bg-muted/30 border rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Class</span>
                <span className="font-bold text-foreground">{gymClass.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-bold text-primary">{gymClass.branch}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-bold">{formatClassTime()}</span>
              </div>
              {matchingPackage && (
                <div className="flex items-center justify-between pt-2 border-t text-[11px]">
                  <span className="text-muted-foreground">Used Package</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{matchingPackage.packageName}</span>
                </div>
              )}
            </div>

            <Button
              className="w-full h-11 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader className="space-y-1.5 text-left">
              <div className="flex items-center gap-2">
                <Badge variant={gymClass.category === 'Event' ? 'default' : 'secondary'} className="text-[9px] uppercase tracking-wider h-5 px-2">
                  {gymClass.category || 'Class'}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-bold text-primary border-primary/20">
                  {gymClass.branch}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">
                {gymClass.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Review your session details and package credit balance below.
              </DialogDescription>
            </DialogHeader>

            {/* ── Class Information Card ── */}
            <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span>{formatClassDate()}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Clock className="h-4 w-4 text-primary shrink-0" />
                <span>{formatClassTime()}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/40 text-muted-foreground text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>{(gymClass.attendees || []).length} / {gymClass.capacity} Spots Booked</span>
                </div>
                {spotsLeft <= 3 && spotsLeft > 0 && (
                  <Badge className="bg-strike-green/10 text-strike-green border-strike-green/20 text-[9px] font-bold">
                    {spotsLeft} spots left!
                  </Badge>
                )}
                {isFull && (
                  <Badge variant="secondary" className="text-[9px] font-bold text-yellow-600 bg-yellow-500/10">
                    Class Full (Waitlist Open)
                  </Badge>
                )}
              </div>
            </div>

            {/* ── Scenario 1: Member HAS Active Credits ── */}
            {hasActiveCredits ? (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Active Package Found
                    </span>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-[10px] font-bold">
                      {matchingPackage?.sessionsRemaining !== undefined 
                        ? `${matchingPackage.sessionsRemaining} Credits Left` 
                        : 'Unlimited Pass'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Package: <strong>{matchingPackage?.packageName}</strong>. 1 credit will be used to reserve your spot.
                  </p>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="w-1/3 h-11 rounded-xl text-xs font-bold"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="w-2/3 h-11 rounded-xl text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                    onClick={handleConfirmBooking}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isFull ? (
                      'Join Waitlist'
                    ) : (
                      'Confirm Booking'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Scenario 2: Member NEEDS a Package / 0 Credits ── */
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 space-y-1.5 text-xs text-left">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>No Active Class Package / Credits</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    You need a valid class package or session pass to attend this workout at <strong>{gymClass.branch}</strong>. Select an option below:
                  </p>
                </div>

                {passRequestSuccess ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center space-y-2">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                    <p className="text-xs font-bold text-foreground">Pass Request Sent to Front Desk!</p>
                    <p className="text-[10px] text-muted-foreground">
                      Our front desk team has received your request for <strong>{selectedUpsellPkg?.name}</strong> and will reserve your spot.
                    </p>
                    <Button size="sm" variant="outline" className="h-8 text-xs font-bold mt-2" onClick={() => onOpenChange(false)}>
                      Close
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Recommended Package Selector */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                        <span>Select a Package / Pass:</span>
                        {onSwitchToStore && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false);
                              onSwitchToStore();
                            }}
                            className="text-primary hover:underline text-[11px] flex items-center gap-1 font-semibold"
                          >
                            View All Packages <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {loadingPackages ? (
                        <div className="py-6 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : availablePackages.length === 0 ? (
                        <div className="p-4 border border-dashed rounded-xl text-center text-xs text-muted-foreground">
                          Please visit our store to choose a membership package.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                          {availablePackages.map(pkg => {
                            const isSelected = selectedUpsellPkg?.id === pkg.id;
                            return (
                              <div
                                key={pkg.id}
                                onClick={() => setSelectedUpsellPkg(pkg)}
                                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                                  isSelected 
                                    ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary' 
                                    : 'bg-card/60 border-border hover:bg-muted/50'
                                }`}
                              >
                                <div>
                                  <p className="font-extrabold text-foreground uppercase text-[11px]">{pkg.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{pkg.sessions} Sessions • {pkg.expiryDays} Days</p>
                                </div>
                                <div className="text-right">
                                  <span className="font-black text-xs text-primary">{pkg.price.toLocaleString()} LE</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {errorMessage && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* Action Buttons for Scenario 2 */}
                    <div className="space-y-2 pt-1">
                      {onSwitchToStore && selectedUpsellPkg && (
                        <Button
                          className="w-full h-11 rounded-xl text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center gap-2"
                          onClick={() => {
                            onOpenChange(false);
                            onSwitchToStore(selectedUpsellPkg.id);
                          }}
                        >
                          <ShoppingBag className="h-4 w-4" /> Buy {selectedUpsellPkg.name} ({selectedUpsellPkg.price.toLocaleString()} LE)
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        className="w-full h-10 rounded-xl text-xs font-bold border-border/80 text-muted-foreground hover:text-foreground"
                        onClick={handleRequestFrontDeskPass}
                        disabled={isRequestingPass || !selectedUpsellPkg}
                      >
                        {isRequestingPass ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5 mr-2" />
                        )}
                        Request Pass at Front Desk
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
