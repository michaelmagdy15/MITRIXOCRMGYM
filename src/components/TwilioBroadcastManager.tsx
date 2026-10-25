import React, { useState, useEffect, useCallback } from 'react';
import { auth, getTenantId } from '../firebase';
import { useAppContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  Send,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Users,
  DollarSign,
  PhoneCall,
  History,
  Copy,
  RefreshCw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface AudienceCounts {
  activeMembers: number;
  allMembers: number;
  leadsOnly: number;
  allContacts: number;
}

interface PricingRates {
  whatsappUtility: number;
  whatsappMarketing: number;
  twilioFeeOnly: number;
  smsStandard: number;
}

interface BroadcastHistoryItem {
  id: string;
  channel: 'whatsapp' | 'sms';
  audience: string;
  branch: string;
  brandName: string;
  title: string;
  message: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  estimatedCostUsd: number;
  createdAt: string;
  sentBy: string;
}

export interface TwilioBroadcastManagerProps {
  compact?: boolean;
}

export default function TwilioBroadcastManager({ compact = false }: TwilioBroadcastManagerProps) {
  const { branding, branches, currentUser } = useAppContext();
  const tenantId = getTenantId();
  const isInzan =
    tenantId === 'inzanathletics' ||
    tenantId.toLowerCase().includes('inzan') ||
    (branding.companyName || '').toLowerCase().includes('inzan');

  const defaultBrand = isInzan ? 'INZAN Athletics' : branding.companyName || 'STRIKE';

  // Configuration state
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [showConfigPanel, setShowConfigPanel] = useState(!compact);
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [authTokenMasked, setAuthTokenMasked] = useState('');
  const [whatsappFrom, setWhatsappFrom] = useState('');
  const [smsFrom, setSmsFrom] = useState(isInzan ? 'INZAN' : 'STRIKE');
  const [messagingServiceSid, setMessagingServiceSid] = useState('');
  const [contentSid, setContentSid] = useState('');
  const [brandName, setBrandName] = useState(defaultBrand);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Audience & Pricing state
  const [audienceCounts, setAudienceCounts] = useState<AudienceCounts>({
    activeMembers: 0,
    allMembers: 0,
    leadsOnly: 0,
    allContacts: 0,
  });
  const [pricingUsd, setPricingUsd] = useState<PricingRates>({
    whatsappUtility: 0.0086,
    whatsappMarketing: 0.0694,
    twilioFeeOnly: 0.005,
    smsStandard: 0.3959,
  });

  // Broadcast composer state
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [audience, setAudience] = useState<
    'active_members' | 'all_members' | 'leads_only' | 'all_contacts' | 'custom_list'
  >('active_members');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [customNumbers, setCustomNumbers] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [useTemplate, setUseTemplate] = useState(false);
  const [alsoSendInAppAndPush, setAlsoSendInAppAndPush] = useState(true);

  // Test message state
  const [testPhone, setTestPhone] = useState('+201000680580');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Broadcast execution state
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    sentCount: number;
    failedCount: number;
    totalRecipients: number;
    estimatedCostUsd: number;
    sampleErrors?: { phone: string; name: string; error: string }[];
  } | null>(null);
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);

  const getAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const loadConfigAndCounts = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const headers = await getAuthHeaders();
      const query = branchFilter !== 'ALL' ? `?branch=${encodeURIComponent(branchFilter)}` : '';
      const [cfgRes, histRes] = await Promise.all([
        fetch(`/api/messaging/config${query}`, { headers }),
        fetch('/api/messaging/history', { headers }),
      ]);

      if (cfgRes.ok) {
        const data = await cfgRes.json();
        if (data.config) {
          setAccountSid(data.config.accountSid || '');
          setHasSavedToken(Boolean(data.config.hasAuthToken));
          setAuthTokenMasked(data.config.authTokenMasked || '');
          setWhatsappFrom(data.config.whatsappFrom || '');
          setSmsFrom(data.config.smsFrom || (isInzan ? 'INZAN' : 'STRIKE'));
          setMessagingServiceSid(data.config.messagingServiceSid || '');
          setContentSid(data.config.contentSid || '');
          setBrandName(data.config.brandName || defaultBrand);
          if (!data.config.accountSid || !data.config.hasAuthToken) {
            setShowConfigPanel(true);
          }
        }
        if (data.audienceCounts) {
          setAudienceCounts(data.audienceCounts);
        }
        if (data.pricingUsd) {
          setPricingUsd(data.pricingUsd);
        }
      }

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.history || []);
      }
    } catch (err) {
      console.error('[TwilioBroadcastManager] Error loading config:', err);
    } finally {
      setLoadingConfig(false);
    }
  }, [branchFilter, defaultBrand, getAuthHeaders, isInzan]);

  useEffect(() => {
    loadConfigAndCounts();
  }, [loadConfigAndCounts]);

  const handleSaveConfig = async () => {
    if (!accountSid.trim()) {
      toast.error('Please enter your Twilio Account SID (starts with AC...)');
      return;
    }
    setIsSavingConfig(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/messaging/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountSid: accountSid.trim(),
          authToken: authToken.trim() || undefined,
          whatsappFrom: whatsappFrom.trim(),
          smsFrom: smsFrom.trim(),
          messagingServiceSid: messagingServiceSid.trim(),
          contentSid: contentSid.trim(),
          brandName: brandName.trim() || defaultBrand,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save Twilio settings');
      }
      setHasSavedToken(Boolean(data.config?.hasAuthToken));
      setAuthTokenMasked(data.config?.authTokenMasked || '');
      setAuthToken('');
      toast.success('Twilio configuration saved securely!');
    } catch (err: any) {
      toast.error(err.message || 'Error saving configuration');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.error('Enter a phone number to receive the test message.');
      return;
    }
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/messaging/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: testPhone.trim(),
          title: title.trim() || 'Important Event Tomorrow',
          message:
            message.trim() ||
            `Hello {firstName}! Don't miss our special event happening tomorrow at ${brandName}. We look forward to seeing you!`,
          channel,
          accountSid: accountSid.trim() || undefined,
          authToken: authToken.trim() || undefined,
          whatsappFrom: whatsappFrom.trim() || undefined,
          smsFrom: smsFrom.trim() || undefined,
          messagingServiceSid: messagingServiceSid.trim() || undefined,
          contentSid: contentSid.trim() || undefined,
          brandName: brandName.trim() || defaultBrand,
          useTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({
          type: 'error',
          text: data.error || 'Twilio rejected the test message.',
        });
        toast.error(data.error || 'Test message failed');
      } else {
        setTestResult({
          type: 'success',
          text: `Delivered to Twilio (${data.status || 'queued'}) — SID: ${data.sid}`,
        });
        toast.success(`Test ${channel.toUpperCase()} sent to ${testPhone}!`);
      }
    } catch (err: any) {
      setTestResult({ type: 'error', text: err.message || 'Network error' });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Compute recipient count and estimated cost
  const selectedRecipientCount = React.useMemo(() => {
    if (audience === 'custom_list') {
      return customNumbers
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.replace(/\D/g, '').length >= 10).length;
    }
    if (audience === 'active_members') return audienceCounts.activeMembers;
    if (audience === 'all_members') return audienceCounts.allMembers;
    if (audience === 'leads_only') return audienceCounts.leadsOnly;
    return audienceCounts.allContacts;
  }, [audience, audienceCounts, customNumbers]);

  const estimatedCostUsd = React.useMemo(() => {
    const unitRate =
      channel === 'whatsapp' ? pricingUsd.whatsappUtility : pricingUsd.smsStandard;
    return (selectedRecipientCount * unitRate).toFixed(2);
  }, [channel, pricingUsd, selectedRecipientCount]);

  const previewText = React.useMemo(() => {
    const sampleBody =
      message.trim() ||
      `Hello Ahmed, important reminder from ${brandName}: Join us tomorrow for our special event!`;
    const personalized = sampleBody
      .replace(/\{memberName\}/gi, 'Ahmed Mohamed')
      .replace(/\{name\}/gi, 'Ahmed Mohamed')
      .replace(/\{firstName\}/gi, 'Ahmed')
      .replace(/\{clubName\}/gi, brandName);

    const hasBrand = personalized.toLowerCase().includes(brandName.toLowerCase());
    if (channel === 'whatsapp') {
      const lines: string[] = [];
      if (!hasBrand) {
        lines.push(`🏋️ *${brandName}*`, '');
      }
      if (title.trim()) {
        lines.push(`📢 *${title.trim()}*`, '');
      }
      lines.push(personalized);
      return lines.join('\n');
    }
    return `${!hasBrand ? `${brandName}: ` : ''}${title.trim() ? `${title.trim()} - ` : ''}${personalized}`;
  }, [brandName, channel, message, title]);

  const handleLoadEventPreset = () => {
    setBrandName('INZAN Athletics');
    setTitle('Important Event Tomorrow at INZAN Athletics');
    setMessage(
      `Hi {firstName}! 🙌\n\nImportant announcement from *INZAN Athletics*: We have a special club event happening tomorrow! Make sure to arrive early and bring your training gear.\n\n📍 Location: INZAN Athletics\nSee you on the floor! 💪`
    );
  };

  const handleLaunchBroadcast = async () => {
    if (!message.trim()) {
      toast.error('Please enter a broadcast message.');
      return;
    }
    if (selectedRecipientCount === 0) {
      toast.error('No valid phone numbers found in the selected audience.');
      return;
    }
    const confirmMsg = `Send ${channel.toUpperCase()} broadcast from "${brandName}" to ${selectedRecipientCount.toLocaleString()} unique phone numbers?\n\nEstimated Twilio + Meta cost: ~$${estimatedCostUsd} USD`;
    if (!window.confirm(confirmMsg)) return;

    setIsBroadcasting(true);
    setBroadcastResult(null);
    try {
      // 1. Optional In-App Portal Popup & Mobile Push Broadcast
      if (alsoSendInAppAndPush) {
        try {
          const { notifyAllMembers } = await import('../services/pushService');
          await notifyAllMembers(
            title.trim() || `${brandName} Announcement`,
            message.trim().replace(/\{firstName\}|\{memberName\}|\{name\}/gi, 'Member'),
            {
              createdByName: currentUser?.name || currentUser?.email || `${brandName} Admin`,
              createdById: currentUser?.id || 'admin',
              branch: branchFilter,
            }
          );
        } catch (pushErr) {
          console.warn('[TwilioBroadcastManager] In-app/push secondary error:', pushErr);
        }
      }

      // 2. Execute Twilio WhatsApp / SMS Broadcast
      const headers = await getAuthHeaders();
      const res = await fetch('/api/messaging/broadcast', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          channel,
          audience,
          branch: branchFilter,
          customNumbers,
          useTemplate,
          contentSid: contentSid.trim() || undefined,
          brandName: brandName.trim() || defaultBrand,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Broadcast failed');
      }

      setBroadcastResult({
        sentCount: data.sentCount,
        failedCount: data.failedCount,
        totalRecipients: data.totalRecipients,
        estimatedCostUsd: data.estimatedCostUsd,
        sampleErrors: data.sampleErrors || [],
      });

      toast.success(
        `Broadcast complete! Sent ${data.sentCount.toLocaleString()} of ${data.totalRecipients.toLocaleString()} messages.`
      );
      await loadConfigAndCounts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute broadcast');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const utilityTemplateCopyText = `🏋️ *INZAN Athletics — Official Member Notice*\n\nHello {{1}},\n\n{{2}}\n\nThank you,\nINZAN Athletics Management`;

  return (
    <div className="space-y-6">
      {/* Header & Cost Comparison Banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/[0.03] shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-extrabold">
                <MessageSquare className="h-5 w-5 text-emerald-500" />
                Twilio WhatsApp &amp; SMS Broadcast Engine ({brandName})
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Direct official broadcasting via Twilio API + In-App Portal Modal + Mobile Push. Automatic deduplication &amp; E.164 Egyptian number validation.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  accountSid && hasSavedToken
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                }
              >
                {accountSid && hasSavedToken ? '● Twilio Connected' : '○ Twilio Setup Needed'}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowConfigPanel((v) => !v)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {showConfigPanel ? 'Hide Twilio Setup' : 'Configure Twilio'}
                {showConfigPanel ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Live Audience Cost Breakdown Pills */}
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/50 text-xs">
            <div className="p-3 rounded-xl bg-background/80 border flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">Active Members Only</p>
                <p className="text-muted-foreground">
                  {audienceCounts.activeMembers.toLocaleString()} unique valid numbers
                </p>
              </div>
              <Badge className="bg-emerald-600 text-white font-mono">
                ~${(audienceCounts.activeMembers * pricingUsd.whatsappUtility).toFixed(2)} USD
              </Badge>
            </div>
            <div className="p-3 rounded-xl bg-background/80 border flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">All Members (Active + Expired)</p>
                <p className="text-muted-foreground">
                  {audienceCounts.allMembers.toLocaleString()} unique valid numbers
                </p>
              </div>
              <Badge variant="secondary" className="font-mono">
                ~${(audienceCounts.allMembers * pricingUsd.whatsappUtility).toFixed(2)} USD
              </Badge>
            </div>
            <div className="p-3 rounded-xl bg-background/80 border flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">Sender Identity</p>
                <p className="text-muted-foreground">Displays to all recipients as:</p>
              </div>
              <Badge variant="outline" className="font-extrabold tracking-wide">
                {brandName}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible Twilio Credentials & Template Setup */}
      {showConfigPanel && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Twilio API Credentials &amp; &ldquo;{brandName}&rdquo; Sender Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Stored securely on the server per tenant. Paste your credentials from{' '}
              <a
                href="https://console.twilio.com"
                target="_blank"
                rel="noreferrer"
                className="underline text-primary font-semibold"
              >
                console.twilio.com
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Twilio Account SID *</Label>
                <Input
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Twilio Auth Token *{' '}
                  {hasSavedToken && (
                    <span className="text-emerald-500 font-normal">
                      (Saved: {authTokenMasked})
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder={
                    hasSavedToken
                      ? 'Leave blank to keep saved token, or paste new token'
                      : 'Paste Twilio Auth Token'
                  }
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Sender Brand Name (Shown to Members) *
                </Label>
                <Input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="INZAN Athletics"
                  className="font-bold text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  WhatsApp Sender Number (Twilio)
                </Label>
                <Input
                  value={whatsappFrom}
                  onChange={(e) => setWhatsappFrom(e.target.value)}
                  placeholder="e.g. +2010... or +14155238886"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  From Twilio Console → Messaging → Senders → WhatsApp Senders.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  WhatsApp Utility Template SID (Optional)
                </Label>
                <Input
                  value={contentSid}
                  onChange={(e) => setContentSid(e.target.value)}
                  placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Unlocks $0.0086/msg Utility rate in Egypt outside 24h window.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  SMS Sender ID / From Number
                </Label>
                <Input
                  value={smsFrom}
                  onChange={(e) => setSmsFrom(e.target.value)}
                  placeholder="INZAN or +1..."
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Alphanumeric Sender ID (max 11 chars, e.g. INZAN) or Twilio number.
                </p>
              </div>
            </div>

            {/* Helper Box for $6-$11 Utility Template Approval */}
            <div className="p-3.5 rounded-xl bg-muted/50 border text-xs space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  How to get the ~$6.17 USD price (instead of $89 Marketing rate) in Twilio:
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(utilityTemplateCopyText);
                    toast.success('Copied Utility Template text to clipboard!');
                  }}
                >
                  <Copy className="h-3 w-3" /> Copy Utility Template Text
                </Button>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                In Egypt, Meta charges <strong>$0.0036</strong> for <strong>Utility</strong> templates vs <strong>$0.0644</strong> for Marketing templates (+ Twilio&apos;s $0.005 fee = <strong>$0.0086/msg total</strong>). In Twilio Console → <em>Messaging → Content Template Builder</em>, create a template with Category = <strong>Utility</strong>, paste the template text above, and copy the resulting <code>HX...</code> Content SID into the box above.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
              {/* Quick Single-Number Test */}
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+2010..."
                  className="max-w-[200px] font-mono text-xs h-9"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSendTest}
                  disabled={isSendingTest}
                  className="h-9 text-xs font-semibold gap-1.5 shrink-0"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  {isSendingTest ? 'Sending Test...' : `Send Test ${channel.toUpperCase()}`}
                </Button>
                {testResult && (
                  <span
                    className={`text-xs font-medium truncate ${
                      testResult.type === 'success' ? 'text-emerald-500' : 'text-destructive'
                    }`}
                  >
                    {testResult.text}
                  </span>
                )}
              </div>

              <Button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="h-9 text-xs font-bold gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isSavingConfig ? 'Saving...' : 'Save Twilio Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Broadcast Composer & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base font-bold">
                  Compose Broadcast Campaign
                </CardTitle>
                <CardDescription className="text-xs">
                  Select your channel, target audience, and message content.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadEventPreset}
                className="h-8 text-xs gap-1.5 border-primary/30 text-primary"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Load &ldquo;Tomorrow&apos;s Event&rdquo; Template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Channel & Audience Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Broadcast Channel</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp')}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      channel === 'whatsapp'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500 shadow-2xs'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    WhatsApp ($0.0086)
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel('sms')}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      channel === 'sms'
                        ? 'bg-primary/15 border-primary text-primary shadow-2xs'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Twilio SMS
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Target Member Audience</Label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold"
                >
                  <option value="active_members">
                    Active Members Only ({audienceCounts.activeMembers.toLocaleString()} numbers — Best Value)
                  </option>
                  <option value="all_members">
                    All Members: Active + Expired ({audienceCounts.allMembers.toLocaleString()} numbers)
                  </option>
                  <option value="all_contacts">
                    All Contacts: Members + Leads ({audienceCounts.allContacts.toLocaleString()} numbers)
                  </option>
                  <option value="leads_only">
                    Leads &amp; Prospects Only ({audienceCounts.leadsOnly.toLocaleString()} numbers)
                  </option>
                  <option value="custom_list">Custom Phone Number List</option>
                </select>
              </div>
            </div>

            {/* Branch Filter & Custom Numbers */}
            {audience !== 'custom_list' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Branch Filter</Label>
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="w-full h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium"
                  >
                    <option value="ALL">All Branches</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                {channel === 'whatsapp' && contentSid && (
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer p-2 rounded-lg border bg-muted/30">
                      <input
                        type="checkbox"
                        checked={useTemplate}
                        onChange={(e) => setUseTemplate(e.target.checked)}
                        className="rounded"
                      />
                      <span>Use Approved Twilio Content Template ({contentSid.slice(0, 10)}…)</span>
                    </label>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Paste Phone Numbers (comma or newline separated)
                </Label>
                <Textarea
                  value={customNumbers}
                  onChange={(e) => setCustomNumbers(e.target.value)}
                  placeholder="+201094049666, 01114748862..."
                  rows={2}
                  className="font-mono text-xs"
                />
              </div>
            )}

            {/* Event Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Announcement Headline / Event Title
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. Important Event Tomorrow at ${brandName}`}
                className="text-xs"
              />
            </div>

            {/* Message Body with Placeholders */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <Label className="text-xs font-semibold">Message Body *</Label>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">Insert:</span>
                  {['{firstName}', '{memberName}', '{clubName}'].map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => setMessage((prev) => `${prev}${prev ? ' ' : ''}${ph}`)}
                      className="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-primary/20 font-mono transition-colors cursor-pointer"
                    >
                      {ph}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Hi {firstName}! Important update from ${brandName} regarding tomorrow's event...`}
                rows={4}
                className="text-xs leading-relaxed"
              />
            </div>

            {/* Multi-channel In-App + Push toggle */}
            <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer p-2.5 rounded-xl border bg-muted/30">
              <input
                type="checkbox"
                checked={alsoSendInAppAndPush}
                onChange={(e) => setAlsoSendInAppAndPush(e.target.checked)}
                className="rounded"
              />
              <span>
                Also publish as an <strong>In-App Full-Screen Banner</strong> on the Member Portal &amp; send <strong>Mobile Push Notifications</strong> (Free)
              </span>
            </label>

            {/* Launch Button */}
            <div className="flex items-center justify-between pt-2 border-t gap-3">
              <div className="text-xs">
                <span className="text-muted-foreground">Target: </span>
                <strong className="text-foreground">
                  {selectedRecipientCount.toLocaleString()} unique numbers
                </strong>
                <span className="mx-1.5 text-muted-foreground">•</span>
                <span className="text-muted-foreground">Est. Cost: </span>
                <strong className="text-emerald-500 font-mono">${estimatedCostUsd} USD</strong>
              </div>

              <Button
                type="button"
                onClick={handleLaunchBroadcast}
                disabled={isBroadcasting || !message.trim() || selectedRecipientCount === 0}
                className="rounded-xl px-5 h-10 text-xs font-extrabold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {isBroadcasting
                  ? `Broadcasting to ${selectedRecipientCount.toLocaleString()} Members...`
                  : `Send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} Broadcast (${selectedRecipientCount.toLocaleString()})`}
              </Button>
            </div>

            {/* Broadcast Result Summary */}
            {broadcastResult && (
              <div className="p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-500 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Broadcast Dispatched!
                  </span>
                  <span className="font-mono">
                    Sent: <strong>{broadcastResult.sentCount}</strong> /{' '}
                    {broadcastResult.totalRecipients} (Failed: {broadcastResult.failedCount})
                  </span>
                </div>
                {broadcastResult.sampleErrors && broadcastResult.sampleErrors.length > 0 && (
                  <div className="text-destructive space-y-1 pt-1 border-t border-destructive/20">
                    <p className="font-semibold">Sample delivery warnings:</p>
                    {broadcastResult.sampleErrors.slice(0, 3).map((e, i) => (
                      <p key={i} className="font-mono text-[11px]">
                        • {e.name} ({e.phone}): {e.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Phone Preview & Recent History (Right 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Live Member Phone Preview</span>
                <Badge variant="outline" className="text-[10px]">
                  Sender: {brandName}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-[#0b141a] text-white p-4 border border-zinc-800 space-y-3 shadow-inner">
                {/* WhatsApp Top Bar */}
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-black text-xs">
                    {brandName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate flex items-center gap-1">
                      {brandName}
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    </p>
                    <p className="text-[10px] text-zinc-400">Official Business Account</p>
                  </div>
                </div>

                {/* Message Bubble */}
                <div className="bg-[#005c4b] rounded-xl rounded-tl-xs p-3 text-xs whitespace-pre-wrap leading-relaxed shadow-sm">
                  {previewText}
                  <div className="text-[10px] text-emerald-200/70 text-right mt-1">
                    12:00 PM ✓✓
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Broadcast History */}
          {!compact && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" />
                    Recent Broadcast Logs ({history.length})
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={loadConfigAndCounts}
                    disabled={loadingConfig}
                    className="h-7 px-2"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingConfig ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[240px] overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    No WhatsApp/SMS broadcasts sent yet.
                  </p>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl border bg-muted/20 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">
                          {item.title || item.brandName}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {item.channel}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground line-clamp-1">{item.message}</p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                        <span>
                          Sent: <strong className="text-emerald-500">{item.sentCount}</strong> /{' '}
                          {item.totalRecipients}
                        </span>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
