import React, { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClients } from '../hooks/useClients';
import { Client, LeadStage } from '../types';
import { format, parseISO } from 'date-fns';
import { Users, Target, Calendar, TrendingDown, CheckCircle2, XCircle } from 'lucide-react';

interface ConversionFunnelProps {
  selectedRepId: string;
  selectedMonthStr: string;
}

const STAGES: { stage: LeadStage; label: string; color: string; icon: any }[] = [
  { stage: 'New', label: 'New Leads', color: '#6366f1', icon: Users },
  { stage: 'Trial', label: 'Trial Booked', color: '#8b5cf6', icon: Calendar },
  { stage: 'Follow Up', label: 'Follow Up', color: '#a855f7', icon: Target },
  { stage: 'Converted', label: 'Converted', color: '#10b981', icon: CheckCircle2 },
  { stage: 'Lost', label: 'Lost', color: '#ef4444', icon: XCircle },
];

const ConversionFunnel: React.FC<ConversionFunnelProps> = ({ selectedRepId, selectedMonthStr }) => {
  const { currentUser } = useAuth();
  const { clients } = useClients(currentUser);

  const funnelData = useMemo(() => {
    // Filter leads for the selected rep and month
    const filteredLeads = clients.filter(client => {
      if (client.status !== 'Lead') return false;
      
      const repMatch = selectedRepId === 'all' || client.assignedTo === selectedRepId;
      const dateMatch = client.lastContactDate && client.lastContactDate.startsWith(selectedMonthStr);
      
      return repMatch && dateMatch;
    });

    const counts = STAGES.reduce((acc, current) => {
      acc[current.stage] = filteredLeads.filter(l => l.stage === current.stage).length;
      return acc;
    }, {} as Record<LeadStage, number>);

    // For a traditional funnel, we assume people move through stages.
    // However, since we only have current stage, we'll just show the breakdown.
    // If the user wants a progressive funnel (where Converted counts as having been Trial), 
    // we would sum them up. Let's do a progressive sum for a better visual funnel, 
    // BUT 'Lost' is separate.
    
    // Progressive counts: 
    // New = New + Trial + FollowUp + Converted
    // Trial = Trial + FollowUp + Converted
    // FollowUp = FollowUp + Converted
    // Converted = Converted
    
    const progressiveCounts = {
      'New': counts['New'] + counts['Trial'] + counts['Follow Up'] + counts['Converted'],
      'Trial': counts['Trial'] + counts['Follow Up'] + counts['Converted'],
      'Follow Up': counts['Follow Up'] + counts['Converted'],
      'Converted': counts['Converted'],
      'Lost': counts['Lost']
    };

    return STAGES.map((s, i) => {
      const count = progressiveCounts[s.stage];
      const prevStage = i > 0 ? STAGES[i - 1]?.stage : undefined;
      const prevCount = prevStage ? progressiveCounts[prevStage] : null;
      const dropOff = prevCount && prevCount > 0 ? ((prevCount - count) / prevCount) * 100 : 0;
      const conversionRate = progressiveCounts['New'] > 0 ? (count / progressiveCounts['New']) * 100 : 0;

      return {
        ...s,
        count,
        actualCount: counts[s.stage],
        dropOff,
        conversionRate,
      };
    });
  }, [clients, selectedRepId, selectedMonthStr]);

  const totalNew = funnelData[0]?.count || 0;

  return (
    <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Conversion Funnel</h3>
          <p className="text-sm text-muted-foreground">Pipeline performance for {selectedMonthStr}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20">
          <Target className="w-4 h-4" />
          {funnelData[3]?.conversionRate.toFixed(1) || 0}% Conversion
        </div>
      </div>

      <div className="relative flex flex-col gap-4">
        {funnelData.map((stage, index) => {
          const Icon = stage.icon;
          const widthPercent = totalNew > 0 ? (stage.count / totalNew) * 100 : 0;
          const displayWidth = Math.max(widthPercent, 15);

          return (
            <div key={stage.stage} className="relative group">
              {index > 0 && index < 4 && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-background px-2 py-0.5 rounded-full border border-border shadow-sm text-[10px] font-bold text-muted-foreground group-hover:text-primary transition-colors">
                  <TrendingDown className="w-3 h-3" />
                  {stage.dropOff.toFixed(0)}% Drop-off
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="w-28 flex-shrink-0 text-sm font-semibold text-muted-foreground">
                  {stage.label}
                </div>
                
                <div className="flex-grow relative h-10 bg-secondary/30 rounded-lg overflow-hidden border border-border/50">
                  <div 
                    className="h-full transition-all duration-700 ease-out flex items-center justify-end px-4"
                    style={{ 
                      width: `${displayWidth}%`, 
                      backgroundColor: stage.color,
                      opacity: 0.9,
                      boxShadow: `inset 0 0 10px rgba(0,0,0,0.1)`
                    }}
                  >
                    <span className="text-white font-bold text-xs">
                      {stage.count}
                    </span>
                  </div>
                </div>

                <div className="w-16 text-right">
                  <div className="text-xs font-bold text-muted-foreground/60">
                    {index === 4 ? '' : `${stage.conversionRate.toFixed(0)}%`}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Raw Lost Count</div>
          <div className="text-xl font-bold text-destructive flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            {funnelData[4]?.actualCount || 0}
          </div>
        </div>
        <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Success Rate</div>
          <div className="text-xl font-bold text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            {funnelData[3]?.conversionRate.toFixed(1) || 0}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversionFunnel;
