import React, { useMemo, useState } from 'react';
import type { Attendance, Client, Payment } from '../../types';
import {
  computeChurnRiskMembers,
  buildWhatsAppRetentionOutreachUrl,
  ChurnRiskType,
} from '../../utils/churnRetention';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, MessageCircle, AlertTriangle, Clock, CreditCard, Users } from 'lucide-react';

export interface RetentionRadarCardProps {
  clients: Client[];
  attendances: Attendance[];
  payments: Payment[];
  clubName?: string;
  onSelectMember?: (clientId: string) => void;
}

export const RetentionRadarCard: React.FC<RetentionRadarCardProps> = ({
  clients,
  attendances,
  payments,
  clubName = 'Inzan Athletics',
  onSelectMember,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | ChurnRiskType>('ALL');
  const [outreachLang, setOutreachLang] = useState<'en' | 'ar'>('en');

  const allRiskItems = useMemo(
    () => computeChurnRiskMembers(clients, attendances, payments),
    [clients, attendances, payments]
  );

  const filteredItems = useMemo(() => {
    if (filterType === 'ALL') return allRiskItems;
    return allRiskItems.filter((item) => item.riskType === filterType);
  }, [allRiskItems, filterType]);

  const counts = useMemo(() => {
    return {
      inactive: allRiskItems.filter((i) => i.riskType === 'INACTIVE_14_DAYS').length,
      expiring: allRiskItems.filter((i) => i.riskType === 'EXPIRING_7_DAYS').length,
      overdue: allRiskItems.filter((i) => i.riskType === 'OVERDUE_BALANCE').length,
    };
  }, [allRiskItems]);

  return (
    <Card className="rounded-3xl border border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40 bg-gradient-to-r from-amber-500/10 via-card to-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                <span>Retention & WhatsApp Outreach Radar</span>
                <Badge variant="outline" className="text-[10px] font-bold border-amber-500/40 text-amber-600">
                  {allRiskItems.length} Actionable
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                14-day inactive athletes, 7-day expiring memberships, and installment follow-ups
              </p>
            </div>
          </div>

          {/* Language Toggle for WhatsApp Templates */}
          <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background p-1 text-xs">
            <button
              type="button"
              onClick={() => setOutreachLang('en')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                outreachLang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              WhatsApp EN
            </button>
            <button
              type="button"
              onClick={() => setOutreachLang('ar')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                outreachLang === 'ar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              واتساب عربي
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <Button
            type="button"
            size="sm"
            variant={filterType === 'ALL' ? 'default' : 'outline'}
            className="h-7 text-[11px] font-bold rounded-full"
            onClick={() => setFilterType('ALL')}
          >
            All ({allRiskItems.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterType === 'EXPIRING_7_DAYS' ? 'default' : 'outline'}
            className="h-7 text-[11px] font-bold rounded-full gap-1"
            onClick={() => setFilterType('EXPIRING_7_DAYS')}
          >
            <Clock className="h-3 w-3" /> Expiring ≤7d ({counts.expiring})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterType === 'INACTIVE_14_DAYS' ? 'default' : 'outline'}
            className="h-7 text-[11px] font-bold rounded-full gap-1"
            onClick={() => setFilterType('INACTIVE_14_DAYS')}
          >
            <AlertTriangle className="h-3 w-3" /> Inactive 14d+ ({counts.inactive})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterType === 'OVERDUE_BALANCE' ? 'default' : 'outline'}
            className="h-7 text-[11px] font-bold rounded-full gap-1"
            onClick={() => setFilterType('OVERDUE_BALANCE')}
          >
            <CreditCard className="h-3 w-3" /> Unpaid Balance ({counts.overdue})
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filteredItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Users className="h-6 w-6 text-emerald-500 opacity-80" />
            <span>All active members are engaged and up to date!</span>
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {filteredItems.slice(0, 20).map((item) => {
              const waUrl = buildWhatsAppRetentionOutreachUrl({
                item,
                clubName,
                lang: outreachLang,
              });
              return (
                <div
                  key={`${item.member.id}_${item.riskType}`}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onSelectMember?.(item.member.id)}
                        className="text-xs font-bold text-foreground hover:text-primary underline decoration-dotted truncate"
                      >
                        {item.member.name}
                      </button>
                      {item.member.memberId && (
                        <span className="text-[10px] font-mono text-muted-foreground">#{item.member.memberId}</span>
                      )}
                      {item.riskType === 'EXPIRING_7_DAYS' && (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">
                          Expires in {item.daysUntilExpiry}d
                        </Badge>
                      )}
                      {item.riskType === 'INACTIVE_14_DAYS' && (
                        <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]">
                          No visit for {item.daysSinceLastVisit}d
                        </Badge>
                      )}
                      {item.riskType === 'OVERDUE_BALANCE' && (
                        <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 text-[10px]">
                          Due: {item.unpaidAmount.toLocaleString()} EGP
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {item.member.packageType || 'Active Member'} • {item.member.phone || 'No phone'}
                    </p>
                  </div>

                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-xs transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>{outreachLang === 'ar' ? 'إرسال واتساب' : 'WhatsApp'}</span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
