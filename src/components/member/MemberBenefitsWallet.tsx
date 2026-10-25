import React, { useMemo } from 'react';
import type { Client, Package } from '../../types';
import { computeMemberBenefitsSummary } from '../../utils/memberBenefitsWallet';
import { buildWhatsAppRenewalReminderUrl, openWhatsAppUrl } from '../../utils/whatsappTemplates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  Dumbbell,
  Ticket,
  Users,
  Snowflake,
  Clock,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react';

export interface MemberBenefitsWalletProps {
  client: Client;
  packages?: Package[];
  usedInvitationsCount?: number;
  clubName?: string;
  isAdminView?: boolean;
  onOpenGuestInvitations?: () => void;
}

export const MemberBenefitsWallet: React.FC<MemberBenefitsWalletProps> = ({
  client,
  packages = [],
  usedInvitationsCount = 0,
  clubName = 'Inzan Athletics',
  isAdminView = false,
  onOpenGuestInvitations,
}) => {
  const summary = useMemo(
    () => computeMemberBenefitsSummary(client, packages, usedInvitationsCount),
    [client, packages, usedInvitationsCount]
  );

  const renewalWhatsAppUrl = useMemo(
    () =>
      buildWhatsAppRenewalReminderUrl({
        client,
        pkg: (client.packages || []).find((p) => p.status === 'Active') || (client.packages || [])[0] || null,
        clubName,
      }),
    [client, clubName]
  );

  if (!summary.hasAnyBenefits && !isAdminView) {
    return null;
  }

  const primary = summary.activePrimaryPackage;
  const isExpiringSoon = primary?.daysRemaining !== null && primary?.daysRemaining !== undefined && primary.daysRemaining <= 7;

  const progressPct = (remaining: number, total: number) => {
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((remaining / total) * 100)));
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-xs space-y-3">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                Entitlements & Benefits Wallet
              </h4>
              {primary ? (
                <Badge className="h-4 px-1.5 text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Primary Active
                </Badge>
              ) : (
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-bold text-amber-600 border-amber-500/30 bg-amber-500/10">
                  No Active Primary
                </Badge>
              )}
              {summary.activeSecondaryCount > 0 && (
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                  +{summary.activeSecondaryCount} Secondary Add-on{summary.activeSecondaryCount > 1 ? 's' : ''}
                </Badge>
              )}
              {primary?.isTimeRestricted && (
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Window {primary.allowedStartTime}–{primary.allowedEndTime}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {primary
                ? `${primary.name}${primary.daysRemaining !== null ? ` • ${primary.daysRemaining} day${primary.daysRemaining === 1 ? '' : 's'} remaining` : ''}`
                : 'Assign an active Primary Membership to unlock secondary packages & benefits'}
            </p>
          </div>
        </div>

        {/* Admin 1-Tap WhatsApp Renewal Reminder */}
        {isAdminView && renewalWhatsAppUrl && (isExpiringSoon || client.status === 'Expired' || client.status === 'Nearly Expired') && (
          <a
            href={renewalWhatsAppUrl}
            target="whatsapp_crm"
            onClick={(e) => {
              e.preventDefault();
              openWhatsAppUrl(renewalWhatsAppUrl);
            }}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
            title="Send 1-Tap WhatsApp Renewal Reminder"
          >
            <MessageCircle className="h-3 w-3" />
            WhatsApp Renewal Reminder
          </a>
        )}
      </div>

      {/* Benefits Grid */}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2.5">
        {/* 1. Free PT Sessions */}
        <div className="rounded-xl border border-border/50 bg-background/80 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1">
              <Dumbbell className="h-3 w-3 text-blue-500" />
              PT Sessions
            </span>
            <span className="font-mono text-xs font-black text-foreground">
              {summary.ptSessions.remaining} / {summary.ptSessions.total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${progressPct(summary.ptSessions.remaining, summary.ptSessions.total)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {summary.ptSessions.remaining > 0 ? `${summary.ptSessions.remaining} available to book` : 'No PT credits left'}
          </p>
        </div>

        {/* 2. Paid Class Free Trials */}
        <div className="rounded-xl border border-border/50 bg-background/80 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1">
              <Ticket className="h-3 w-3 text-pink-500" />
              Class Trials
            </span>
            <span className="font-mono text-xs font-black text-foreground">
              {summary.classTrials.remaining} / {summary.classTrials.total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-pink-500 transition-all"
              style={{ width: `${progressPct(summary.classTrials.remaining, summary.classTrials.total)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {summary.classTrials.remaining > 0 ? 'Valid on paid classes' : '0 paid trials left'}
          </p>
        </div>

        {/* 3. Guest Invitations */}
        <div
          onClick={onOpenGuestInvitations}
          className={`rounded-xl border border-border/50 bg-background/80 p-2.5 space-y-1.5 ${
            onOpenGuestInvitations ? 'cursor-pointer hover:border-indigo-500/40 transition-colors' : ''
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 text-indigo-500" />
              Guest Passes
            </span>
            <span className="font-mono text-xs font-black text-foreground">
              {summary.guestInvitations.remaining} / {summary.guestInvitations.total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progressPct(summary.guestInvitations.remaining, summary.guestInvitations.total)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {summary.guestInvitations.remaining > 0
              ? `${summary.guestInvitations.remaining} pass${summary.guestInvitations.remaining === 1 ? '' : 'es'} available`
              : 'All passes used'}
          </p>
        </div>

        {/* 4. Freeze Allowance */}
        <div className="rounded-xl border border-border/50 bg-background/80 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1">
              <Snowflake className="h-3 w-3 text-cyan-500" />
              Freeze Days
            </span>
            <span className="font-mono text-xs font-black text-foreground">
              {summary.freezeAllowance.remainingDays} / {summary.freezeAllowance.totalDays}d
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all"
              style={{
                width: `${progressPct(summary.freezeAllowance.remainingDays, summary.freezeAllowance.totalDays)}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {summary.freezeAllowance.minDays > 0 || summary.freezeAllowance.maxDays > 0
              ? `Min ${summary.freezeAllowance.minDays || 1}d • Max ${summary.freezeAllowance.maxDays || summary.freezeAllowance.totalDays}d`
              : `${summary.freezeAllowance.usedDays}d used`}
          </p>
        </div>
      </div>

      {/* Expiring soon alert bar */}
      {isExpiringSoon && primary && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            Membership expires in <strong>{primary.daysRemaining} day{primary.daysRemaining === 1 ? '' : 's'}</strong> ({primary.endDate?.substring(0, 10)}).
          </span>
          {isAdminView && renewalWhatsAppUrl && (
            <a
              href={renewalWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline hover:opacity-80 shrink-0"
            >
              Notify on WhatsApp →
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default MemberBenefitsWallet;
