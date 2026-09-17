import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format, parseISO } from 'date-fns';
import { ClipboardList, Target, PauseCircle, CheckCircle2, Phone, User as UserIcon, Clock, MessageSquare, ExternalLink, Calendar, Award, Shield, Check, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApprovalRequest } from '../types/approval';
import { approveRequest, rejectRequest } from '../services/approvalService';
import { addAuditLog } from '../services/auditService';
import { AuditDiff, Payment } from '../types';

export default function AdminRequests() {
  const { users } = useAppContext();
  const { currentUser } = useAuth();
  
  const [assessments, setAssessments] = useState<any[]>([]);
  const [freezes, setFreezes] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  const coaches = users.filter(u => u.role === 'coach' || u.role === 'admin');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      
      // Fetch Assessments
      const asmntSnap = await getDocs(query(collection(db, 'assessments'), orderBy('createdAt', 'desc')));
      setAssessments(asmntSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Fetch Freezes (bookingRequests with type: 'freeze')
      const reqsSnap = await getDocs(query(collection(db, 'bookingRequests'), orderBy('createdAt', 'desc')));
      const allReqs = reqsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      setFreezes(allReqs.filter(r => r.type === 'freeze'));
      
      // Fetch Approvals
      const appSnap = await getDocs(query(collection(db, 'approvalRequests'), orderBy('createdAt', 'desc')));
      setApprovals(appSnap.docs.map(d => ({ ...(d.data() as ApprovalRequest), id: d.id })));
      
      
    } catch (err) {
      console.error("Error loading requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAssignAssessment = async (requestId: string, coachId: string) => {
    if (!currentUser) return;
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/requests/assessment/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, coachId })
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchRequests();
    } catch (err) {
      console.error(err);
      alert("Failed to assign assessment.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveFreeze = async (requestId: string) => {
    if (!currentUser) return;
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/requests/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchRequests();
    } catch (err) {
      console.error(err);
      alert("Failed to approve freeze request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveRefund = async (request: ApprovalRequest) => {
    if (!currentUser) return;

    // Maker-checker rule: Anti-self-approval rule
    if (request.requesterId && request.requesterId === currentUser.id) {
      throw new Error('Maker cannot approve their own request. A secondary manager or General Manager must countersign.');
    }

    const paymentId = request.targetEntityId || request.details?.paymentId;
    if (!paymentId) {
      throw new Error('Target payment ID is missing from approval request.');
    }

    const paymentRef = doc(db, 'payments', paymentId);
    const paymentSnap = await getDoc(paymentRef);
    const paymentData = paymentSnap.exists() ? (paymentSnap.data() as Payment) : null;
    const refundTimestamp = new Date().toISOString();

    // 1. Update target payments doc setting status = 'refunded' and deleted_at = ISO timestamp
    await updateDoc(paymentRef, {
      status: 'refunded',
      deleted_at: refundTimestamp,
      refundMethod: request.details?.refundMethod || 'Cash',
      refundAmount: request.details?.amount,
      refundedAt: refundTimestamp,
      refundedBy: currentUser.id,
      updatedAt: serverTimestamp()
    });

    // 2. Restore or adjust client package sessions / entitlement if linked
    const entitlementId = paymentData?.linkedEntitlementId || request.details?.entitlementId;
    if (entitlementId) {
      try {
        const entRef = doc(db, 'entitlements', entitlementId);
        const entSnap = await getDoc(entRef);
        if (entSnap.exists()) {
          await updateDoc(entRef, {
            status: 'cancelled',
            cancelledAt: refundTimestamp,
            cancelledReason: `Refund approved: ${request.reason || 'Manager approval'}`,
            updatedAt: serverTimestamp()
          });
        }
      } catch (entErr) {
        console.warn('Error adjusting linked entitlement on refund:', entErr);
      }
    }

    const clientId = paymentData?.clientId || request.details?.clientId;
    if (clientId && clientId !== 'WALK-IN-GUEST') {
      try {
        const clientRef = doc(db, 'clients', clientId);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const clientData = clientSnap.data();
          const pkgs: any[] = Array.isArray(clientData.packages) ? [...clientData.packages] : [];
          const targetPkgType = paymentData?.packageType || request.details?.packageType;
          let sessionsToRestore = 0;
          let packageFound = false;

          const updatedPackages = pkgs.map((pkg: any) => {
            const isMatch = (entitlementId && (pkg.id === entitlementId || pkg.entitlementId === entitlementId)) ||
              (targetPkgType && (pkg.packageName === targetPkgType || pkg.name === targetPkgType) && pkg.status === 'Active');
            
            if (isMatch && !packageFound) {
              packageFound = true;
              if (typeof pkg.sessionsRemaining === 'number') {
                sessionsToRestore = pkg.sessionsRemaining;
              } else if (typeof pkg.sessionsTotal === 'number') {
                sessionsToRestore = pkg.sessionsTotal;
              }
              return {
                ...pkg,
                status: 'Cancelled',
                cancelledReason: 'Refund approved',
                cancelledAt: refundTimestamp
              };
            }
            return pkg;
          });

          const clientUpdates: any = {
            packages: updatedPackages,
            updatedAt: serverTimestamp()
          };

          if (sessionsToRestore > 0 && typeof clientData.sessionsRemaining === 'number') {
            clientUpdates.sessionsRemaining = Math.max(0, clientData.sessionsRemaining - sessionsToRestore);
          }

          if (clientData.packageType === targetPkgType) {
            const remainingActivePkg = updatedPackages.find((p: any) => p.status === 'Active');
            if (remainingActivePkg) {
              clientUpdates.packageType = remainingActivePkg.packageName || remainingActivePkg.name;
            } else {
              clientUpdates.status = 'Expired';
            }
          }

          await updateDoc(clientRef, clientUpdates);
        }
      } catch (clientErr) {
        console.warn('Error adjusting client package sessions on refund:', clientErr);
      }
    }

    // 3. Log an immutable audit entry via addAuditLog with diff
    const diff: AuditDiff[] = [
      { field: 'status', oldValue: paymentData?.status || 'paid', newValue: 'refunded' },
      { field: 'deleted_at', oldValue: paymentData?.deleted_at || null, newValue: refundTimestamp },
      { field: 'refundAmount', oldValue: null, newValue: request.details?.amount },
      { field: 'refundMethod', oldValue: null, newValue: request.details?.refundMethod || 'Cash' }
    ];

    await addAuditLog(
      'APPROVE',
      'PAYMENT',
      paymentId,
      `Approved refund of ${request.details?.amount} LE for payment ${paymentId}. Status updated to 'refunded' and soft-deleted. Entitlement/package balance adjusted.`,
      currentUser.name || 'Manager',
      {
        diff,
        reason: request.reason || 'Refund approved by manager',
        branch: paymentData?.branch
      }
    );

    // 4. Mark approval request as approved
    const reqRef = doc(db, 'approvalRequests', request.id);
    await updateDoc(reqRef, {
      status: 'approved',
      approvedBy: currentUser.id,
      approvedAt: refundTimestamp,
      updatedAt: serverTimestamp()
    });

    await addAuditLog(
      'UPDATE',
      'SYSTEM',
      request.id,
      `Approved refund approval request for payment ${paymentId}`,
      currentUser.name || 'Manager'
    );
  };

  const handleApproveAction = async (request: ApprovalRequest) => {
    if (!currentUser) return;
    setProcessingId(request.id);
    try {
      if (request.type === 'refund') {
        await handleApproveRefund(request);
      } else {
        await approveRequest(request.id, currentUser.id, currentUser.name || 'Admin');
      }
      await fetchRequests();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to approve: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectAction = async (request: ApprovalRequest) => {
    if (!currentUser) return;
    const reason = rejectionReason[request.id] || 'No reason provided';
    setProcessingId(request.id);
    try {
      await rejectRequest(request.id, currentUser.id, currentUser.name || 'Admin', reason);
      await fetchRequests();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to reject: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Check if current user can approve (based on role)
  const canApprove = (reqRole: string) => {
    if (!currentUser) return false;
    const role = currentUser.role;
    if (role === 'super_admin' || role === 'crm_admin') return true;
    if (role === 'admin' && reqRole !== 'super_admin' && reqRole !== 'crm_admin') return true;
    if (role === 'manager' && reqRole === 'manager') return true;
    return false;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Requests Manager
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Review and manage member assessments and package freeze requests.</p>
        </div>
        <Button variant="outline" onClick={fetchRequests} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Tabs defaultValue="assessments" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-3">
          <TabsTrigger value="assessments" className="flex items-center gap-2">
            <Target className="h-4 w-4" /> Assessments
            {assessments.filter(a => a.status === 'Pending').length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">{assessments.filter(a => a.status === 'Pending').length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="freezes" className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4" /> Package Freezes
            {freezes.filter(f => f.status === 'Pending').length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">{freezes.filter(f => f.status === 'Pending').length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Approvals
            {approvals.filter(a => a.status === 'pending').length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">{approvals.filter(a => a.status === 'pending').length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-4 space-y-4">
          {approvals.length === 0 && !loading && (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No pending approvals found.</CardContent></Card>
          )}
          {approvals.map(req => {
            const isProcessing = processingId === req.id;
            const hasPermission = canApprove(req.approverRole);
            
            return (
              <Card key={req.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-muted/60 font-mono">
                          {req.type.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <Badge variant={req.status === 'pending' ? 'secondary' : req.status === 'approved' ? 'default' : 'destructive'}>
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </Badge>
                        <span className="text-sm text-muted-foreground ml-auto">
                          Requested on {format(parseISO(req.createdAt), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-lg">
                          Target: {req.targetEntityType} ({req.targetEntityId.substring(0, 8)}...)
                        </h4>
                        <div className="text-sm text-muted-foreground mt-1">
                          <p><strong>Reason:</strong> {req.reason}</p>
                          <p><strong>Requester:</strong> {req.requesterName} ({req.requesterRole})</p>
                          {req.rejectionReason && (
                            <p className="text-destructive mt-1"><strong>Rejection Reason:</strong> {req.rejectionReason}</p>
                          )}
                        </div>
                      </div>

                      {/* Details Dump */}
                      {req.details && Object.keys(req.details).length > 0 && (
                        <div className="bg-muted p-3 rounded-md text-sm mt-2">
                          <p className="font-medium mb-1">Details:</p>
                          <ul className="list-disc pl-5 space-y-1">
                            {Object.entries(req.details).map(([key, value]) => (
                              <li key={key}><span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>: {String(value)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    
                    {req.status === 'pending' && (
                      <div className="flex flex-col gap-2 min-w-[200px] border-l pl-4">
                        {hasPermission ? (
                          <>
                            <Button size="sm" onClick={() => handleApproveAction(req)} disabled={isProcessing} className="w-full bg-green-600 hover:bg-green-700">
                              {isProcessing ? 'Processing...' : <><Check className="h-4 w-4 mr-2"/> Approve</>}
                            </Button>
                            
                            <div className="pt-2 border-t mt-2">
                              <Label className="text-xs text-muted-foreground mb-1 block">Rejection Reason</Label>
                              <Textarea 
                                className="h-16 text-xs resize-none mb-2"
                                placeholder="Required for rejection..."
                                value={rejectionReason[req.id] || ''}
                                onChange={(e) => setRejectionReason(prev => ({...prev, [req.id]: e.target.value}))}
                              />
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                className="w-full"
                                disabled={isProcessing || !rejectionReason[req.id]}
                                onClick={() => handleRejectAction(req)}
                              >
                                {isProcessing ? 'Processing...' : <><X className="h-4 w-4 mr-2"/> Reject</>}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground bg-muted p-3 rounded flex items-start gap-2 h-full">
                            <AlertCircle className="h-4 w-4 mt-0.5 text-amber-500" />
                            <span>Requires {req.approverRole} role or higher to approve.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="assessments" className="mt-4 space-y-4">
          {assessments.length === 0 && !loading && (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No assessment requests found.</CardContent></Card>
          )}
          {assessments.map(req => {
            const cleanPhone = (req.phone || '').replace(/[^0-9]/g, '');
            return (
              <Card key={req.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-5 flex flex-col md:flex-row gap-5 justify-between items-start">
                  <div className="space-y-3 flex-1">
                    {/* Header info */}
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-base">{req.clientName}</h3>
                      {req.membershipId && (
                        <Badge variant="outline" className="text-xs bg-muted/60 font-mono">
                          ID: {req.membershipId}
                        </Badge>
                      )}
                      {req.membershipType && (
                        <Badge variant="secondary" className="text-xs">
                          {req.membershipType}
                        </Badge>
                      )}
                      {req.ageGroup && (
                        <Badge variant="outline" className="text-xs">
                          Age: {req.ageGroup}
                        </Badge>
                      )}
                      <Badge variant="outline" className={req.status === 'Pending' ? 'bg-amber-500/10 text-amber-600 border-amber-300' : 'bg-emerald-500/10 text-emerald-600 border-emerald-300'}>
                        {req.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Requested: {req.createdAt ? format(parseISO(req.createdAt), 'dd MMM yyyy HH:mm') : 'Recently'}
                    </p>
                    
                    {/* Contact and schedule details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                      {req.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-muted-foreground">WhatsApp:</span>
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            {req.phone} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                      
                      {(req.timePeriod || req.preferredHour || req.preferredDate || req.preferredTime) && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-muted-foreground">Pref. Time:</span>
                          <span>{req.timePeriod || req.preferredDate || ''} {req.preferredHour || req.preferredTime ? `• ${req.preferredHour || req.preferredTime}` : ''}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Award className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-semibold text-muted-foreground">Coach Preference:</span>
                        <span>{req.preferredCoachName || req.coachName || (req.hasCoachPreference ? 'Preferred Coach' : 'Any Coach')}</span>
                      </div>

                      {req.referralSource && (
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-muted-foreground">Referral Source:</span>
                          <span className="font-medium">{req.referralSource}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Notes & Injuries */}
                    {(req.notes || req.injuries || req.goals) && (
                      <div className="text-xs bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg space-y-1">
                        {(req.notes || req.injuries) && (
                          <p>
                            <span className="font-bold text-amber-700 dark:text-amber-400">Notes / Injuries:</span>{' '}
                            <span className="text-foreground/90">{req.notes || req.injuries}</span>
                          </p>
                        )}
                        {req.goals && (
                          <p>
                            <span className="font-bold text-muted-foreground">Goals:</span>{' '}
                            <span className="text-foreground/90 italic">{req.goals}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Action Column */}
                  <div className="flex flex-col gap-2 w-full md:w-52 shrink-0 md:pt-1">
                    {req.status === 'Pending' ? (
                      <div className="flex flex-col gap-2">
                        <Label className="text-xs font-semibold text-muted-foreground">Assign Coach</Label>
                        <Select onValueChange={(val: string | null) => val && handleAssignAssessment(req.id, val)} disabled={processingId === req.id}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select Coach" />
                          </SelectTrigger>
                          <SelectContent>
                            {coaches.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="text-xs font-semibold flex items-center justify-end gap-1.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-4 w-4" /> Coach Assigned ({req.preferredCoachName || 'Assigned'})
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="freezes" className="mt-4 space-y-4">
          {freezes.length === 0 && !loading && (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No freeze requests found.</CardContent></Card>
          )}
          {freezes.map(req => (
            <Card key={req.id}>
              <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{req.clientName}</h3>
                    <Badge variant="outline" className={req.status === 'Pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}>
                      {req.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Package: {req.packageName}</p>
                  <p className="text-xs text-muted-foreground">Requested: {format(parseISO(req.createdAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
                
                <div className="flex gap-2">
                  {req.status === 'Pending' && (
                    <Button 
                      onClick={() => handleApproveFreeze(req.id)}
                      disabled={processingId === req.id}
                      className="bg-primary text-primary-foreground"
                    >
                      {processingId === req.id ? 'Approving...' : 'Approve (Extend 7 Days)'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
