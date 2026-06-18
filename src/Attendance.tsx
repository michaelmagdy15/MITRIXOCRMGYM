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
import { Camera, CheckCircle, User, History, AlertCircle, MapPin, Scan, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Branch } from './types';
import { useLanguage } from './contexts/LanguageContext';

export default function Attendance({ isKiosk = false }: { isKiosk?: boolean }) {
  const { currentUser, users } = useAppContext();
  const { clients } = useClients(currentUser);
  const { attendances, recordAttendance } = useAttendance(currentUser, clients);
  const { t, language, isRtl } = useLanguage();
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

  const [kioskOverlay, setKioskOverlay] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
    subText?: string;
  }>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  const checkMemberStatus = (member: any) => {
    const isArabic = language === 'ar';
    if (member.membershipExpiry) {
      const expiry = new Date(member.membershipExpiry);
      if (expiry < new Date()) {
        const dateStr = expiry.toLocaleDateString(isArabic ? 'ar-EG' : 'en-GB');
        return { 
          valid: false, 
          reason: 'Expired', 
          message: isArabic 
            ? `انتهت صلاحية اشتراكك في ${dateStr}. يرجى التجديد عند الاستقبال.` 
            : `Membership expired on ${dateStr}. Please renew with staff.` 
        };
      }
    }
    if (member.status === 'Expired') {
      return { 
        valid: false, 
        reason: 'Expired', 
        message: isArabic 
          ? 'عضويتك منتهية الصلاحية. يرجى التجديد عند الاستقبال.' 
          : 'Membership is expired. Please renew with staff.' 
      };
    }
    if (member.status === 'Hold') {
      return { 
        valid: false, 
        reason: 'Hold', 
        message: isArabic 
          ? 'عضويتك معلقة مؤقتاً.' 
          : 'Membership is currently on hold.' 
      };
    }
    if (typeof member.sessionsRemaining === 'number' && member.sessionsRemaining <= 0) {
      return { 
        valid: false, 
        reason: 'No Sessions', 
        message: isArabic 
          ? 'نفدت جميع الجلسات المتبقية لديك. يرجى إعادة الشحن عند الاستقبال.' 
          : 'No sessions remaining. Please renew your membership with staff.' 
      };
    }
    return { 
      valid: true, 
      reason: 'Active', 
      message: isArabic 
        ? `مرحباً بك، ${member.name}!` 
        : `Welcome, ${member.name}!` 
    };
  };

  const handleScanSuccess = async (decodedId: string) => {
    const isArabic = language === 'ar';
    // Clear error
    setError(null);

    const member = clients.find(c => c.id === decodedId || c.memberId === decodedId || c.phone === decodedId);
    if (!member) {
      if (isKiosk) {
        setKioskOverlay({
          show: true,
          type: 'error',
          title: isArabic ? 'لم يتم العثور على العضو' : 'Member Not Found',
          message: isArabic 
            ? 'الرمز المدخل غير مسجل لدينا. يرجى مراجعة موظف الاستقبال.' 
            : 'Member ID or phone not found. Please see reception desk.'
        });
        setIsScanning(false);
        setTimeout(() => {
          setKioskOverlay(prev => ({ ...prev, show: false }));
          if (manualInputRef.current) manualInputRef.current.value = '';
          setIsScanning(true);
        }, 3000);
      } else {
        setError(t('attendance.no_member_found'));
      }
      return;
    }

    if (isKiosk) {
      setIsScanning(false);
      const statusCheck = checkMemberStatus(member);
      if (statusCheck.valid) {
        setIsRecording(true);
        try {
          await recordAttendance(member.id, selectedBranch);
          setKioskOverlay({
            show: true,
            type: 'success',
            title: isArabic ? 'تم تسجيل حضورك' : 'Check-in Recorded',
            message: statusCheck.message,
            subText: member.packageType ? `${isArabic ? 'الباقة:' : 'Package:'} ${member.packageType}` : ''
          });
        } catch (err: any) {
          setKioskOverlay({
            show: true,
            type: 'error',
            title: isArabic ? 'خطأ في تسجيل الحضور' : 'System Error',
            message: err instanceof Error ? err.message : 'Error recording check-in'
          });
        } finally {
          setIsRecording(false);
        }
      } else {
        setKioskOverlay({
          show: true,
          type: statusCheck.reason === 'Hold' ? 'warning' : 'error',
          title: statusCheck.reason === 'Hold' 
            ? (isArabic ? 'حسابك معلق' : 'Membership on Hold') 
            : (isArabic ? 'الاشتراك منتهٍ' : 'Membership Expired'),
          message: statusCheck.message
        });
      }

      setTimeout(() => {
        setKioskOverlay(prev => ({ ...prev, show: false }));
        if (manualInputRef.current) manualInputRef.current.value = '';
        setIsScanning(true);
      }, 3000);

    } else {
      // Normal admin checkin flow
      setLastScannedMember(member);
      setIsScanning(false);
      setError(null);
    }
  };

  const handleScanSuccessRef = useRef(handleScanSuccess);
  useEffect(() => {
    handleScanSuccessRef.current = handleScanSuccess;
  }, [handleScanSuccess, clients, selectedBranch, language]);

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
          setError(t('attendance.camera_in_use'));
        } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError(t('attendance.camera_permission_denied'));
        } else if (name === 'NotFoundError') {
          setError(t('attendance.no_camera_found'));
        } else {
          setError(t('attendance.could_not_start_camera'));
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
  }, [isScanning, t]);

  const handleRecordAttendance = async () => {
    if (!lastScannedMember || isRecording) return;
    
    setIsRecording(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await recordAttendance(lastScannedMember.id, selectedBranch);
      setSuccessMessage(t('attendance.attendance_recorded').replace('{name}', lastScannedMember.name));
      setTimeout(() => {
        setLastScannedMember(null);
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : t('attendance.failed_record_attendance'));
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('attendance.title')}</h2>
          <p className="text-muted-foreground">{t('attendance.subtitle')}</p>
        </div>
        
        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border">
          <MapPin className="h-4 w-4 text-muted-foreground mx-2" />
          <select 
            className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer pe-8"
            value={selectedBranch}
            onChange={(e) => {
              const branch = e.target.value as Branch;
              setSelectedBranch(branch);
              if (isKiosk) {
                localStorage.setItem('kioskBranch', branch);
              }
            }}
          >
            <option value="COMPLEX">COMPLEX {t('attendance.branch_suffix')}</option>
            <option value="MIVIDA">MIVIDA {t('attendance.branch_suffix')}</option>
            <option value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Scanner Section */}
        <Card className="lg:col-span-7 overflow-hidden border-2 border-primary/10 shadow-lg">
          <CardHeader className="bg-primary/5 border-b">
            <CardTitle className="flex items-center text-primary text-lg">
              <Scan className="me-2 h-5 w-5" />
              {t('attendance.live_scanner')}
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
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-white space-y-4 p-6 sm:p-8 text-center w-full h-full min-h-[300px] sm:min-h-[380px]">
                <div className="bg-white/10 p-5 sm:p-6 rounded-full animate-pulse">
                  <Camera className="h-10 w-10 sm:h-12 sm:w-12" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold">{t('attendance.ready_to_scan')}</h3>
                  <p className="text-white/60 text-xs sm:text-sm max-w-[280px] mt-2 mx-auto">
                    {t('attendance.point_camera')}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-white/90 font-bold px-8 mt-2"
                  onClick={() => setIsScanning(true)}
                >
                  {t('attendance.start_camera')}
                </Button>
              </div>
            )}
          </CardContent>
          
          <div className="bg-muted/30 p-6 border-t">
            <div className="flex flex-col space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground ml-1">{t('attendance.manual_entry')}</Label>
              <div className="flex gap-2">
                <Input
                  ref={manualInputRef}
                  placeholder={t('attendance.enter_member_id')}
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
                  {t('attendance.find_member')}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic ml-1">
                {t('attendance.hint')}
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
                <Badge className="w-fit mb-2 bg-green-500 hover:bg-green-600">{t('attendance.scan_successful')}</Badge>
                <CardTitle className="text-2xl">{lastScannedMember.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.member_id')}</Label>
                    <p className="font-mono text-sm">#{lastScannedMember.memberId || lastScannedMember.id.substring(0, 8)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.status')}</Label>
                    <div>
                      <Badge variant={lastScannedMember.status === 'Active' ? 'secondary' : 'destructive'} className="text-[10px]">
                        {lastScannedMember.status === 'Active' ? t('members.tabs.active') : lastScannedMember.status === 'Hold' ? t('members.tabs.hold') : lastScannedMember.status === 'Expired' ? t('members.tabs.expired') : lastScannedMember.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.package')}</Label>
                    <p className="text-sm font-medium truncate">{lastScannedMember.packageType || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.packages_left')}</Label>
                    {lastScannedMember.sessionsRemaining === 'unlimited' ? (
                      <p className="text-lg font-bold text-emerald-600">∞ {t('attendance.unlimited')}</p>
                    ) : (
                      <p className={`text-lg font-bold ${Number(lastScannedMember.sessionsRemaining) <= 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {lastScannedMember.sessionsRemaining} {t('attendance.packages_unit')}
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
                    {isRecording ? t('attendance.recording') : t('attendance.confirm_attendance')}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      setLastScannedMember(null);
                      setError(null);
                    }}
                  >
                    {t('attendance.dismiss_clear')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed bg-muted/30">
              <CardContent className="h-[300px] flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <User className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium">{t('attendance.no_member_selected')}</p>
                <p className="text-xs mt-1">{t('attendance.profile_will_appear')}</p>
              </CardContent>
            </Card>
          )}

          {/* Recent History Preview */}
          {!isKiosk && (
            <Card>
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-bold flex items-center">
                  <History className="me-2 h-4 w-4" />
                  {t('attendance.todays_attendance')}
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
                            <p className="text-sm font-bold">{client?.name || t('attendance.unknown')}</p>
                            <p className="text-[10px] text-muted-foreground flex items-center">
                              <MapPin className="h-3 w-3 me-1" /> {a.branch} · {format(parseISO(a.date), 'h:mm a')}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 opacity-70">
                            {t('attendance.by')} {recorder?.name?.split(' ')[0] || 'Admin'}
                          </Badge>
                        </div>
                      );
                    })}
                  {attendances.filter(a => parseISO(a.date).toDateString() === new Date().toDateString()).length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-xs italic">
                      {t('attendance.no_records')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Kiosk Mode Fullscreen Overlay */}
      {isKiosk && kioskOverlay.show && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300 backdrop-blur-2xl ${
          kioskOverlay.type === 'success' 
            ? 'bg-emerald-950/95 text-white' 
            : kioskOverlay.type === 'warning' 
              ? 'bg-amber-950/95 text-white' 
              : 'bg-rose-950/95 text-white'
        }`}>
          <div className={`p-8 rounded-full mb-6 border-4 animate-bounce ${
            kioskOverlay.type === 'success' 
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
              : kioskOverlay.type === 'warning' 
                ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                : 'bg-rose-500/20 border-rose-500 text-rose-400'
          }`}>
            {kioskOverlay.type === 'success' && <CheckCircle className="h-24 w-24" />}
            {kioskOverlay.type === 'warning' && <AlertCircle className="h-24 w-24" />}
            {kioskOverlay.type === 'error' && <XCircle className="h-24 w-24" />}
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-black mb-4 font-sans tracking-tight uppercase">
            {kioskOverlay.title}
          </h1>
          <p className="text-lg sm:text-2xl font-medium text-white/80 max-w-2xl leading-relaxed font-sans">
            {kioskOverlay.message}
          </p>
          {kioskOverlay.subText && (
            <p className="text-sm sm:text-lg font-bold text-white/60 mt-4 font-sans">
              {kioskOverlay.subText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
