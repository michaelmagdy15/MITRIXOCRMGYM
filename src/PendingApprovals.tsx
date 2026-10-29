import React, { useMemo, useState } from 'react';
import {
  Clock,
  PackageCheck,
  Search,
  Camera,
  Check,
  X,
  CheckCircle2,
  AlertTriangle,
  Eye,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Client } from './types';
import { useAppContext } from './context';
import { useAuth } from './contexts/AuthContext';
import { buildWhatsAppPhotoRejectionUrl, openWhatsAppUrl } from './utils/whatsappTemplates';

export default function PendingApprovals() {
  const { clients, packages, setActiveTab, setActiveClientId, updateClient, branding } = useAppContext();
  const { activateFromPending } = useAuth();

  const [activeTabValue, setActiveTabValue] = useState<string>('onboarding');
  const [search, setSearch] = useState('');
  const [selectedPackages, setSelectedPackages] = useState<Record<string, string>>({});
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Photo moderation state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [rejectingClient, setRejectingClient] = useState<Client | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const clubName = branding?.companyName || 'Inzan Athletics';

  // 1. Pending Signup Onboarding
  const pendingClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter(c => String(c.status || '').toUpperCase() === 'PENDING_ONBOARDING')
      .filter(c => {
        if (!q) return true;
        return [c.name, c.phone, c.memberId, c.email].filter(Boolean).join(' ').toLowerCase().includes(q);
      });
  }, [clients, search]);

  // 2. Pending Photo Approvals
  const pendingPhotoClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter(c => {
        const hasPendingUrl = Boolean(c.pendingPhotoURL && c.pendingPhotoURL.trim().length > 0);
        const isPending =
          c.photoStatus === 'PENDING_APPROVAL' ||
          c.photoModerationStatus === 'pending' ||
          (hasPendingUrl && c.photoStatus !== 'APPROVED' && c.photoStatus !== 'REJECTED');
        return hasPendingUrl && isPending;
      })
      .filter(c => {
        if (!q) return true;
        return [c.name, c.phone, c.memberId, c.email].filter(Boolean).join(' ').toLowerCase().includes(q);
      });
  }, [clients, search]);

  const activePackages = packages.filter(p => p.isActive !== false && p.is_active !== false && !p.archivedAt);

  const handleActivate = async (clientId: string) => {
    const pkgId = selectedPackages[clientId];
    const pkg = activePackages.find(p => p.id === pkgId);
    setActivatingId(clientId);
    try {
      const now = new Date();
      const packagePayload = pkg ? [{
        id: pkg.id,
        packageId: pkg.id,
        packageName: pkg.name,
        name: pkg.name,
        sessionsTotal: pkg.sessions,
        sessionsRemaining: pkg.sessions,
        price: pkg.price,
        status: 'Active',
        startDate: now.toISOString(),
      }] : undefined;

      await activateFromPending(clientId, {
        packageType: pkg?.name,
        sessionsRemaining: pkg?.sessions,
        packages: packagePayload as any,
      } as any);
      toast.success('Member activated successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to activate member.');
    } finally {
      setActivatingId(null);
    }
  };

  // Approve Photo Action
  const handleApprovePhoto = async (client: Client) => {
    if (!client.pendingPhotoURL) {
      toast.error('No pending photo URL found.');
      return;
    }
    setActionInProgressId(client.id);
    try {
      await updateClient(client.id, {
        photoURL: client.pendingPhotoURL,
        pendingPhotoURL: '',
        photoStatus: 'APPROVED',
        photoModerationStatus: 'approved',
        photoRejectionReason: '',
      });
      toast.success(`Photo approved for ${client.name}. Updated profile picture is now active.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve photo.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Initiate Reject Photo
  const handleOpenRejectModal = (client: Client) => {
    setRejectingClient(client);
    setRejectionReason('Face is not clearly visible or covered');
  };

  // Submit Reject Photo Action
  const handleSubmitRejectPhoto = async () => {
    if (!rejectingClient) return;
    const finalReason = rejectionReason.trim() || 'Photo does not meet profile photo guidelines.';
    setActionInProgressId(rejectingClient.id);
    try {
      await updateClient(rejectingClient.id, {
        photoStatus: 'REJECTED',
        photoModerationStatus: 'rejected',
        photoRejectionReason: finalReason,
      });

      toast.success(`Photo rejected for ${rejectingClient.name}.`);

      // Optionally offer WhatsApp notification
      if (rejectingClient.phone) {
        const waUrl = buildWhatsAppPhotoRejectionUrl({
          clientName: rejectingClient.name,
          clientPhone: rejectingClient.phone,
          reason: finalReason,
          clubName,
        });
        if (waUrl) {
          toast('Notify Member via WhatsApp?', {
            description: `Send rejection explanation to ${rejectingClient.name}.`,
            action: {
              label: 'Open WhatsApp',
              onClick: () => openWhatsAppUrl(waUrl),
            },
            duration: 9000,
          });
        }
      }

      setRejectingClient(null);
      setRejectionReason('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject photo.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const commonRejectionReasons = [
    'Face is not clearly visible or covered',
    'Sunglasses or face-covering caps are not allowed',
    'Inappropriate gym attire (uncovered/uncensored)',
    'Blurry or low-resolution image',
    'Group photo or face not centered in frame',
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Manage onboarding activations and profile picture governance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingClients.length > 0 && (
            <Badge variant="outline" className="font-bold border-amber-500/40 text-amber-600">
              {pendingClients.length} Onboarding
            </Badge>
          )}
          {pendingPhotoClients.length > 0 && (
            <Badge variant="outline" className="font-bold border-violet-500/40 text-violet-600">
              {pendingPhotoClients.length} Photos
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTabValue} onValueChange={setActiveTabValue} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="grid grid-cols-2 w-full sm:w-[380px]">
            <TabsTrigger value="onboarding" className="gap-2 font-bold text-xs sm:text-sm">
              <UserCheck className="h-4 w-4" />
              <span>Onboarding</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                {pendingClients.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-2 font-bold text-xs sm:text-sm">
              <Camera className="h-4 w-4" />
              <span>Photo Approvals</span>
              <Badge
                variant="secondary"
                className={`ml-1 text-[10px] px-1.5 py-0 h-4 ${
                  pendingPhotoClients.length > 0 ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300 font-black' : ''
                }`}
              >
                {pendingPhotoClients.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, or member ID..."
              className="pl-9 h-9 text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Tab 1: Signup Onboarding Approvals */}
        <TabsContent value="onboarding" className="space-y-4 pt-3">
          {pendingClients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-3 opacity-60" />
                <p className="text-sm">No pending member onboarding accounts.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pendingClients.map(client => (
                <Card key={client.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{client.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {client.memberId ? `#${client.memberId}` : 'No member ID'} · {client.phone || 'No phone'}
                        </p>
                      </div>
                      <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20">Pending</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col lg:flex-row lg:items-end gap-3">
                    <div className="space-y-1.5 flex-1 min-w-[220px]">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">Assign Package</Label>
                      <Select
                        value={selectedPackages[client.id] || ''}
                        onValueChange={(value) => setSelectedPackages(prev => ({ ...prev, [client.id]: value || '' }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Activate without package" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePackages.map(pkg => (
                            <SelectItem key={pkg.id} value={pkg.id}>
                              {pkg.name} · {pkg.sessions} sessions · {pkg.price} LE
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setActiveTab('clients');
                          setActiveClientId(client.id);
                        }}
                      >
                        View
                      </Button>
                      <Button
                        disabled={activatingId === client.id}
                        onClick={() => handleActivate(client.id)}
                        className="gap-2 font-bold"
                      >
                        <PackageCheck className="h-4 w-4" />
                        {activatingId === client.id ? 'Activating...' : 'Assign Package & Activate'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Profile Picture Governance Approvals */}
        <TabsContent value="photos" className="space-y-4 pt-3">
          {pendingPhotoClients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500 opacity-80" />
                <p className="text-sm font-semibold">No pending profile photo submissions.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All uploaded profile photos have been reviewed and approved.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingPhotoClients.map(client => {
                const isProcessing = actionInProgressId === client.id;
                return (
                  <Card key={client.id} className="overflow-hidden border border-border/70 shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-bold">{client.name}</CardTitle>
                          {client.memberId && (
                            <Badge variant="outline" className="text-xs">
                              #{client.memberId}
                            </Badge>
                          )}
                          {client.branch && (
                            <span className="text-xs text-muted-foreground">· {client.branch}</span>
                          )}
                        </div>
                        <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-semibold text-xs">
                          Photo Pending Approval
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Phone: {client.phone || 'N/A'} {client.email ? `· Email: ${client.email}` : ''}
                        {client.pendingPhotoUploadedAt && ` · Uploaded: ${new Date(client.pendingPhotoUploadedAt).toLocaleString()}`}
                      </p>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-5">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                        {/* Image Preview Area */}
                        <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center">
                          <div className="relative group rounded-2xl overflow-hidden border-2 border-violet-500/40 shadow-md bg-muted aspect-square w-48 sm:w-52 flex items-center justify-center">
                            {client.pendingPhotoURL ? (
                              <img
                                src={client.pendingPhotoURL}
                                alt={client.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Camera className="h-10 w-10 text-muted-foreground" />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (client.pendingPhotoURL) {
                                  setPreviewImage({ url: client.pendingPhotoURL, title: `${client.name} - Pending Photo` });
                                }
                              }}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold"
                            >
                              <Maximize2 className="h-4 w-4" />
                              Enlarge
                            </button>
                          </div>

                          {client.photoURL && (
                            <div className="mt-2 text-center">
                              <span className="text-[11px] text-muted-foreground">Replaces existing photo</span>
                            </div>
                          )}
                        </div>

                        {/* Gym Guidelines Checklist */}
                        <div className="md:col-span-8 lg:col-span-9 space-y-4">
                          <div className="bg-muted/40 rounded-2xl p-4 border border-border/40 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              <ShieldCheck className="h-4 w-4 text-violet-600" />
                              Gym Guidelines Verification Checklist
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-card border border-border/40">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div className="text-xs">
                                  <div className="font-semibold text-foreground">Clear facial view</div>
                                  <div className="text-[11px] text-muted-foreground">Direct front view, well-lit, unobstructed</div>
                                </div>
                              </div>

                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-card border border-border/40">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div className="text-xs">
                                  <div className="font-semibold text-foreground">No sunglasses or caps</div>
                                  <div className="text-[11px] text-muted-foreground">Eyes and face fully visible for check-ins</div>
                                </div>
                              </div>

                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-card border border-border/40">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div className="text-xs">
                                  <div className="font-semibold text-foreground">Appropriate gym attire</div>
                                  <div className="text-[11px] text-muted-foreground">Clean athletic wear, no uncensored imagery</div>
                                </div>
                              </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground pt-1">
                              Approval moves this picture to official member records for face scanning, turnstile kiosk, and front desk check-in.
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setActiveTab('clients');
                                  setActiveClientId(client.id);
                                }}
                                className="h-9 text-xs"
                              >
                                View Profile
                              </Button>
                              {client.phone && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const waUrl = `https://wa.me/${client.phone?.replace(/\D/g, '')}`;
                                    openWhatsAppUrl(waUrl);
                                  }}
                                  className="h-9 text-xs gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  Chat
                                </Button>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleOpenRejectModal(client)}
                                className="h-9 text-xs font-bold gap-1.5 text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                              >
                                <X className="h-4 w-4" />
                                Reject Photo
                              </Button>

                              <Button
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleApprovePhoto(client)}
                                className="h-9 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Check className="h-4 w-4" />
                                {isProcessing ? 'Approving...' : 'Approve Photo'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reject Reason Modal Dialog */}
      <Dialog open={Boolean(rejectingClient)} onOpenChange={(open) => !open && setRejectingClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Reject Profile Picture
            </DialogTitle>
            <DialogDescription>
              Specify why the photo for <strong>{rejectingClient?.name}</strong> was rejected. The reason will be recorded on their profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Common Reasons</Label>
            <div className="space-y-1.5">
              {commonRejectionReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectionReason(reason)}
                  className={`w-full text-left text-xs p-2 rounded-lg border transition-all ${
                    rejectionReason === reason
                      ? 'border-rose-500 bg-rose-500/10 font-bold text-foreground'
                      : 'border-border/40 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 pt-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Custom Reason or Notes</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain what needs correction..."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setRejectingClient(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmitRejectPhoto}
              disabled={actionInProgressId === rejectingClient?.id || !rejectionReason.trim()}
              className="gap-1.5 font-bold"
            >
              <X className="h-4 w-4" />
              {actionInProgressId === rejectingClient?.id ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Zoom Dialog */}
      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-xl p-3">
          <DialogHeader className="p-2">
            <DialogTitle className="text-sm font-bold">{previewImage?.title}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl overflow-hidden bg-black/90 flex items-center justify-center p-2 max-h-[75vh]">
            {previewImage && (
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
