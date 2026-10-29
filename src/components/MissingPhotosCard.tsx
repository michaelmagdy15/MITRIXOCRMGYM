import React, { useMemo, useState } from 'react';
import { Camera, ImageOff, MessageCircle, Phone, Search, Users, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Send, Copy, Clock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Client } from '../types';
import { useAppContext } from '../context';
import { buildWhatsAppPhotoReminderUrl, openWhatsAppUrl } from '../utils/whatsappTemplates';

export interface MissingPhotosCardProps {
  clients?: Client[];
  onSelectMember?: (clientId: string) => void;
  onNavigateToApprovals?: () => void;
}

export const MissingPhotosCard: React.FC<MissingPhotosCardProps> = ({
  clients: propClients,
  onSelectMember,
  onNavigateToApprovals,
}) => {
  const context = useAppContext();
  const allClients = propClients || context.clients || [];
  const { branding, setActiveTab, setActiveClientId } = context;

  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const [isNotifyAllOpen, setIsNotifyAllOpen] = useState(false);
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const clubName = branding?.companyName || 'Inzan Athletics';

  // Active members
  const activeMembers = useMemo(() => {
    return allClients.filter(c => c.status === 'Active');
  }, [allClients]);

  // Active members without photoURL
  const missingPhotoMembers = useMemo(() => {
    return activeMembers.filter(c => !c.photoURL || c.photoURL.trim() === '');
  }, [activeMembers]);

  // Active members with photo awaiting admin approval
  const pendingPhotoMembers = useMemo(() => {
    return activeMembers.filter(
      c => c.photoStatus === 'PENDING_APPROVAL' || (Boolean(c.pendingPhotoURL) && c.photoStatus !== 'APPROVED')
    );
  }, [activeMembers]);

  // Branches list for filter
  const branches = useMemo(() => {
    const set = new Set<string>();
    missingPhotoMembers.forEach(c => {
      if (c.branch) set.add(c.branch);
    });
    return Array.from(set);
  }, [missingPhotoMembers]);

  // Filtered missing photo members
  const filteredMissing = useMemo(() => {
    const q = search.trim().toLowerCase();
    return missingPhotoMembers.filter(c => {
      if (selectedBranch !== 'ALL' && c.branch !== selectedBranch) return false;
      if (!q) return true;
      return (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.memberId && c.memberId.toLowerCase().includes(q))
      );
    });
  }, [missingPhotoMembers, search, selectedBranch]);

  const totalPages = Math.max(1, Math.ceil(filteredMissing.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMissing.slice(start, start + pageSize);
  }, [filteredMissing, currentPage, pageSize]);

  // Photo compliance rate
  const complianceRate = useMemo(() => {
    if (activeMembers.length === 0) return 100;
    const withPhoto = activeMembers.length - missingPhotoMembers.length;
    return Math.round((withPhoto / activeMembers.length) * 100);
  }, [activeMembers, missingPhotoMembers]);

  const handleSelectMember = (clientId: string) => {
    if (onSelectMember) {
      onSelectMember(clientId);
    } else {
      setActiveClientId(clientId);
      setActiveTab('clients');
    }
  };

  const handleNavigateToApprovals = () => {
    if (onNavigateToApprovals) {
      onNavigateToApprovals();
    } else {
      setActiveTab('pending-approvals');
    }
  };

  const handleSendWhatsAppReminder = (client: Client) => {
    if (!client.phone) {
      toast.error('Member does not have a registered phone number.');
      return;
    }
    const waUrl = buildWhatsAppPhotoReminderUrl({
      clientName: client.name,
      clientPhone: client.phone,
      clubName,
    });
    if (!waUrl) {
      toast.error('Invalid phone number format for WhatsApp.');
      return;
    }
    openWhatsAppUrl(waUrl);
    toast.success(`Opening WhatsApp reminder for ${client.name}...`);
  };

  const handleSendSmsReminder = (client: Client) => {
    if (!client.phone) {
      toast.error('Member does not have a phone number.');
      return;
    }
    const cleanPhone = client.phone.replace(/\D/g, '');
    const message = `Hello ${client.name}, please upload your profile picture for ${clubName} gym access via the mobile app or visit the front desk. Thank you!`;
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_blank');
  };

  const handleCopyNumbers = () => {
    const phones = missingPhotoMembers
      .map(c => c.phone?.trim())
      .filter((p): p is string => Boolean(p && p.length > 5));
    const uniquePhones = Array.from(new Set(phones)).join(', ');
    navigator.clipboard.writeText(uniquePhones);
    setCopiedNumbers(true);
    toast.success(`Copied ${uniquePhones ? phones.length : 0} phone numbers to clipboard.`);
    setTimeout(() => setCopiedNumbers(false), 2500);
  };

  const handleCopyMessage = () => {
    const text = `Hello! To ensure fast, seamless check-ins and safety at ${clubName}, please upload your profile picture in our mobile app or visit the front desk during your next workout. Thank you for your cooperation!`;
    navigator.clipboard.writeText(text);
    setCopiedMessage(true);
    toast.success('Broadcast reminder message copied to clipboard.');
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  return (
    <>
      <Card className="rounded-3xl border border-border/60 shadow-sm overflow-hidden bg-card">
        <CardHeader className="pb-3 border-b border-border/40 bg-gradient-to-r from-violet-500/10 via-card to-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <span>Profile Photo Governance</span>
                  <Badge variant="outline" className="text-[10px] font-bold border-violet-500/40 text-violet-600 dark:text-violet-400">
                    {missingPhotoMembers.length} Missing
                  </Badge>
                  {pendingPhotoMembers.length > 0 && (
                    <Badge
                      onClick={handleNavigateToApprovals}
                      className="cursor-pointer bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors text-[10px] font-bold flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      {pendingPhotoMembers.length} Awaiting Approval
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Active members without profile picture for front desk facial recognition & check-ins
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNotifyAllOpen(true)}
                disabled={missingPhotoMembers.length === 0}
                className="gap-1.5 h-8 text-xs font-bold text-violet-600 dark:text-violet-400 border-violet-500/30 hover:bg-violet-500/10"
              >
                <Send className="h-3.5 w-3.5" />
                Notify All Missing ({missingPhotoMembers.length})
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <div className="bg-muted/40 p-2.5 rounded-xl border border-border/30">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Active Members</div>
              <div className="text-lg font-black">{activeMembers.length}</div>
            </div>
            <div className="bg-muted/40 p-2.5 rounded-xl border border-border/30">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Missing Photo</div>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400">{missingPhotoMembers.length}</div>
            </div>
            <div className="bg-muted/40 p-2.5 rounded-xl border border-border/30">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Compliance Rate</div>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{complianceRate}%</div>
            </div>
            <div className="bg-muted/40 p-2.5 rounded-xl border border-border/30">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Pending Review</div>
              <div className="text-lg font-black text-amber-600 dark:text-amber-400">{pendingPhotoMembers.length}</div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-3 space-y-3">
          {/* Controls: search and branch filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search member, phone, ID..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            {branches.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                <Button
                  size="sm"
                  variant={selectedBranch === 'ALL' ? 'default' : 'ghost'}
                  onClick={() => { setSelectedBranch('ALL'); setPage(1); }}
                  className="h-7 text-xs px-2.5"
                >
                  All Branches
                </Button>
                {branches.map(b => (
                  <Button
                    key={b}
                    size="sm"
                    variant={selectedBranch === b ? 'default' : 'ghost'}
                    onClick={() => { setSelectedBranch(b); setPage(1); }}
                    className="h-7 text-xs px-2.5"
                  >
                    {b}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Members list */}
          {filteredMissing.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-2xl">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-80" />
              <p className="text-sm font-semibold">All active members in this view have profile pictures!</p>
              <p className="text-xs text-muted-foreground">Facial recognition and front desk identity verification is fully operational.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40 border border-border/40 rounded-2xl overflow-hidden">
              {paginatedMembers.map((member) => {
                const hasPending = member.photoStatus === 'PENDING_APPROVAL' || Boolean(member.pendingPhotoURL);
                return (
                  <div
                    key={member.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-muted border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0 text-muted-foreground">
                        <ImageOff className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectMember(member.id)}
                            className="font-bold text-sm hover:underline text-left"
                          >
                            {member.name}
                          </button>
                          {member.memberId && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              #{member.memberId}
                            </Badge>
                          )}
                          {member.branch && (
                            <span className="text-[11px] text-muted-foreground">
                              · {member.branch}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{member.phone || 'No phone'}</span>
                          {member.packageType && (
                            <span>· {member.packageType}</span>
                          )}
                          {hasPending && (
                            <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] py-0">
                              Uploaded (Pending Approval)
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {hasPending ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleNavigateToApprovals}
                          className="h-7 px-2.5 text-xs font-semibold gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <Clock className="h-3 w-3" />
                          Review Photo
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendWhatsAppReminder(member)}
                            disabled={!member.phone}
                            title="Send 1-Click WhatsApp Photo Reminder"
                            className="h-7 px-2 text-xs font-semibold gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30"
                          >
                            <MessageCircle className="h-3 w-3" />
                            WhatsApp
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendSmsReminder(member)}
                            disabled={!member.phone}
                            title="Send 1-Click SMS Reminder"
                            className="h-7 px-2 text-xs font-semibold gap-1"
                          >
                            <Phone className="h-3 w-3" />
                            SMS
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSelectMember(member.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Profile
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredMissing.length)} of {filteredMissing.length} members
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                  Prev
                </Button>
                <span className="text-xs font-medium px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notify All Missing Modal */}
      <Dialog open={isNotifyAllOpen} onOpenChange={setIsNotifyAllOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-violet-600" />
              Notify All Missing Profile Pictures
            </DialogTitle>
            <DialogDescription>
              Remind {missingPhotoMembers.length} active members without a profile picture to upload one for face recognition and gym check-ins.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-muted/40 p-3 rounded-xl border border-border/40 text-xs space-y-1.5">
              <div className="font-bold text-foreground">Standard Reminder Message:</div>
              <div className="text-muted-foreground italic bg-background/80 p-2.5 rounded-lg border border-border/30">
                &ldquo;Hello! To ensure fast, seamless check-ins and security at {clubName}, please upload your profile picture in our mobile app or stop by the front desk. Thank you!&rdquo;
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Broadcast Actions</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="justify-start gap-2 h-auto py-2.5 text-xs font-bold"
                  onClick={handleCopyNumbers}
                >
                  <Copy className="h-4 w-4 text-violet-600" />
                  <div>
                    <div>{copiedNumbers ? 'Copied!' : 'Copy All Phone Numbers'}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">For bulk SMS / WhatsApp broadcast</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="justify-start gap-2 h-auto py-2.5 text-xs font-bold"
                  onClick={handleCopyMessage}
                >
                  <Copy className="h-4 w-4 text-emerald-600" />
                  <div>
                    <div>{copiedMessage ? 'Copied!' : 'Copy Broadcast Message'}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">Formatted reminder with guidelines</div>
                  </div>
                </Button>
              </div>
            </div>

            <div className="border border-border/40 rounded-xl p-3 bg-card max-h-48 overflow-y-auto space-y-2">
              <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>Recipients ({missingPhotoMembers.filter(m => m.phone).length} reachable via phone)</span>
                <Users className="h-3.5 w-3.5" />
              </div>
              <div className="space-y-1">
                {missingPhotoMembers.slice(0, 10).map((m) => (
                  <div key={m.id} className="text-xs flex items-center justify-between py-1 border-b border-border/20 last:border-none">
                    <span className="font-medium truncate max-w-[200px]">{m.name}</span>
                    <span className="text-muted-foreground text-[11px] font-mono">{m.phone || 'No phone'}</span>
                  </div>
                ))}
                {missingPhotoMembers.length > 10 && (
                  <div className="text-[11px] text-center text-muted-foreground pt-1">
                    ...and {missingPhotoMembers.length - 10} more members
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setIsNotifyAllOpen(false)}>
              Close
            </Button>
            <Button
              className="gap-1.5 font-bold bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => {
                if (missingPhotoMembers.length > 0) {
                  const firstWithPhone = missingPhotoMembers.find(m => m.phone);
                  if (firstWithPhone) {
                    handleSendWhatsAppReminder(firstWithPhone);
                  }
                  toast.success(`Broadcasting reminders initiated for ${missingPhotoMembers.length} members.`);
                }
                setIsNotifyAllOpen(false);
              }}
            >
              <Send className="h-4 w-4" />
              Send First Reminder via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MissingPhotosCard;
