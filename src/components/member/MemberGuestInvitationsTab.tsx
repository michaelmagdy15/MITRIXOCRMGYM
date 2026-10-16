import React, { useState, useEffect, useMemo } from 'react';
import { Client, GuestInvite } from '../../types';
import { db } from '../../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  increment,
} from 'firebase/firestore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  UserPlus,
  Users,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  CalendarCheck,
  Search,
  Ticket,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { toast } from 'sonner';

interface NormalizedInvite extends GuestInvite {
  sourceCollection: 'guestInvites' | 'guests';
}

function normalizeInviteDoc(
  id: string,
  raw: Record<string, any>,
  client: Client,
  sourceCollection: 'guestInvites' | 'guests'
): NormalizedInvite {
  const attendedAt =
    raw.attendedAt ||
    raw.attendanceDate ||
    raw.visitDate ||
    raw.visitedAt ||
    raw.checkInDate ||
    undefined;

  const rawStatus = String(raw.status || '').trim().toLowerCase();
  let status: 'Pending' | 'Attended' | 'Expired' = 'Pending';
  if (
    rawStatus === 'attended' ||
    rawStatus === 'visited' ||
    rawStatus === 'checked in' ||
    rawStatus === 'checked_in' ||
    rawStatus === 'completed' ||
    Boolean(attendedAt && rawStatus !== 'pending' && rawStatus !== 'expired')
  ) {
    status = 'Attended';
  } else if (rawStatus === 'expired' || rawStatus === 'cancelled') {
    status = 'Expired';
  } else {
    status = 'Pending';
  }

  return {
    id,
    hostClientId: raw.hostClientId || client.id,
    hostMemberId: raw.hostMemberId || raw.invitedByMemberId || client.memberId || '',
    hostName: raw.hostName || raw.invitedByName || client.name || '',
    guestName:
      raw.guestName ||
      raw.visitorName ||
      raw.name ||
      raw.fullName ||
      'Unnamed Visitor',
    guestPhone:
      raw.guestPhone ||
      raw.visitorPhone ||
      raw.phone ||
      raw.mobile ||
      '—',
    inviteCode:
      raw.inviteCode ||
      raw.code ||
      raw.guestSerial ||
      raw.serial ||
      `INV-${id.slice(0, 6).toUpperCase()}`,
    status,
    createdAt:
      raw.createdAt ||
      raw.created_at ||
      raw.invitedAt ||
      raw.date ||
      attendedAt ||
      new Date(0).toISOString(),
    attendedAt,
    attendanceDate: raw.attendanceDate || attendedAt,
    branch: raw.branch || client.branch || client.homeBranch || '',
    sourceCollection,
  };
}

function formatDisplayDate(dateStr?: string, includeTime = false): string {
  if (!dateStr) return '—';
  try {
    const parsed = new Date(dateStr);
    if (isValid(parsed) && parsed.getTime() > 0) {
      return format(parsed, includeTime ? 'dd MMM yyyy, hh:mm a' : 'dd MMM yyyy');
    }
  } catch {
    // Fallback to raw string
  }
  return dateStr;
}

export function MemberGuestInvitationsTab({ client }: { client: Client }) {
  const [invites, setInvites] = useState<NormalizedInvite[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Form state for "Log / Generate Guest Invitation"
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [visitDate, setVisitDate] = useState<string>(() =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const [inviteStatus, setInviteStatus] = useState<'Attended' | 'Pending'>('Attended');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!client?.id) {
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const recordsMap = new Map<string, NormalizedInvite>();
    const unsubscribers: Array<() => void> = [];

    const syncState = () => {
      const merged = Array.from(recordsMap.values()).sort((a, b) => {
        const timeA = new Date(a.attendanceDate || a.attendedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.attendanceDate || b.attendedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setInvites(merged);
      setLoading(false);
    };

    // 1. Query guestInvites by hostClientId == client.id
    const qHostClient = query(
      collection(db, 'guestInvites'),
      where('hostClientId', '==', client.id)
    );
    unsubscribers.push(
      onSnapshot(
        qHostClient,
        (snap) => {
          snap.docs.forEach((d) => {
            recordsMap.set(
              `guestInvites:${d.id}`,
              normalizeInviteDoc(d.id, d.data(), client, 'guestInvites')
            );
          });
          syncState();
        },
        (err) => {
          console.error('[MemberGuestInvitationsTab] Error listening to guestInvites by hostClientId:', err);
          setLoading(false);
        }
      )
    );

    // 2. Query guestInvites by hostMemberId == client.memberId (if present)
    const memberIdVal = client.memberId || client.legacyMemberId;
    if (memberIdVal) {
      const qHostMember = query(
        collection(db, 'guestInvites'),
        where('hostMemberId', '==', String(memberIdVal))
      );
      unsubscribers.push(
        onSnapshot(
          qHostMember,
          (snap) => {
            snap.docs.forEach((d) => {
              recordsMap.set(
                `guestInvites:${d.id}`,
                normalizeInviteDoc(d.id, d.data(), client, 'guestInvites')
              );
            });
            syncState();
          },
          (err) => {
            console.error('[MemberGuestInvitationsTab] Error listening to guestInvites by hostMemberId:', err);
          }
        )
      );
    }

    // 3. Query guests collection by hostClientId == client.id
    const qGuestsByClient = query(
      collection(db, 'guests'),
      where('hostClientId', '==', client.id)
    );
    unsubscribers.push(
      onSnapshot(
        qGuestsByClient,
        (snap) => {
          snap.docs.forEach((d) => {
            recordsMap.set(
              `guests:${d.id}`,
              normalizeInviteDoc(d.id, d.data(), client, 'guests')
            );
          });
          syncState();
        },
        (err) => {
          console.error('[MemberGuestInvitationsTab] Error listening to guests by hostClientId:', err);
        }
      )
    );

    // 4. Query guests collection by invitedByMemberId == client.memberId (from RedGITS migration)
    if (memberIdVal) {
      const qGuestsByMemberId = query(
        collection(db, 'guests'),
        where('invitedByMemberId', '==', String(memberIdVal))
      );
      unsubscribers.push(
        onSnapshot(
          qGuestsByMemberId,
          (snap) => {
            snap.docs.forEach((d) => {
              recordsMap.set(
                `guests:${d.id}`,
                normalizeInviteDoc(d.id, d.data(), client, 'guests')
              );
            });
            syncState();
          },
          (err) => {
            console.error('[MemberGuestInvitationsTab] Error listening to guests by invitedByMemberId:', err);
          }
        )
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [client?.id, client?.memberId, client?.legacyMemberId]);

  const generateInviteCode = (): string => {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return `INV-${code}`;
  };

  const handleLogInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    const trimmedName = guestName.trim();
    const trimmedPhone = guestPhone.trim();
    if (!trimmedName || !trimmedPhone) {
      toast.error('Please enter both the guest name and phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const inviteCode = generateInviteCode();
      const chosenAttendanceIso = visitDate
        ? new Date(`${visitDate}T12:00:00`).toISOString()
        : nowIso;

      const payload: Record<string, any> = {
        hostClientId: client.id,
        hostMemberId: client.memberId || client.legacyMemberId || '',
        hostName: client.name || '',
        guestName: trimmedName,
        guestPhone: trimmedPhone,
        inviteCode,
        status: inviteStatus,
        createdAt: nowIso,
        branch: client.branch || client.homeBranch || '',
      };

      if (inviteStatus === 'Attended') {
        payload.attendedAt = chosenAttendanceIso;
        payload.attendanceDate = chosenAttendanceIso;
      } else if (visitDate) {
        payload.attendanceDate = chosenAttendanceIso;
      }

      const tracksInvites = typeof client.guestInvitesRemaining === 'number';
      if (tracksInvites && (client.guestInvitesRemaining as number) <= 0) {
        toast.error(`${client.name} has used all guest invitations included in their package.`);
        return;
      }

      await addDoc(collection(db, 'guestInvites'), payload);

      if (tracksInvites) {
        await updateDoc(doc(db, 'clients', client.id), { guestInvitesRemaining: increment(-1) });
      }

      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'CLIENT',
        entityId: client.id,
        details: `Logged guest invitation for visitor "${trimmedName}" (${trimmedPhone}) under member ${client.name} [${inviteStatus}]`,
        timestamp: nowIso,
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      toast.success(
        inviteStatus === 'Attended'
          ? `Guest visit logged for ${trimmedName}.`
          : `Guest invitation generated (${inviteCode}).`
      );

      setGuestName('');
      setGuestPhone('');
      setVisitDate(format(new Date(), 'yyyy-MM-dd'));
      setInviteStatus('Attended');
    } catch (err) {
      console.error('[MemberGuestInvitationsTab] Failed to log guest invitation:', err);
      toast.error('Failed to save guest invitation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAttendedToday = async (invite: NormalizedInvite) => {
    if (updatingId) return;
    setUpdatingId(invite.id);
    try {
      const nowIso = new Date().toISOString();
      const docRef = doc(db, invite.sourceCollection, invite.id);
      await updateDoc(docRef, {
        status: 'Attended',
        attendedAt: nowIso,
        attendanceDate: nowIso,
      });

      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'CLIENT',
        entityId: client.id,
        details: `Marked guest "${invite.guestName}" (${invite.inviteCode}) as Attended Today for member ${client.name}`,
        timestamp: nowIso,
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      toast.success(`Marked ${invite.guestName} as attended today.`);
    } catch (err) {
      console.error('[MemberGuestInvitationsTab] Failed to mark guest attended:', err);
      toast.error('Failed to mark guest attendance. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success(`Copied invite code ${code}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const kpis = useMemo(() => {
    const total = invites.length;
    const attended = invites.filter((i) => i.status === 'Attended').length;
    const pending = invites.filter((i) => i.status === 'Pending').length;
    return { total, attended, pending };
  }, [invites]);

  const filteredInvites = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return invites;
    return invites.filter(
      (i) =>
        i.guestName.toLowerCase().includes(q) ||
        i.guestPhone.toLowerCase().includes(q) ||
        i.inviteCode.toLowerCase().includes(q) ||
        i.status.toLowerCase().includes(q)
    );
  }, [invites, searchTerm]);

  const renderStatusBadge = (status: NormalizedInvite['status']) => {
    if (status === 'Attended') {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold py-0.5 px-2">
          <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Attended
        </Badge>
      );
    }
    if (status === 'Expired') {
      return (
        <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold py-0.5 px-2">
          <XCircle className="h-3 w-3 mr-1 inline" /> Expired
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold py-0.5 px-2">
        <Clock className="h-3 w-3 mr-1 inline" /> Pending
      </Badge>
    );
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase text-primary flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            Member Guest Invitations & Visitor Attendance Log
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete record of guest passes generated by {client.name} and visitor check-in dates.
          </p>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-muted/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Total Invitations Generated
            </span>
            <span className="text-2xl font-black text-foreground mt-1 block">
              {kpis.total}
            </span>
            {typeof client.guestInvitesRemaining === 'number' && (
              <span className="text-[11px] font-semibold text-primary block">
                {client.guestInvitesRemaining} package invite(s) left
              </span>
            )}
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
              Visitors Attended
            </span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
              {kpis.attended}
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
              Pending Invitations
            </span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
              {kpis.pending}
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Clock className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Log / Generate Guest Invitation Form */}
      <div className="p-5 rounded-xl border border-border bg-muted/10 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 text-primary" />
              Log / Generate Guest Invitation
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Record a visitor invitation for {client.name} or log a visitor&apos;s attendance date directly.
            </p>
          </div>
        </div>

        <form onSubmit={handleLogInvitation} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="invite-guest-name" className="text-[11px] font-bold text-muted-foreground">
              Guest / Visitor Name *
            </Label>
            <Input
              id="invite-guest-name"
              type="text"
              placeholder="e.g. Ahmed Hassan"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-guest-phone" className="text-[11px] font-bold text-muted-foreground">
              Visitor Phone *
            </Label>
            <Input
              id="invite-guest-phone"
              type="tel"
              placeholder="e.g. 01012345678"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              required
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-visit-date" className="text-[11px] font-bold text-muted-foreground">
              Visit / Attendance Date
            </Label>
            <Input
              id="invite-visit-date"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-status" className="text-[11px] font-bold text-muted-foreground">
              Status
            </Label>
            <select
              id="invite-status"
              value={inviteStatus}
              onChange={(e) => setInviteStatus(e.target.value as 'Attended' | 'Pending')}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="Attended">Attended</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          <div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              {isSubmitting ? 'Saving...' : 'Save Invitation'}
            </Button>
          </div>
        </form>
      </div>

      {/* Search Bar & Invitations Log Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Invitations Log ({filteredInvites.length})
          </h4>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search visitor, phone, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-xs bg-background"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/20 border-b border-border">
              <TableRow>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 w-12">
                  #
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">
                  Guest / Visitor Name
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">
                  Visitor Phone
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">
                  Invite Code
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">
                  Created Date
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">
                  Visitor Attendance Date
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-center">
                  Status
                </TableHead>
                <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    Loading guest invitations...
                  </TableCell>
                </TableRow>
              ) : filteredInvites.length > 0 ? (
                filteredInvites.map((invite, idx) => {
                  const attendanceDateDisplay =
                    invite.attendanceDate || invite.attendedAt
                      ? formatDisplayDate(invite.attendanceDate || invite.attendedAt, true)
                      : 'Not yet attended';

                  return (
                    <TableRow
                      key={`${invite.sourceCollection}-${invite.id}`}
                      className="hover:bg-muted/50 border-b border-border/50 transition-colors"
                    >
                      <TableCell className="py-3 px-4 text-xs font-mono text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs font-bold text-foreground">
                        {invite.guestName}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs text-muted-foreground font-mono">
                        {invite.guestPhone}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs">
                        <div className="inline-flex items-center gap-1.5 bg-muted/40 px-2 py-0.5 rounded border border-border font-mono text-[11px] font-bold text-primary">
                          <span>{invite.inviteCode}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(invite.inviteCode, invite.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy invite code"
                          >
                            {copiedId === invite.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                        {formatDisplayDate(invite.createdAt, false)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs">
                        {invite.attendanceDate || invite.attendedAt ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
                            {attendanceDateDisplay}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            {attendanceDateDisplay}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-center">
                        {renderStatusBadge(invite.status)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right whitespace-nowrap">
                        {invite.status === 'Pending' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updatingId === invite.id}
                            onClick={() => handleMarkAttendedToday(invite)}
                            className="h-7 px-2.5 text-[11px] font-bold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            {updatingId === invite.id ? 'Updating...' : 'Mark Attended Today'}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    No guest invitations found for this member.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default MemberGuestInvitationsTab;
