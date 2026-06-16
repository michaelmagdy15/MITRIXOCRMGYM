import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Download, Copy, CheckCheck, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_URL = window.location.origin;

export function QRCodePage() {
  const [appUrl, setAppUrl] = useState(DEFAULT_URL);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
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
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      const a = document.createElement('a');
      a.download = 'mitrixogymcrm-crm-qr.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Smartphone className="h-6 w-6 text-primary" />
          App Install QR Code
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Share this QR code with members and staff. Scanning it on their phone will guide them to add the app directly to their home screen — no App Store required.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <Card className="flex flex-col items-center">
          <CardHeader className="pb-2 text-center w-full">
            <CardTitle className="text-base">Scan to Install</CardTitle>
            <CardDescription className="text-xs">Works on iPhone & Android</CardDescription>
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
                  src: '/mitrixogymcrmlogo.png',
                  height: 44,
                  width: 44,
                  excavate: true,
                }}
              />
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
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">App URL</Label>
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
                Update this URL once the app is deployed publicly (e.g. your Firebase Hosting domain).
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
                  'Chrome opens the app URL',
                  '"Add to Home Screen" banner appears automatically',
                  'Tap Install — done!',
                ]}
              />
              <PlatformStep
                icon="🍎"
                platform="iPhone / iPad"
                color="#007AFF"
                steps={[
                  'Scan QR code with Camera app',
                  'Safari opens the app URL',
                  'A guide appears: tap Share → "Add to Home Screen"',
                  'Tap Add — mitrixogymcrm is on their home screen!',
                ]}
              />
            </CardContent>
          </Card>

          {/* Tip */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4 flex gap-3">
              <Wifi className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Works offline too.</strong> Once installed, the app caches itself. Members can view their profile even without internet.
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
