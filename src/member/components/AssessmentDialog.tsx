import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { db, getTenantId } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Client, User, AssessmentTimePeriod, AssessmentAgeGroup, AssessmentMembershipType, AssessmentReferralSource } from '../../types';
import { Clock, ShieldAlert, Sparkles, CheckCircle2, User as UserIcon, Phone, AlertCircle, Calendar, MessageSquare, Award } from 'lucide-react';

interface AssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  coaches: User[];
}

const AGE_OPTIONS: AssessmentAgeGroup[] = [
  'Under 16',
  '16 to 21',
  '21 to 30',
  '30 to 45',
  'Above 45',
];

const MEMBERSHIP_TYPE_OPTIONS: AssessmentMembershipType[] = [
  'Premium Annual',
  'Basic Annual',
  '6 Months',
  '3 Months',
  '1 Month',
  'Youth [Under 16]',
  'Guest',
];

const REFERRAL_OPTIONS: AssessmentReferralSource[] = [
  'Social Media',
  'Floor Service',
  'A Friend',
  'Sales person',
];

export function AssessmentDialog({ open, onOpenChange, client, coaches }: AssessmentDialogProps) {
  const tenantId = getTenantId().toLowerCase();
  const isInzan = tenantId.includes('inzan') || tenantId === 'db-inzanathletics' || tenantId === 'default' || tenantId === 'test';

  // Form states
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [membershipId, setMembershipId] = useState<string>('Guest');
  const [timePeriod, setTimePeriod] = useState<AssessmentTimePeriod>('Morning [8AM - 4PM]');
  const [preferredHour, setPreferredHour] = useState<string>('10:00 AM');
  const [ageGroup, setAgeGroup] = useState<AssessmentAgeGroup>('21 to 30');
  const [membershipType, setMembershipType] = useState<AssessmentMembershipType>('1 Month');
  const [notes, setNotes] = useState<string>('');
  const [hasCoachPreference, setHasCoachPreference] = useState<'Yes' | 'No'>('No');
  const [coachName, setCoachName] = useState<string>('');
  const [preferredCoachId, setPreferredCoachId] = useState<string>('any');
  const [referralSource, setReferralSource] = useState<AssessmentReferralSource>('Floor Service');
  
  // Non-inzan legacy states
  const [preferredDate, setPreferredDate] = useState<string>('');
  const [preferredTime, setPreferredTime] = useState<string>('');
  const [goals, setGoals] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pre-fill initial client data when dialog opens
  useEffect(() => {
    if (open && client) {
      setFullName(client.name || '');
      setPhone(client.phone || '');
      const rawId = (client as any).memberId || (client as any).clientRecordId || (client as any).customId || '';
      setMembershipId(rawId ? String(rawId) : 'Guest');
      setErrorMessage(null);
    }
  }, [open, client]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (isInzan) {
      if (!fullName.trim()) {
        setErrorMessage('Full Name is required.');
        return;
      }
      if (!phone.trim()) {
        setErrorMessage('Phone Number (with WhatsApp) is required.');
        return;
      }
      if (!membershipId.trim()) {
        setErrorMessage('Membership ID is required (enter Guest if none).');
        return;
      }
      if (!preferredHour.trim()) {
        setErrorMessage('Preferred Hour is required.');
        return;
      }
      if (hasCoachPreference === 'Yes' && !coachName.trim()) {
        setErrorMessage('Please provide the name of the coach you prefer.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let resolvedCoachId: string | null = null;
      let resolvedCoachName = 'Any Coach';

      if (hasCoachPreference === 'Yes' || preferredCoachId !== 'any') {
        if (preferredCoachId !== 'any') {
          resolvedCoachId = preferredCoachId;
          const found = coaches.find(c => c.id === preferredCoachId);
          if (found) resolvedCoachName = found.name;
        } else if (coachName.trim()) {
          resolvedCoachName = coachName.trim();
          const match = coaches.find(c => c.name.toLowerCase() === coachName.trim().toLowerCase());
          if (match) resolvedCoachId = match.id;
        }
      }

      await addDoc(collection(db, 'assessments'), {
        clientId: client.id || 'guest',
        clientName: fullName.trim() || client.name || 'Anonymous',
        phone: phone.trim() || client.phone || '',
        membershipId: membershipId.trim() || 'Guest',
        timePeriod: isInzan ? timePeriod : (preferredTime || 'Any'),
        preferredHour: isInzan ? preferredHour.trim() : (preferredTime || ''),
        ageGroup: isInzan ? ageGroup : undefined,
        membershipType: isInzan ? membershipType : undefined,
        notes: notes.trim(),
        injuries: notes.trim(),
        goals: goals.trim() || undefined,
        hasCoachPreference: hasCoachPreference === 'Yes',
        coachName: hasCoachPreference === 'Yes' ? (coachName.trim() || resolvedCoachName) : undefined,
        referralSource: hasCoachPreference === 'Yes' ? referralSource : undefined,
        preferredCoachId: resolvedCoachId,
        preferredCoachName: hasCoachPreference === 'Yes' ? (resolvedCoachName || coachName) : 'Any Coach',
        preferredDate: isInzan ? timePeriod : (preferredDate || ''),
        preferredTime: isInzan ? preferredHour : (preferredTime || ''),
        status: 'Pending',
        tenantId: getTenantId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
        setNotes('');
        setGoals('');
        setErrorMessage(null);
      }, 2200);
    } catch (error) {
      console.error("Error submitting assessment:", error);
      setErrorMessage("Failed to submit assessment request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold px-2.5 py-0.5">
              {isInzan ? 'INZAN ATHLETICS' : 'ASSESSMENT'}
            </Badge>
            <span className="text-xs text-muted-foreground">• Private Training</span>
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight mt-1">Assessment Request</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Fill out this form to book your fitness assessment. A coach will review your request and reach out to confirm your session slot.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-12 px-6 text-center space-y-4">
            <div className="h-16 w-16 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold">Assessment Request Submitted!</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Thank you for your submission. You are now on our priority waiting list. Our coaching team will contact you via WhatsApp shortly!
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              {/* Guidelines / Policy Callout Box */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-2.5">
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span>Important Private Training Policies</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground leading-relaxed">
                  <p>• <strong>Basic Membership:</strong> 3 sessions (valid 1 week).</p>
                  <p>• <strong>Premium Membership:</strong> 6 sessions (valid 2 weeks).</p>
                  <p>• <strong>Freezing:</strong> Not allowed for free sessions (max 1 week for paid).</p>
                  <p>• <strong>Expiry:</strong> PT packages expire within 1 month.</p>
                </div>
                <p className="text-[11px] text-primary/80 italic pt-1 border-t border-primary/10">
                  * Note: The fitness assessment is complimentary and does not count as one of your paid sessions.
                </p>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Personal Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-primary" /> Member Information
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="full-name" className="text-xs font-medium">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="full-name"
                      placeholder="e.g. John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-9 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone-number" className="text-xs font-medium flex items-center justify-between">
                      <span>Phone Number <span className="text-destructive">*</span></span>
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">Must have WhatsApp</span>
                    </Label>
                    <Input
                      id="phone-number"
                      placeholder="e.g. +20 100 000 0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-9 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="membership-id" className="text-xs font-medium">
                      Membership ID <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="membership-id"
                      placeholder="If none type Guest"
                      value={membershipId}
                      onChange={(e) => setMembershipId(e.target.value)}
                      className="h-9 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Age <span className="text-destructive">*</span>
                    </Label>
                    <Select value={ageGroup} onValueChange={(val: string | null) => val && setAgeGroup(val as AssessmentAgeGroup)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select age group" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Membership Type <span className="text-destructive">*</span>
                    </Label>
                    <Select value={membershipType} onValueChange={(val: string | null) => val && setMembershipType(val as AssessmentMembershipType)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBERSHIP_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Timing & Shift Preferences */}
              <div className="space-y-3 pt-2 border-t">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" /> Preferred Schedule & Time
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Time Shift <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTimePeriod('Morning [8AM - 4PM]')}
                        className={`h-9 px-2.5 rounded-lg border text-xs font-medium transition-all text-center flex items-center justify-center ${
                          timePeriod === 'Morning [8AM - 4PM]'
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        Morning (8AM - 4PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimePeriod('Night [4PM - 11PM]')}
                        className={`h-9 px-2.5 rounded-lg border text-xs font-medium transition-all text-center flex items-center justify-center ${
                          timePeriod === 'Night [4PM - 11PM]'
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        Night (4PM - 11PM)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="preferred-hour" className="text-xs font-medium">
                      Preferred Hour <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="preferred-hour"
                      placeholder="e.g. 10:00 AM or 06:30 PM"
                      value={preferredHour}
                      onChange={(e) => setPreferredHour(e.target.value)}
                      className="h-9 text-sm"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Coach Preference Section */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-primary" /> Preferred Coach
                  </h4>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Is there any coach do you prefer ? <span className="text-destructive">*</span></Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="coachPref"
                        value="No"
                        checked={hasCoachPreference === 'No'}
                        onChange={() => setHasCoachPreference('No')}
                        className="accent-primary h-4 w-4"
                      />
                      <span>No (Any Available Coach)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="coachPref"
                        value="Yes"
                        checked={hasCoachPreference === 'Yes'}
                        onChange={() => setHasCoachPreference('Yes')}
                        className="accent-primary h-4 w-4"
                      />
                      <span>Yes (Specific Coach)</span>
                    </label>
                  </div>
                </div>

                {hasCoachPreference === 'Yes' && (
                  <div className="p-3.5 rounded-xl bg-muted/40 border space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="coach-name-input" className="text-xs font-medium">
                          Coach Name <span className="text-destructive">*</span>
                        </Label>
                        <div className="space-y-1.5">
                          <Select 
                            value={preferredCoachId} 
                            onValueChange={(val: string | null) => {
                              const v = val || 'any';
                              setPreferredCoachId(v);
                              if (v !== 'any') {
                                const found = coaches.find(c => c.id === v);
                                if (found) setCoachName(found.name);
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Choose coach or type below" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Select from staff list</SelectItem>
                              {coaches.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            id="coach-name-input"
                            placeholder="Or type coach name"
                            value={coachName}
                            onChange={(e) => setCoachName(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          How did you know about him/her <span className="text-destructive">*</span>
                        </Label>
                        <Select value={referralSource} onValueChange={(val: string | null) => val && setReferralSource(val as AssessmentReferralSource)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                          <SelectContent>
                            {REFERRAL_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Health, Injuries & Notes */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="assessment-notes" className="text-xs font-medium flex items-center justify-between">
                  <span>Notes & Health Conditions</span>
                  <span className="text-[11px] text-muted-foreground font-normal">Optional</span>
                </Label>
                <Textarea
                  id="assessment-notes"
                  placeholder="Kindly mention if you have any kind of injuries, or anything coach needs to know before the assessment..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-20 text-xs resize-none leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 flex items-center justify-between sm:justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="font-semibold px-5">
                {isSubmitting ? 'Submitting Request...' : 'Submit Assessment Request'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

