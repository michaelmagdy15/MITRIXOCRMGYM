import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAppContext } from '../context';
import { Coach } from '../types';
import { PayoutConfig } from '../types/payout';
import { formatCurrencyAmount } from '../utils/pricing';
import { downloadFile } from '../utils/download';
import { toast } from 'sonner';
import {
  DollarSign,
  Download,
  Calendar,
  Users,
  Award,
  Layers,
  FileSpreadsheet,
  TrendingUp,
} from 'lucide-react';

interface GymPayrollHubProps {
  coaches: Coach[];
  onManageCoach?: (coach: Coach) => void;
}

interface CoachPayrollRow {
  coachId: string;
  coachName: string;
  specialty?: string;
  ptSessionsCount: number;
  classesCount: number;
  ptPayout: number;
  classPayout: number;
  totalPayout: number;
}

export function GymPayrollHub({ coaches, onManageCoach }: GymPayrollHubProps) {
  const { defaultPayoutRates } = useAppContext();

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(true);
  const [payrollRows, setPayrollRows] = useState<CoachPayrollRow[]>([]);

  const loadPayrollData = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

      // 1. Fetch all completed sessions for this period
      const sessionsSnap = await getDocs(collection(db, 'sessions'));
      const allSessions = sessionsSnap.docs
        .map((d) => d.data())
        .filter((s: any) => {
          const status = String(s.status || '').toLowerCase();
          const sDate = s.date || (s.startTime ? String(s.startTime).substring(0, 10) : '');
          return (status === 'completed' || status === 'attended') && sDate >= startDate && sDate <= endDate;
        });

      // 2. Fetch all completed classes for this period
      const classesSnap = await getDocs(collection(db, 'classSchedules'));
      const allClasses = classesSnap.docs
        .map((d) => d.data())
        .filter((c: any) => {
          const cDate = c.date || (c.startTime ? String(c.startTime).substring(0, 10) : '');
          return cDate >= startDate && cDate <= endDate;
        });

      // 3. Compute per-coach aggregates
      const rows: CoachPayrollRow[] = coaches.map((coach) => {
        const coachSessions = allSessions.filter(
          (s: any) => s.coachId === coach.id || s.trainerId === coach.id || s.coachName === coach.name
        );
        const coachClasses = allClasses.filter(
          (c: any) => c.instructorId === coach.id || c.coachName === coach.name || c.instructorName === coach.name
        );

        const ptRate = defaultPayoutRates?.ptFixedRate || 150;
        const classRate = defaultPayoutRates?.freeClassRate || 200;

        const ptPayout = coachSessions.length * ptRate;
        const classPayout = coachClasses.length * classRate;
        const totalPayout = ptPayout + classPayout;

        return {
          coachId: coach.id,
          coachName: coach.name,
          specialty: coach.specialties?.[0] || 'Fitness',
          ptSessionsCount: coachSessions.length,
          classesCount: coachClasses.length,
          ptPayout,
          classPayout,
          totalPayout,
        };
      });

      // Sort descending by total payout
      rows.sort((a, b) => b.totalPayout - a.totalPayout);
      setPayrollRows(rows);
    } catch (err) {
      console.error('Failed to load payroll data:', err);
      toast.error('Failed to calculate payroll');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayrollData();
  }, [selectedMonth, coaches]);

  const summary = useMemo(() => {
    let totalPtSessions = 0;
    let totalClasses = 0;
    let totalPayroll = 0;

    for (const r of payrollRows) {
      totalPtSessions += r.ptSessionsCount;
      totalClasses += r.classesCount;
      totalPayroll += r.totalPayout;
    }

    return { totalPtSessions, totalClasses, totalPayroll };
  }, [payrollRows]);

  const handleExportCSV = () => {
    if (payrollRows.length === 0) {
      toast.error('No payroll data to export');
      return;
    }

    const headers = ['Coach Name', 'Specialty', 'PT Sessions Attended', 'PT Payout (EGP)', 'Classes Taught', 'Class Payout (EGP)', 'Total Payout (EGP)'];
    const rows = payrollRows.map((r) => [
      `"${r.coachName}"`,
      `"${r.specialty || ''}"`,
      r.ptSessionsCount,
      r.ptPayout.toFixed(2),
      r.classesCount,
      r.classPayout.toFixed(2),
      r.totalPayout.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `Coach_Payroll_${selectedMonth}.csv`);
    toast.success('Coach payroll sheet exported');
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-500" />
            Trainer Commission & Monthly Payroll Engine
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Automated session reconciliation, commission tiering, and monthly payroll liability across all coaches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-xl">
            <Download className="h-4 w-4 mr-1.5" />
            Export Payroll Sheet
          </Button>
        </div>
      </div>

      {/* Month Filter */}
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Payroll Period:</span>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-44 h-9 text-xs rounded-xl"
          />
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Total Payroll Liability</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {formatCurrencyAmount(summary.totalPayroll)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              For {payrollRows.length} active coach{payrollRows.length === 1 ? '' : 'es'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Completed PT Sessions</span>
              <Award className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {summary.totalPtSessions}
            </div>
            <p className="text-xs text-muted-foreground mt-1">1-on-1 verified floor workouts</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Group Classes Taught</span>
              <Users className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {summary.totalClasses}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Conducted studio sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead className="text-center">PT Sessions</TableHead>
                <TableHead className="text-right">PT Payout</TableHead>
                <TableHead className="text-center">Classes</TableHead>
                <TableHead className="text-right">Class Payout</TableHead>
                <TableHead className="text-right font-bold">Total Due</TableHead>
                {onManageCoach && <TableHead className="text-center">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Calculating coach commissions and session logs...
                  </TableCell>
                </TableRow>
              ) : payrollRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No coaches found.
                  </TableCell>
                </TableRow>
              ) : (
                payrollRows.map((row) => {
                  const coachObj = coaches.find((c) => c.id === row.coachId);
                  return (
                    <TableRow key={row.coachId}>
                      <TableCell className="font-semibold text-xs text-foreground">
                        {row.coachName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[11px] rounded-md">
                          {row.specialty}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {row.ptSessionsCount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrencyAmount(row.ptPayout)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {row.classesCount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrencyAmount(row.classPayout)}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrencyAmount(row.totalPayout)}
                      </TableCell>
                      {onManageCoach && coachObj && (
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onManageCoach(coachObj)}
                            className="h-8 text-xs font-medium rounded-lg"
                          >
                            Details
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
