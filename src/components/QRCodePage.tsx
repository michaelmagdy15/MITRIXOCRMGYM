import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Download, Copy, CheckCheck, Wifi, Sparkles, Share, PlusSquare, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettings } from '../contexts/SettingsContext';
import { getTenantId } from '../firebase';
import { toast } from 'sonner';

export function QRCodePage() {
  const { branding } = useSettings();
  const tenantId = (typeof window !== 'undefined' ? getTenantId() : 'default').toLowerCase();
  const isInzan =
    tenantId.includes('inzan') ||
    (typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('inzan')) ||
    (branding?.companyName || '').toLowerCase().includes('inzan');

  const appDisplayName = isInzan
    ? 'INZAN Athletics'
    : branding?.companyName && !branding.companyName.toLowerCase().includes('mitrixo')
    ? branding.companyName
    : 'STRIKE';

  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://admin.inzanathletics.com';
  const defaultInstallUrl = `${defaultOrigin}/?install=1`;

  const [appUrl, setAppUrl] = useState(defaultInstallUrl);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setAppUrl(`${window.location.origin}/?install=1`);
  }, []);

  const qrLogoSrc = isInzan
    ? '/inzan-pwa-icon.png'
    : branding.logoUrl || '/strikelogo.png';

  const handleCopy = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    toast.success(`Copied ${appDisplayName} Smart PWA Install URL!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = document.getElementById('mitrixogymcrm-qr-svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const a = document.createElement('a');
      a.download = isInzan ? 'inzan-athletics-app-qr.png' : 'strike-app-qr.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  };

  const handleTestInstallerModal = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('install', '1');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.location.href = url.toString();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-primary" />
            {appDisplayName} — Smart App Install QR
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Share this QR code with members and staff. Scanning it on their phone automatically launches the forced <strong>{appDisplayName}</strong> Home Screen installer for iPhone &amp; Android.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestInstallerModal}
          className="gap-1.5 text-xs font-bold shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Preview Install Screen
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <Card className="flex flex-col items-center">
          <CardHeader className="pb-2 text-center w-full">
            <CardTitle className="text-base">Scan to Install {appDisplayName}</CardTitle>
            <CardDescription className="text-xs">Works on iPhone &amp; Android • Instant Home Screen App</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 w-full">
            {/* QR with logo overlay */}
            <div className="relative p-4 bg-white rounded-2xl shadow-lg inline-block">
              <QRCodeSVG
                id="mitrixogymcrm-qr-svg"
                value={appUrl}
                size={220}
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: qrLogoSrc,
                  height: 48,
                  width: 48,
                  excavate: true,
                }}
              />
            </div>

            {/* Home Screen Icon Preview */}
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl border bg-muted/30 w-full">
              <div className="h-11 w-11 rounded-xl bg-white p-1.5 border shadow-xs flex items-center justify-center shrink-0">
                <img src={qrLogoSrc} alt={appDisplayName} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Home Screen App Preview</p>
                <p className="text-xs font-extrabold text-foreground truncate">{appDisplayName}</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">
                Ready
              </Badge>
            </div>

            {/* Platform badges */}
            <div className="flex gap-2 flex-wrap justify-center">
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <span>🍎</span> iPhone / iPad
              </Badge>
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <span>🤖</span> Android
              </Badge>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 gap-2 text-xs" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" />
                Download PNG
              </Button>
              <Button variant="outline" className="flex-1 gap-2 text-xs" onClick={() => window.print()}>
                🖨️ Print
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instructions + URL */}
        <div className="space-y-4">
          {/* URL editor */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Smart Install URL</Label>
              <div className="flex gap-2">
                <Input
                  value={appUrl}
                  onChange={e => setAppUrl(e.target.value)}
                  className="font-mono text-xs h-9"
                />
                <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0 gap-1.5 px-3">
                  {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Includes <code className="text-foreground font-mono">?install=1</code> so any member or coach scanning the QR is immediately prompted to install <strong>{appDisplayName}</strong> on their Home Screen.
              </p>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PlatformStep
                icon="🤖"
                platform="Android"
                color="#3DDC84"
                steps={[
                  'Scan QR code with Camera app',
                  'Chrome opens the Smart App Installer',
                  `Tap "Add ${appDisplayName} to Home Screen"`,
                  `Tap Install — ${appDisplayName} is on their home screen!`,
                ]}
              />
              <PlatformStep
                icon="🍎"
                platform="iPhone / iPad"
                color="#007AFF"
                steps={[
                  'Scan QR code with Camera app',
                  'Safari opens the Smart App Installer',
                  'Tap Share → "Add to Home Screen" (or use the 1-Tap iOS Profile Installer)',
                  `Tap Add — ${appDisplayName} is on their home screen with the official icon!`,
                ]}
              />
            </CardContent>
          </Card>

          {/* Direct iOS Profile Link */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>🍎</span> Direct iOS WebClip Profile (.mobileconfig)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Pre-configured with the official <strong>{appDisplayName}</strong> icon and full-screen mode.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs font-bold gap-1.5"
                onClick={() => {
                  window.location.href = `/api/pwa/ios-profile.mobileconfig${isInzan ? '?tenant=inzanathletics' : ''}`;
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Download Profile
              </Button>
            </CardContent>
          </Card>

          {/* Tip */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 flex gap-3">
              <Wifi className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Works offline too.</strong> Once installed, the app caches itself. Members can view their profile and check-in QR even without internet.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlatformStep({ icon, platform, color, steps }: { icon: string; platform: string; color: string; steps: string[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold" style={{ color }}>{platform}</span>
      </div>
      <ol className="space-y-1 pl-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="font-bold text-foreground/60 shrink-0">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
