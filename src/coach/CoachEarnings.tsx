import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { PayoutRecord } from '../types/payout';
import { Loader2, DollarSign, Calendar, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAppContext } from '../context';

export default function CoachEarnings() {
  const { currentUser } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<PayoutRecord[]>([]);

  useEffect(() => {
    fetchEarnings();
  }, [currentUser]);

  const fetchEarnings = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'payoutRecords'),
        where('coachId', '==', currentUser.id)
      );
      
      const snap = await getDocs(q);
      const data = snap.docs.map(d => d.data() as PayoutRecord);
      
      // Sort client-side since we didn't create a composite index for this query yet
      data.sort((a, b) => b.period.localeCompare(a.period));
      
      setRecords(data);
    } catch (err) {
      console.error("Error fetching earnings:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Paid</Badge>;
      case 'approved':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      case 'draft':
      default:
        return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Earnings</h2>
        <p className="text-muted-foreground">View your monthly payout history and upcoming payouts.</p>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <DollarSign className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground">No earnings history yet</h3>
            <p className="text-muted-foreground">Your monthly payouts will appear here once generated.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {records.map((record) => {
            const [year, month] = record.period.split('-');
            const displayDate = format(new Date(Number(year), Number(month) - 1), 'MMMM yyyy');
            
            return (
              <Card key={record.id} className="overflow-hidden">
                <CardHeader className="bg-muted/50 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        {displayDate}
                      </CardTitle>
                      <CardDescription>
                        {record.ptSessions} PT • {record.freeClasses + record.paidClasses} Classes
                      </CardDescription>
                    </div>
                    {getStatusBadge(record.status)}
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-sm text-muted-foreground">Total Earnings</span>
                      <span className="text-3xl font-bold text-primary">
                        {record.totalPayout.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm border-t pt-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Personal Training</span>
                        <span className="font-medium">{record.ptPayout.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Classes</span>
                        <span className="font-medium">{(record.freeClassPayout + record.paidClassPayout).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
