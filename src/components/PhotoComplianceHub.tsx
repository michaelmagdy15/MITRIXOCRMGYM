import React, { useMemo, useState } from 'react';
import { Client } from '../types';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Camera, CheckCircle2, XCircle, Bell, ShieldAlert, Eye, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface PhotoComplianceHubProps {
  clients: Client[];
  onSelectClient?: (client: Client) => void;
  enabled?: boolean;
}

export const PhotoComplianceHub: React.FC<PhotoComplianceHubProps> = ({
  clients,
  onSelectClient,
  enabled = true,
}) => {
  const [openModal, setOpenModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'missing'>('pending');
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notifyingBulk, setNotifyingBulk] = useState(false);

  const isPhotoCheckMember = (client: Client) => {
    const status = String(client.status || '').trim().toLowerCase();
    return !client.isDeleted && ['active', 'nearly expired', 'hold', 'frozen'].includes(status);
  };

  const hasMemberPhoto = (client: Client) =>
    Boolean(String((client as any).photoURL || (client as any).photoUrl || (client as any).avatar || '').trim());

  const hasPendingPhoto = (client: Client) => Boolean(String(client.pendingPhotoURL || '').trim());

  const pendingPhotos = useMemo(() => {
    return clients.filter(
      (c) =>
        isPhotoCheckMember(c) &&
        hasPendingPhoto(c) &&
        c.photoModerationStatus === 'pending'
    );
  }, [clients]);

  const missingPhotos = useMemo(() => {
    return clients.filter(
      (c) =>
        isPhotoCheckMember(c) &&
        !hasMemberPhoto(c) &&
        !hasPendingPhoto(c)
    );
  }, [clients]);

  if (!enabled) return null;

  const handleApprovePhoto = async (member: Client) => {
    if (!member.pendingPhotoURL) return;
    setProcessingId(member.id);
    try {
      await updateDoc(doc(db, 'clients', member.id), {
        photoURL: member.pendingPhotoURL,
        pendingPhotoURL: '',
        photoModerationStatus: 'approved',
        photoStatus: 'APPROVED',
        photoRejectionReason: '',
        updatedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, 'clients', member.id, 'notifications'), {
        type: 'STATUS_CHANGED',
        title: 'Profile Picture Approved',
        body: 'Your profile picture has been approved by management and is now active on your digital pass.',
        read: false,
        createdAt: new Date().toISOString(),
        data: { target: 'profile' },
      }).catch(() => {});
    } catch (err) {
      console.error('Error approving photo:', err);
      alert('Failed to approve photo.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectPhoto = async (member: Client) => {
    const reason =
      (rejectReasons[member.id] || '').trim() ||
      'Photo does not meet gym rules (No caps, no sunglasses, clear front-facing face required, no inappropriate/uncensored imagery).';
    setProcessingId(member.id);
    try {
      await updateDoc(doc(db, 'clients', member.id), {
        pendingPhotoURL: '',
        photoModerationStatus: 'rejected',
        photoStatus: 'REJECTED',
        photoRejectionReason: reason,
        updatedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, 'clients', member.id, 'notifications'), {
        type: 'STATUS_CHANGED',
        title: 'Profile Picture Rejected — Please Re-upload',
        body: `Your uploaded photo could not be approved: "${reason}". Please upload a clear photo from the app or at reception.`,
        read: false,
        createdAt: new Date().toISOString(),
        data: { target: 'profile' },
      }).catch(() => {});
    } catch (err) {
      console.error('Error rejecting photo:', err);
      alert('Failed to reject photo.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleNotifyMissingPhoto = async (member: Client) => {
    setProcessingId(member.id);
    try {
      await addDoc(collection(db, 'clients', member.id, 'notifications'), {
        type: 'STATUS_CHANGED',
        title: 'Action Required: Upload Profile Picture',
        body: 'Hi! Please upload a clear profile picture on the mobile app (no caps or sunglasses) or have reception take your photo on your next visit.',
        read: false,
        createdAt: new Date().toISOString(),
        data: { target: 'profile' },
      });
      alert(`Sent mobile app notification to ${member.name}.`);
    } catch (err) {
      console.error('Failed to notify member:', err);
      alert('Failed to send notification.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleNotifyBatchMissing = async () => {
    const targets = missingPhotos.slice(0, 50);
    if (targets.length === 0) return;
    if (!window.confirm(`Send mobile app notification to ${targets.length} active members missing a profile photo?`)) return;
    setNotifyingBulk(true);
    try {
      for (const m of targets) {
        await addDoc(collection(db, 'clients', m.id, 'notifications'), {
          type: 'STATUS_CHANGED',
          title: 'Action Required: Upload Profile Picture',
          body: 'Hi! Please upload a clear profile picture on the mobile app (no caps or sunglasses) or have reception take your photo on your next visit.',
          read: false,
          createdAt: new Date().toISOString(),
          data: { target: 'profile' },
        }).catch(() => {});
      }
      alert(`Notified ${targets.length} active members on the mobile app to upload their profile picture.`);
    } finally {
      setNotifyingBulk(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <Camera className="w-4 h-4" />
            <span>Profile Photo Compliance & Moderation</span>
          </div>
          {pendingPhotos.length > 0 && (
            <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold text-[11px]">
              {pendingPhotos.length} Pending Photo Approval{pendingPhotos.length === 1 ? '' : 's'}
            </Badge>
          )}
          <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10 text-[11px]">
            {missingPhotos.length} Active Members Missing Profile Photo
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {pendingPhotos.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setActiveTab('pending');
                setOpenModal(true);
              }}
              className="h-8 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
              Review Pending Photos ({pendingPhotos.length})
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab(pendingPhotos.length > 0 ? 'pending' : 'missing');
              setOpenModal(true);
            }}
            className="h-8 rounded-xl border-amber-500/40 text-amber-300 hover:bg-amber-500/15 text-xs font-semibold"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Open Photo Compliance Hub
          </Button>
        </div>
      </div>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Camera className="w-5 h-5 text-amber-400" />
              Member Profile Photo Moderation & Missing Photo Alerts
            </DialogTitle>
            <DialogDescription>
              Gym Photo Rules: Clear front-facing face photo required. No caps/hats, no sunglasses, and no shirtless/naked or inappropriate imagery. Member photo uploads require admin confirmation before becoming active.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <Button
              type="button"
              variant={activeTab === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('pending')}
              className="rounded-xl text-xs font-bold"
            >
              Pending Approvals ({pendingPhotos.length})
            </Button>
            <Button
              type="button"
              variant={activeTab === 'missing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('missing')}
              className="rounded-xl text-xs font-bold"
            >
              Active Members Without Photo ({missingPhotos.length})
            </Button>
          </div>

          {activeTab === 'pending' ? (
            <div className="space-y-3">
              {pendingPhotos.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  <UserCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-70" />
                  All uploaded member photos have been reviewed!
                </div>
              ) : (
                pendingPhotos.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-3.5"
                  >
                    <div className="flex items-center gap-3.5">
                      <img
                        src={member.pendingPhotoURL}
                        alt={member.name}
                        className="w-16 h-16 rounded-xl object-cover border-2 border-amber-500/50 shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{member.name}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            #{member.memberId || member.barcode || 'N/A'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{member.phone}</p>
                        <div className="mt-2">
                          <Input
                            placeholder="Optional rejection reason (e.g. Wearing cap / sunglasses)..."
                            value={rejectReasons[member.id] || ''}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({ ...prev, [member.id]: e.target.value }))
                            }
                            className="h-8 text-xs rounded-lg bg-background w-full sm:w-72"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        type="button"
                        size="sm"
                        disabled={processingId === member.id}
                        onClick={() => handleApprovePhoto(member)}
                        className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={processingId === member.id}
                        onClick={() => handleRejectPhoto(member)}
                        className="h-8 rounded-lg text-xs font-bold"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 bg-muted/30 p-3 rounded-xl border border-border/50">
                <p className="text-xs text-muted-foreground">
                  Notify members via the mobile app to upload a compliant profile picture or visit the reception desk.
                </p>
                {missingPhotos.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={notifyingBulk}
                    onClick={handleNotifyBatchMissing}
                    className="h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0"
                  >
                    <Bell className="w-3.5 h-3.5 mr-1.5" />
                    {notifyingBulk ? 'Sending...' : `Notify Top ${Math.min(50, missingPhotos.length)} on App`}
                  </Button>
                )}
              </div>

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {missingPhotos.slice(0, 100).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/60 p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs truncate">{member.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          #{member.memberId || member.barcode || 'N/A'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {member.phone} · {member.packageType || 'Active Member'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={processingId === member.id}
                        onClick={() => handleNotifyMissingPhoto(member)}
                        className="h-7 rounded-lg text-[11px]"
                      >
                        <Bell className="w-3 h-3 mr-1" /> Notify on App
                      </Button>
                      {onSelectClient && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setOpenModal(false);
                            onSelectClient(member);
                          }}
                          className="h-7 rounded-lg text-[11px]"
                        >
                          Open Profile
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
