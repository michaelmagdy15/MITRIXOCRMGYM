import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Assessment, AssessmentStatus, Coach, User } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Clock, ClipboardList, UserCheck, Phone, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { addAuditLog } from '../services/auditService';

interface FitnessAssessmentQueueProps {
  currentUser: User | null;
  coaches: Coach[];
}

export function FitnessAssessmentQueue({ currentUser, coaches }: FitnessAssessmentQueueProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [assignCoachId, setAssignCoachId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'assessments'), (snapshot) => {
      const records = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Assessment));
      records.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setAssessments(records);
    });
    return () => unsub();
  }, []);

  const filtered = assessments.filter(a => {
    if (statusFilter === 'all') return true;
    return a.status === statusFilter;
  });

  const pendingCount = assessments.filter(a => a.status === 'Pending').length;

  const handleAssign = async () => {
    if (!selectedAssessment || !assignCoachId) return;
    setIsAssigning(true);
    try {
      const chosenCoach = coaches.find(c => (c.userId || c.id) === assignCoachId || c.id === assignCoachId);
      const coachName = chosenCoach?.name || 'Assigned Coach';
      const coachIdVal = chosenCoach?.userId || chosenCoach?.id || assignCoachId;

      await updateDoc(doc(db, 'assessments', selectedAssessment.id), {
        assignedCoachId: coachIdVal,
        assignedCoachName: coachName,
        status: 'Contacted',
        assignedBy: currentUser?.id,
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await addAuditLog(
        'UPDATE',
        'ASSESSMENT',
        selectedAssessment.id,
        `Fitness Manager assigned assessment for ${selectedAssessment.clientName} to coach ${coachName}`,
        currentUser?.name
      );

      setSelectedAssessment(null);
      setAssignCoachId('');
    } catch (err) {
      console.error('Failed to assign coach:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  const getStatusBadge = (status: AssessmentStatus) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Pending Triage</Badge>;
      case 'Contacted':
        return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Coach Assigned</Badge>;
      case 'Scheduled':
        return <Badge className="bg-purple-500">Scheduled</Badge>;
      case 'Completed':
        return <Badge className="bg-emerald-600">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Fitness Assessment Triage Queue
          </h2>
          <p className="text-sm text-muted-foreground">
            Review member health histories, injury notes, and assign intake assessments to personal trainers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val || 'all')}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assessments ({assessments.length})</SelectItem>
              <SelectItem value="Pending">Pending ({pendingCount})</SelectItem>
              <SelectItem value="Contacted">Assigned</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Requested Time / Shift</TableHead>
                <TableHead>Membership & Age</TableHead>
                <TableHead>Injury Notes</TableHead>
                <TableHead>Assigned Trainer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No assessment requests found matching this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p className="font-semibold text-sm">{item.clientName}</p>
                        {item.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {item.phone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span>{item.timePeriod || item.preferredTime || 'Any Time'}</span>
                        {item.createdAt && (
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(item.createdAt), 'MMM dd, yyyy')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{item.membershipType || 'Standard'}</span>
                        <span className="text-[11px] text-muted-foreground">Age: {item.ageGroup || 'Adult'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {item.injuries || item.notes ? (
                        <div className="flex items-start gap-1.5 p-1.5 bg-amber-50/70 border border-amber-200/60 rounded-md">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-900 line-clamp-2">{item.injuries || item.notes}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">None reported</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.assignedCoachName ? (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <UserCheck className="w-3 h-3 text-primary" /> {item.assignedCoachName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedAssessment(item);
                          setAssignCoachId(item.assignedCoachId || '');
                        }}
                      >
                        {item.assignedCoachId ? 'Reassign' : 'Assign Trainer'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assignment Dialog */}
      <Dialog open={!!selectedAssessment} onOpenChange={(open) => !open && setSelectedAssessment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Trainer to Assessment</DialogTitle>
          </DialogHeader>
          {selectedAssessment && (
            <div className="space-y-4 py-3">
              <div className="p-3 bg-muted rounded-xl space-y-1">
                <p className="font-semibold text-sm">{selectedAssessment.clientName}</p>
                <p className="text-xs text-muted-foreground">Shift: {selectedAssessment.timePeriod || 'Flexible'}</p>
                {selectedAssessment.injuries && (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                    <strong>Medical / Injury Notes:</strong> {selectedAssessment.injuries}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Select Trainer</label>
                <Select value={assignCoachId} onValueChange={(val: any) => setAssignCoachId(val || '')}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Choose a trainer" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.filter(c => c.active).map(c => (
                      <SelectItem key={c.id} value={c.userId || c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAssessment(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!assignCoachId || isAssigning}>
              {isAssigning ? 'Saving...' : 'Confirm Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
