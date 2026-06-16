import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAppContext } from './context';
import { useClients } from './hooks/useClients';
import { useAttendance } from './hooks/useAttendance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Camera, CheckCircle, User, History, AlertCircle, MapPin, Scan } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Branch } from './types';

export default function Attendance({ isKiosk = false }: { isKiosk?: boolean }) {
  const { currentUser, users } = useAppContext();
  const { clients } = useClients(currentUser);
  const { attendances, recordAttendance } = useAttendance(currentUser, clients);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch>(() => {
    if (isKiosk) {
      const saved = localStorage.getItem('kioskBranch');
      if (saved) return saved as Branch;
    }
    return 'COMPLEX';
  });
  const [lastScannedMember, setLastScannedMember] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleScanSuccess = (decodedId: string) => {
    const member = clients.find(c => c.id === decodedId || c.memberId === decodedId);
    if (member) {
      setLastScannedMember(member);
      setIsScanning(false);
      setError(null);
    } else {
      setError("No member found with that ID or QR Code.");
    }
  };

  const handleScanSuccessRef = useRef(handleScanSuccess);
  useEffect(() => {
    handleScanSuccessRef.current = handleScanSuccess;
  }, [handleScanSuccess]);

  // Press "/" anywhere to jump to the manual ID input (skip if already in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      manualInputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!isScanning) return;

    let isComponentMounted = true;
    let scannerStarted = false; // only true after .start() resolves — guards cleanup
    let scanner: Html5Qrcode | null = null;

    const config = {
      fps: 10,
      qrbox: (w: number, h: number) => {
        const side = Math.min(Math.floor(Math.min(w, h) * 0.7), 280);
        return { width: side, height: side };
      },
    };

    const onScan = (decodedText: string) => {
      if (isComponentMounted) handleScanSuccessRef.current(decodedText);
    };

    const safeDestroy = (s: Html5Qrcode | null) => {
      if (!s) return;
      // clear() removes internal DOM + cancels polling timers even when start() failed
      try { s.clear(); } catch { /* ignore if already destroyed */ }
    };

    // Delay 50 ms so React has committed #qr-reader to the DOM
    const timer = setTimeout(async () => {
      try {
        scanner = new Html5Qrcode('qr-reader', { verbose: false });
        scannerRef.current = scanner;

        try {
          // Prefer rear camera
          await scanner.start({ facingMode: 'environment' }, config, onScan, undefined);
        } catch (envErr: unknown) {
          const errName = (envErr as { name?: string })?.name ?? '';
          // Only retry on constraint errors (no rear cam). NotReadableError = hardware busy,
          // retrying won't help and reusing the same instance breaks internal state.
          if (errName === 'OverconstrainedError' || errName === 'NotFoundError') {
            safeDestroy(scanner);
            scanner = new Html5Qrcode('qr-reader', { verbose: false });
            scannerRef.current = scanner;
            await scanner.start({ facingMode: 'user' }, config, onScan, undefined);
          } else {
            throw envErr;
          }
        }

        scannerStarted = true;
      } catch (err: unknown) {
        console.error(err);
        // Always destroy to stop internal polling timers
        safeDestroy(scanner);
        scannerRef.current = null;
        scanner = null;

        if (!isComponentMounted) return;
        const name = (err as { name?: string })?.name ?? '';
        const msg  = (err as { message?: string })?.message ?? '';
        if (name === 'NotReadableError' || msg.includes('Could not start')) {
          setError('Camera is in use by another app or browser tab. Close it and try again.');
        } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Camera permission denied. Allow camera access in your browser settings and try again.');
        } else if (name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError('Could not start camera. Please try again.');
        }
        setIsScanning(false);
      }
    }, 50);

    return () => {
      isComponentMounted = false;
      clearTimeout(timer);
      if (scanner && scannerStarted) {
        // stop() then clear() for a clean teardown
        scanner.stop().catch(console.error).finally(() => safeDestroy(scanner));
      } else {
        // start() never succeeded — just destroy to cancel any stray timers
        safeDestroy(scanner);
      }
      scannerRef.current = null;
    };
  }, [isScanning]);

  const handleRecordAttendance = async () => {
    if (!lastScannedMember || isRecording) return;
    
    setIsRecording(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await recordAttendance(lastScannedMember.id, selectedBranch);
      setSuccessMessage(`Attendance recorded for ${lastScannedMember.name}!`);
      setTimeout(() => {
        setLastScannedMember(null);
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to record attendance. Please try again.");
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Attendance Scanner</h2>
          <p className="text-muted-foreground">Scan member QR codes to record attendance and manage packages.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border">
          <MapPin className="h-4 w-4 text-muted-foreground ml-2" />
          <select 
            className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer pr-8"
            value={selectedBranch}
            onChange={(e) => {
              const branch = e.target.value as Branch;
              setSelectedBranch(branch);
              if (isKiosk) {
                localStorage.setItem('kioskBranch', branch);
              }
            }}
          >
            <option value="COMPLEX">COMPLEX Branch</option>
            <option value="MIVIDA">MIVIDA Branch</option>
            <option value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Scanner Section */}
        <Card className="lg:col-span-7 overflow-hidden border-2 border-primary/10 shadow-lg">
          <CardHeader className="bg-primary/5 border-b">
            <CardTitle className="flex items-center text-primary text-lg">
              <Scan className="mr-2 h-5 w-5" />
              Live Scanner
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative bg-black min-h-[300px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
            {isScanning ? (
              <>
                <div
                  id="qr-reader"
                  className="w-full min-h-[300px] sm:min-h-[380px]"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute bottom-4 right-4 z-10 shadow-lg"
                  onClick={() => setIsScanning(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-white space-y-4 p-6 sm:p-8 text-center w-full h-full min-h-[300px] sm:min-h-[380px]">
                <div className="bg-white/10 p-5 sm:p-6 rounded-full animate-pulse">
                  <Camera className="h-10 w-10 sm:h-12 sm:w-12" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold">Ready to Scan</h3>
                  <p className="text-white/60 text-xs sm:text-sm max-w-[280px] mt-2 mx-auto">
                    Point your camera at the member's QR code on their phone or card.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-white/90 font-bold px-8 mt-2"
                  onClick={() => setIsScanning(true)}
                >
                  Start Camera
                </Button>
              </div>
            )}
          </CardContent>
          
          <div className="bg-muted/30 p-6 border-t">
            <div className="flex flex-col space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground ml-1">Manual ID Entry</Label>
              <div className="flex gap-2">
                <Input
                  ref={manualInputRef}
                  placeholder="Enter Member ID (e.g. 112)  [ Press / to focus ]"
                  className="bg-background h-11"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleScanSuccess(e.currentTarget.value);
                  }}
                />
                <Button 
                  variant="secondary" 
                  className="h-11 px-6 font-bold"
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    handleScanSuccess(input.value);
                  }}
                >
                  Find Member
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic ml-1">
                Enter either the readable Member ID or the system unique identifier.
              </p>
            </div>
          </div>
        </Card>

        {/* Member Info / Result Section */}
        <div className="lg:col-span-5 space-y-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <p className="text-sm font-medium">{successMessage}</p>
            </div>
          )}

          {lastScannedMember ? (
            <Card className="border-2 border-green-500/20 shadow-xl animate-in zoom-in-95 duration-200">
              <CardHeader className="pb-2">
                <Badge className="w-fit mb-2 bg-green-500 hover:bg-green-600">Scan Successful</Badge>
                <CardTitle className="text-2xl">{lastScannedMember.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Member ID</Label>
                    <p className="font-mono text-sm">#{lastScannedMember.memberId || lastScannedMember.id.substring(0, 8)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Status</Label>
                    <div>
                      <Badge variant={lastScannedMember.status === 'Active' ? 'secondary' : 'destructive'} className="text-[10px]">
                        {lastScannedMember.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Package</Label>
                    <p className="text-sm font-medium truncate">{lastScannedMember.packageType || 'None'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Packages Left</Label>
                    {lastScannedMember.sessionsRemaining === 'unlimited' ? (
                      <p className="text-lg font-bold text-emerald-600">∞ Unlimited</p>
                    ) : (
                      <p className={`text-lg font-bold ${Number(lastScannedMember.sessionsRemaining) <= 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {lastScannedMember.sessionsRemaining} packages
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <Button 
                    className="w-full py-6 text-lg font-bold shadow-lg"
                    onClick={handleRecordAttendance}
                    disabled={isRecording}
                  >
                    {isRecording ? "Recording..." : "Confirm Attendance"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      setLastScannedMember(null);
                                    setError(null);
                    }}
                  >
                    Dismiss & Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed bg-muted/30">
              <CardContent className="h-[300px] flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <User className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium">No Member Selected</p>
                <p className="text-xs mt-1">The member's profile will appear here once their QR code is successfully scanned.</p>
              </CardContent>
            </Card>
          )}

          {/* Recent History Preview */}
          {!isKiosk && (
            <Card>
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-bold flex items-center">
                  <History className="mr-2 h-4 w-4" />
                  Today's Attendance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[250px] overflow-y-auto">
                  {attendances
                    .filter(a => parseISO(a.date).toDateString() === new Date().toDateString())
                    .map(a => {
                      const client = clients.find(c => c.id === a.clientId);
                      const recorder = users.find(u => u.id === a.recordedBy);
                      return (
                        <div key={a.id} className="p-3 border-b last:border-0 flex items-center justify-between hover:bg-muted/30 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold">{client?.name || 'Unknown'}</p>
                            <p className="text-[10px] text-muted-foreground flex items-center">
                              <MapPin className="h-3 w-3 mr-1" /> {a.branch} · {format(parseISO(a.date), 'h:mm a')}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 opacity-70">
                            by {recorder?.name?.split(' ')[0] || 'Admin'}
                          </Badge>
                        </div>
                      );
                    })}
                  {attendances.filter(a => parseISO(a.date).toDateString() === new Date().toDateString()).length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-xs italic">
                      No attendance records for today yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
