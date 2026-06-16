import React from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Calendar, CheckCircle2, AlertTriangle, PlayCircle, PauseCircle, Package, ShoppingBag } from 'lucide-react';

export default function MemberPackages({ client, onSwitchToStore }: { client: Client | null, onSwitchToStore?: () => void }) {
  if (!client) return null;

  const packages = client.packages || [];

  // Group packages by status
  const activePkgs = packages.filter(p => p.status === 'Active');
  const pastPkgs = packages.filter(p => p.status !== 'Active');

  const formatOptionalDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return 'N/A';
    }
  };

  // Helper to render package info
  const renderPackageCard = (pkg: any) => {
    const isUnlimited = pkg.sessionsTotal === 'unlimited' || !pkg.sessionsTotal;
    const total = typeof pkg.sessionsTotal === 'number' ? pkg.sessionsTotal : 0;
    const remaining = typeof pkg.sessionsRemaining === 'number' ? pkg.sessionsRemaining : 0;
    const attended = Math.max(0, total - remaining);
    
    // Progress is of attended sessions
    const progressPercent = total > 0 ? (attended / total) * 100 : 0;

    // Days remaining calculations
    let daysRemaining: number | null = null;
    let isExpiredByDate = false;
    if (pkg.endDate) {
      try {
        const end = parseISO(pkg.endDate);
        daysRemaining = differenceInDays(end, new Date());
        if (daysRemaining < 0) {
          isExpiredByDate = true;
        }
      } catch {
        // ignore
      }
    }

    return (
      <Card key={pkg.id} className="border bg-card/40 hover:bg-card/70 transition-colors shadow-sm overflow-hidden">
        {/* Top Accent Strip */}
        <div className={`h-1 w-full ${
          pkg.status === 'Active' 
            ? pkg.isOnHold ? 'bg-amber-400' : 'bg-primary'
            : 'bg-muted'
        }`} />

        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h4 className="text-sm font-bold leading-none tracking-tight">{pkg.packageName}</h4>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3" />
                {formatOptionalDate(pkg.startDate)} — {formatOptionalDate(pkg.endDate)}
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-1">
              {pkg.status === 'Active' ? (
                pkg.isOnHold ? (
                  <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 text-[10px] flex items-center gap-1">
                    <PauseCircle className="h-3 w-3" /> Hold
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20 text-[10px] flex items-center gap-1">
                    <PlayCircle className="h-3 w-3" /> Active
                  </Badge>
                )
              ) : (
                <Badge variant="secondary" className="text-[10px] opacity-70">
                  {pkg.status}
                </Badge>
              )}
            </div>
          </div>

          {/* Sessions details with Progress Bar */}
          {!isUnlimited && pkg.status === 'Active' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Sessions Used</span>
                <span>{attended} / {total}</span>
              </div>
              <Progress value={progressPercent} className="h-2 bg-muted [&>div]:bg-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{remaining} sessions remaining</span>
                {daysRemaining !== null && (
                  <span className={daysRemaining <= 5 ? 'text-destructive font-semibold' : ''}>
                    {isExpiredByDate 
                      ? 'Expired' 
                      : daysRemaining === 0 
                        ? 'Expires today' 
                        : `${daysRemaining} days left`
                    }
                  </span>
                )}
              </div>
            </div>
          )}

          {isUnlimited && pkg.status === 'Active' && (
            <div className="space-y-1 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">GT Membership Package</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Access to unlimited group classes</p>
              </div>
              {daysRemaining !== null && (
                <div className="text-right">
                  <p className="text-xs font-bold text-foreground">
                    {isExpiredByDate ? 'Expired' : daysRemaining === 0 ? 'Today' : `${daysRemaining} days`}
                  </p>
                  <p className="text-[9px] text-muted-foreground">Remaining</p>
                </div>
              )}
            </div>
          )}

          {/* Package Hold Detail */}
          {pkg.status === 'Active' && pkg.isOnHold && pkg.holdReason && (
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">On Hold</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pkg.holdReason}</p>
              </div>
            </div>
          )}

          {/* Past package details (Simplified) */}
          {pkg.status !== 'Active' && (
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2.5 font-medium">
              <span>{isUnlimited ? 'Unlimited Membership' : `${total} Sessions Package`}</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/60" /> Complete
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight">My Packages</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Track your memberships, training credits, and expiration dates.</p>
      </div>

      {/* Active Packages */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Package className="h-4 w-4 text-primary" /> Active Subscriptions
        </h3>
        {activePkgs.length > 0 ? (
          <div className="space-y-3">
            {activePkgs.map(renderPackageCard)}
            {onSwitchToStore && (
              <Button 
                onClick={onSwitchToStore}
                variant="outline" 
                className="w-full border-dashed border-primary/30 text-primary hover:bg-primary/5 flex items-center justify-center gap-2 h-11 rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                <ShoppingBag className="h-4 w-4" /> Buy Another Session Package
              </Button>
            )}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground text-xs italic">
                No active packages found. Purchase or renew a package online or at the branch.
              </p>
              {onSwitchToStore && (
                <Button 
                  onClick={onSwitchToStore}
                  className="bg-primary text-primary-foreground font-extrabold uppercase tracking-wider rounded-xl h-10 px-6 text-xs flex items-center gap-2 shadow-md shadow-primary/10"
                >
                  <ShoppingBag className="h-4 w-4" /> Shop Session Packages
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Package History */}
      {pastPkgs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">History</h3>
          <div className="space-y-3">
            {pastPkgs.map(renderPackageCard)}
          </div>
        </div>
      )}
    </div>
  );
}
