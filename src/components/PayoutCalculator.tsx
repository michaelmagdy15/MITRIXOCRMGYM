import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { useAppContext } from '../context';
import { PayoutConfig, PayoutRecord } from '../types/payout';
import { ClassSchedule } from '../types/class';
import { Session } from '../types';
import { Loader2, DollarSign, FileText, CheckCircle, Users } from 'lucide-react';
import { addAuditLog } from '../services/auditService';

interface PayoutCalculatorProps {
  coachId: string;
  coachName: string;
  onClose?: () => void;
}

export default function PayoutCalculator({ coachId, coachName, onClose }: PayoutCalculatorProps) {
  const { defaultPayoutRates, currentUser } = useAppContext();
  
  // Month selection (default to previous month)
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const [period, setPeriod] = useState(`${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`);
  
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<PayoutRecord | null>(null);
  
  // Real-time calculation if no saved record exists
  const [calculated, setCalculated] = useState<Partial<PayoutRecord> | null>(null);
  const [activeConfig, setActiveConfig] = useState<PayoutConfig>(defaultPayoutRates);

  useEffect(() => {
    fetchData();
  }, [coachId, period]);

  const fetchData = async () => {
    if (!coachId) return;
    setLoading(true);
    try {
      // 1. Fetch coach-specific payout config if it exists
      const configDoc = await getDoc(doc(db, 'payoutConfigs', coachId));
      const config: PayoutConfig = configDoc.exists() 
        ? { ...defaultPayoutRates, ...configDoc.data() } 
        : defaultPayoutRates;
      
      setActiveConfig(config);

      // 2. Fetch existing payout record for this period
      const recordId = `${coachId}_${period}`;
      const recordDoc = await getDoc(doc(db, 'payoutRecords', recordId));
      
      if (recordDoc.exists()) {
        setRecord(recordDoc.data() as PayoutRecord);
        setCalculated(null);
      } else {
        setRecord(null);
        await calculateDraft(config);
      }
    } catch (err) {
      console.error("Error fetching payout data:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateDraft = async (config: PayoutConfig) => {
    // Generate start and end date strings for the period
    const [year, month] = period.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;
    
    // Fetch completed PT sessions
    const sessionsRef = collection(db, 'sessions');
    const qSessions = query(
      sessionsRef, 
      where('coachId', '==', coachId),
      where('status', '==', 'Completed')
    );
    const sessionsSnap = await getDocs(qSessions);
    const sessions = sessionsSnap.docs
      .map(d => d.data() as Session)
      .filter(s => s.date >= startDate && s.date <= endDate);

    // Fetch completed Classes
    const classesRef = collection(db, 'classSchedules');
    const qClasses = query(
      classesRef,
      where('instructorId', '==', coachId),
      where('status', '==', 'completed')
    );
    const classesSnap = await getDocs(qClasses);
    const classes = classesSnap.docs
      .map(d => d.data() as ClassSchedule)
      .filter(c => c.startTime.startsWith(period));

    // Calculate PT
    const ptSessionsCount = sessions.length;
    let ptPayout = 0;
    // We assume PT revenue is fixed for the calculation or percentage based on an average package price. 
    // To keep it simple, we rely on the fixed rate or an explicit revenue field if available.
    if (config.ptFixedRate) {
      ptPayout = ptSessionsCount * config.ptFixedRate;
    }
    // (If ptPercentage is used, it would require knowing the package price per session)

    // Calculate Classes
    const freeClasses = classes.filter(c => !c.price || c.price === 0);
    const paidClasses = classes.filter(c => c.price && c.price > 0);

    const freeClassPayout = freeClasses.length * (config.freeClassRate || 0);

    let paidClassRevenue = 0;
    let paidClassPayout = 0;

    paidClasses.forEach(c => {
      const attendeesCount = (c.checkedIn || []).length;
      const revenue = (c.price || 0) * attendeesCount;
      paidClassRevenue += revenue;
      
      if (config.paidClassFixedRate) {
        paidClassPayout += attendeesCount * config.paidClassFixedRate;
      } else if (config.paidClassPercentage) {
        paidClassPayout += revenue * (config.paidClassPercentage / 100);
      }
    });

    setCalculated({
      coachId,
      coachName,
      period,
      ptSessions: ptSessionsCount,
      ptRevenue: 0,
      ptPayout,
      freeClasses: freeClasses.length,
      freeClassPayout,
      paidClasses: paidClasses.length,
      paidClassRevenue,
      paidClassPayout,
      totalPayout: ptPayout + freeClassPayout + paidClassPayout,
      status: 'draft',
      generatedAt: new Date().toISOString()
    });
  };

  const handleSaveDraft = async () => {
    if (!calculated) return;
    
    setLoading(true);
    try {
      const recordId = `${coachId}_${period}`;
      const newRecord: PayoutRecord = {
        ...calculated,
        id: recordId,
      } as PayoutRecord;
      
      await setDoc(doc(db, 'payoutRecords', recordId), newRecord);
      await addAuditLog('CREATE', 'PAYOUT', recordId, `Generated draft payout for ${coachName} (${period})`);
      setRecord(newRecord);
      setCalculated(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save draft');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!record) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'payoutRecords', record.id), {
        status: 'approved',
        approvedBy: currentUser?.id,
        approvedAt: new Date().toISOString()
      });
      await addAuditLog('UPDATE', 'PAYOUT', record.id, `Approved payout for ${coachName} (${period})`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!record) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'payoutRecords', record.id), {
        status: 'paid'
      });
      await addAuditLog('UPDATE', 'PAYOUT', record.id, `Marked payout as paid for ${coachName} (${period})`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to mark paid');
    } finally {
      setLoading(false);
    }
  };

  // Generate last 12 months for selector
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('default', { month: 'long', year: 'numeric' });
    months.push({ value, label });
  }

  const displayData = record || calculated;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Payout Calculator</CardTitle>
            <CardDescription>Calculate and approve payouts for {coachName}</CardDescription>
          </div>
          <Select value={period} onValueChange={(val) => setPeriod(val || '')}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Period" />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : displayData ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-muted p-4 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    displayData.status === 'paid' ? 'default' : 
                    displayData.status === 'approved' ? 'secondary' : 'outline'
                  }>
                    {(displayData.status || 'draft').toUpperCase()}
                  </Badge>
                  {displayData.status === 'draft' && !record && (
                    <span className="text-xs text-muted-foreground italic">Unsaved Preview</span>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-sm text-muted-foreground">Total Payout</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {(displayData.totalPayout ?? 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* PT Sessions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md flex items-center gap-2"><FileText className="w-4 h-4"/> PT Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Completed:</span>
                    <span className="font-medium">{displayData.ptSessions ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payout:</span>
                    <span className="font-medium text-green-600">{(displayData.ptPayout ?? 0).toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Free Classes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md flex items-center gap-2"><Users className="w-4 h-4"/> Free Classes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Taught:</span>
                    <span className="font-medium">{displayData.freeClasses ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payout:</span>
                    <span className="font-medium text-green-600">{(displayData.freeClassPayout ?? 0).toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Paid Classes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-md flex items-center gap-2"><DollarSign className="w-4 h-4"/> Paid Classes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Taught:</span>
                    <span className="font-medium">{displayData.paidClasses ?? 0}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Revenue:</span>
                    <span className="font-medium">{(displayData.paidClassRevenue ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payout:</span>
                    <span className="font-medium text-green-600">{(displayData.paidClassPayout ?? 0).toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="text-center p-8 text-muted-foreground">No data found for this period.</div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-end gap-2 border-t pt-4">
        {onClose && <Button variant="outline" onClick={onClose}>Close</Button>}
        
        {!record && calculated && (
          <Button onClick={handleSaveDraft} disabled={loading}>Save Draft</Button>
        )}
        
        {record && record.status === 'draft' && (
          <Button onClick={handleApprove} disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white">
            <CheckCircle className="w-4 h-4 mr-2" /> Approve Payout
          </Button>
        )}
        
        {record && record.status === 'approved' && (
          <Button onClick={handleMarkPaid} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
            <DollarSign className="w-4 h-4 mr-2" /> Mark as Paid
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
